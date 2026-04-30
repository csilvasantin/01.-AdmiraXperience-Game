// admira-tunes — Suno-compatible audio generation proxy.
//
// Endpoints:
//   GET  /health                       -> { ok, configured, model }
//   POST /suno/generate                -> { taskId } | { error }
//      body: { brand, title, lyrics[], style, instrumental, length }
//   GET  /suno/status?id=<taskId>      -> { status: 'pending'|'ready'|'error',
//                                            audioUrl?, imageUrl?, error?, raw? }
//
// Configure with `wrangler secret put SUNO_API_KEY` once. Without it, the
// worker returns 503 "not_configured" so the front-end can show a friendly
// "Suno no está disponible · pide al admin que añada SUNO_API_KEY" message.
//
// Suno-API schema targeted (sunoapi.org / apibox.erweima.ai):
//   POST /api/v1/generate
//     { customMode, instrumental, model, style, title, prompt, callBackUrl }
//   GET  /api/v1/generate/record-info?taskId=...
//     -> { code, msg, data: { status, response: { sunoData: [...] } } }

const DEFAULT_ALLOWED_ORIGINS = [
  'https://csilvasantin.github.io',
  'http://localhost:9124',
  'http://127.0.0.1:9124',
  'http://localhost:5173',
];

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .concat(DEFAULT_ALLOWED_ORIGINS);
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(request, env, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
async function readBody(request) { try { return await request.json(); } catch { return {}; } }

function configured(env) { return Boolean(env.SUNO_API_KEY); }
function sunoBase(env)   { return String(env.SUNO_API_BASE || 'https://apibox.erweima.ai/api/v1').replace(/\/$/, ''); }
function sunoModel(env)  { return String(env.SUNO_MODEL || 'V4_5'); }

function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }

async function handleHealth(request, env) {
  return json(request, env, 200, {
    ok: true,
    configured: configured(env),
    base: sunoBase(env),
    model: sunoModel(env),
    ts: Math.floor(Date.now() / 1000),
  });
}

async function handleGenerate(request, env) {
  if (!configured(env)) {
    return json(request, env, 503, {
      error: 'not_configured',
      message: 'SUNO_API_KEY no está configurada en el worker. Añádela con `wrangler secret put SUNO_API_KEY` para habilitar la generación de audio con Suno.',
    });
  }
  const body = await readBody(request);
  const brand        = clip(body.brand, 64);
  const title        = clip(body.title, 80) || (brand ? brand + ' Anthem' : 'Untitled');
  const style        = clip(body.style, 200) || 'modern jingle, energetic, professional';
  const instrumental = !!body.instrumental;
  const lyricsArr    = Array.isArray(body.lyrics) ? body.lyrics : [];
  const lyrics       = clip(lyricsArr.join('\n'), 3000);
  if (!instrumental && !lyrics) {
    return json(request, env, 400, { error: 'missing_lyrics', message: 'Faltan letras (lyrics) salvo que pidas instrumental.' });
  }

  const payload = {
    customMode: true,
    instrumental,
    model: sunoModel(env),
    style,
    title,
    prompt: instrumental ? '' : lyrics,
    callBackUrl: 'https://example.invalid/no-callback',
  };
  let upstream;
  try {
    upstream = await fetch(sunoBase(env) + '/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.SUNO_API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json(request, env, 502, { error: 'upstream_unreachable', message: String(err && err.message || err) });
  }
  let data = null;
  try { data = await upstream.json(); } catch {}
  if (!upstream.ok || !data) {
    return json(request, env, upstream.status || 502, { error: 'upstream_error', status: upstream.status, raw: data });
  }
  // sunoapi.org returns { code, msg, data: { taskId } }
  const taskId = (data && data.data && (data.data.taskId || data.data.task_id)) || data.taskId || null;
  if (!taskId) {
    return json(request, env, 502, { error: 'no_task_id', raw: data });
  }
  return json(request, env, 200, { taskId, raw: data });
}

async function handleStatus(request, env) {
  if (!configured(env)) {
    return json(request, env, 503, { error: 'not_configured' });
  }
  const url = new URL(request.url);
  const taskId = url.searchParams.get('id') || url.searchParams.get('taskId');
  if (!taskId) return json(request, env, 400, { error: 'missing_id' });

  let upstream;
  try {
    upstream = await fetch(sunoBase(env) + '/generate/record-info?taskId=' + encodeURIComponent(taskId), {
      headers: { 'Authorization': 'Bearer ' + env.SUNO_API_KEY },
    });
  } catch (err) {
    return json(request, env, 502, { error: 'upstream_unreachable', message: String(err && err.message || err) });
  }
  let data = null;
  try { data = await upstream.json(); } catch {}
  if (!upstream.ok || !data) {
    return json(request, env, upstream.status || 502, { error: 'upstream_error', status: upstream.status, raw: data });
  }

  // Map provider statuses → ours.
  // sunoapi.org "status" is one of: PENDING, TEXT_SUCCESS, FIRST_SUCCESS, SUCCESS, CREATE_TASK_FAILED, GENERATE_AUDIO_FAILED, ...
  const inner   = data.data || {};
  const status  = String(inner.status || '').toUpperCase();
  const sunoArr = (inner.response && inner.response.sunoData) || inner.sunoData || [];
  const first   = sunoArr[0] || null;
  const done    = ['SUCCESS', 'FIRST_SUCCESS'].includes(status);
  const failed  = status.endsWith('FAILED') || /ERROR/i.test(status);
  return json(request, env, 200, {
    status: done ? 'ready' : (failed ? 'error' : 'pending'),
    providerStatus: status,
    audioUrl: first ? (first.audioUrl || first.audio_url || null) : null,
    imageUrl: first ? (first.imageUrl || first.image_url || null) : null,
    streamAudioUrl: first ? (first.streamAudioUrl || first.stream_audio_url || null) : null,
    title: first ? (first.title || null) : null,
    duration: first ? (first.duration || null) : null,
    error: failed ? (data.msg || status) : null,
    raw: data,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET'  && path === '/health')        return await handleHealth(request, env);
      if (request.method === 'POST' && path === '/suno/generate') return await handleGenerate(request, env);
      if (request.method === 'GET'  && path === '/suno/status')   return await handleStatus(request, env);
      return json(request, env, 404, { error: 'not_found', path });
    } catch (err) {
      return json(request, env, 500, { error: 'server_error', message: String(err && err.message || err) });
    }
  },
};
