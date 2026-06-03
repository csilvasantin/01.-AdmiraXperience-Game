// OmniPublicity — backend para el catálogo de gemelos digitales.
// Endpoints:
//   GET  /health               -> { ok:true }
//   GET  /locations            -> { locations:[...], updatedAt, source:'kv'|'default' }
//   PUT  /locations            -> guarda array completo (Authorization: Bearer ADMIN_TOKEN)
//                                  body: { locations:[...] }  o  array directo
//                                  resp: { ok:true, count, updatedAt }
//
// Storage: KV binding OMNIP_KV, key 'locations.v1' (JSON {locations, updatedAt}).
// Auth: header Authorization: Bearer <ADMIN_TOKEN secret>.

const KV_KEY = 'locations.v1';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://csilvasantin.github.io',
  'https://carlossilva.info',
  'https://www.carlossilva.info',
  'https://admira.app',
  'https://www.admira.app',
  'https://digitalavatar.pages.dev',
  'https://digitalavatar.ai',
  'https://www.digitalavatar.ai',
  'http://digitalavatar.ai',
  'http://www.digitalavatar.ai',
  'http://localhost:9124',
  'http://127.0.0.1:9124',
  'http://localhost:8085',
  'http://127.0.0.1:8085',
  'http://localhost:8799',
  'http://127.0.0.1:8799',
];

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .concat(DEFAULT_ALLOWED_ORIGINS);
}

// Cualquier localhost/127.0.0.1 (cualquier puerto) para desarrollo/preview.
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Subdominios de preview de Cloudflare Pages: <hash>.digitalavatar.pages.dev
const PAGES_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?digitalavatar\.pages\.dev$/;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const allowOrigin = (allowed.includes(origin) || LOCAL_ORIGIN_RE.test(origin) || PAGES_ORIGIN_RE.test(origin)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
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

function now() { return Math.floor(Date.now() / 1000); }

function isValidLocation(loc) {
  if (!loc || typeof loc !== 'object') return false;
  if (typeof loc.id !== 'string' || !loc.id.trim()) return false;
  if (typeof loc.name !== 'string' || !loc.name.trim()) return false;
  if (!Array.isArray(loc.coords) || loc.coords.length !== 2) return false;
  const [lng, lat] = loc.coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return false;
  if (!Array.isArray(loc.surfaces)) return false;
  return true;
}

async function handleGetLocations(request, env) {
  let stored = null;
  try {
    const raw = await env.OMNIP_KV.get(KV_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) {
    // KV miss / parse error → fallback al default vacío (cliente cae a su default bundled)
  }
  if (stored && Array.isArray(stored.locations) && stored.locations.length) {
    return json(request, env, 200, {
      locations: stored.locations,
      updatedAt: stored.updatedAt || null,
      source: 'kv',
    });
  }
  return json(request, env, 200, { locations: [], updatedAt: null, source: 'default' });
}

async function handlePutLocations(request, env) {
  const expected = String(env.ADMIN_TOKEN || '').trim();
  if (!expected) return json(request, env, 503, { error: 'admin_token_not_set' });
  const auth = String(request.headers.get('Authorization') || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const provided = m ? m[1].trim() : '';
  if (provided !== expected) return json(request, env, 401, { error: 'invalid_token' });

  let body;
  try { body = await request.json(); } catch { return json(request, env, 400, { error: 'invalid_json' }); }
  const arr = Array.isArray(body) ? body : (Array.isArray(body && body.locations) ? body.locations : null);
  if (!arr) return json(request, env, 400, { error: 'expected_array_or_object_with_locations' });
  if (!arr.length) return json(request, env, 400, { error: 'empty_array' });
  if (arr.length > 500) return json(request, env, 400, { error: 'too_many_locations', max: 500 });

  const ids = new Set();
  for (let i = 0; i < arr.length; i++) {
    const loc = arr[i];
    if (!isValidLocation(loc)) {
      return json(request, env, 400, { error: 'invalid_location', index: i });
    }
    if (ids.has(loc.id)) {
      return json(request, env, 400, { error: 'duplicate_id', id: loc.id });
    }
    ids.add(loc.id);
  }

  const payload = { locations: arr, updatedAt: now() };
  await env.OMNIP_KV.put(KV_KEY, JSON.stringify(payload));
  return json(request, env, 200, { ok: true, count: arr.length, updatedAt: payload.updatedAt });
}

// Alta de miembro de equipo en un punto. Append-only y acotado (sin admin
// token: lo llama el gemelo cliente; es dato de demo, validado y con tope).
const EMPLOYEE_ROLES = ['cajero', 'repositor', 'azafata', 'manager', 'dj'];
async function handleAddEmployee(request, env, id) {
  let body;
  try { body = await request.json(); } catch { return json(request, env, 400, { error: 'invalid_json' }); }
  const name = String(body && body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return json(request, env, 400, { error: 'missing_name' });
  let role = String(body && body.role || 'cajero').trim().toLowerCase();
  if (!EMPLOYEE_ROLES.includes(role)) role = 'cajero';

  let stored = null;
  try { const raw = await env.OMNIP_KV.get(KV_KEY); if (raw) stored = JSON.parse(raw); } catch {}
  if (!stored || !Array.isArray(stored.locations)) return json(request, env, 404, { error: 'no_catalog' });
  const loc = stored.locations.find(l => l && String(l.id).toLowerCase() === String(id).toLowerCase());
  if (!loc) return json(request, env, 404, { error: 'location_not_found', id });
  if (!Array.isArray(loc.employees)) loc.employees = [];
  if (loc.employees.length >= 20) return json(request, env, 400, { error: 'too_many_employees', max: 20 });
  if (loc.employees.some(e => e && String(e.name).toLowerCase() === name.toLowerCase())) {
    return json(request, env, 200, { ok: true, duplicate: true, employee: { name, role }, employees: loc.employees });
  }
  // `since` = antigüedad: fecha y hora de contratación (ISO).
  const since = new Date().toISOString();
  const emp = { name, role, since };
  loc.employees.push(emp);
  stored.updatedAt = now();
  await env.OMNIP_KV.put(KV_KEY, JSON.stringify(stored));
  return json(request, env, 200, { ok: true, employee: emp, employees: loc.employees });
}

// Baja de miembro de equipo (quita por nombre). Append/remove acotado, sin
// admin token (dato de demo), igual que el alta.
async function handleRemoveEmployee(request, env, id) {
  let body; try { body = await request.json(); } catch { body = {}; }
  const name = String(body && body.name || '').replace(/\s+/g, ' ').trim();
  if (!name) return json(request, env, 400, { error: 'missing_name' });
  let stored = null;
  try { const raw = await env.OMNIP_KV.get(KV_KEY); if (raw) stored = JSON.parse(raw); } catch {}
  if (!stored || !Array.isArray(stored.locations)) return json(request, env, 404, { error: 'no_catalog' });
  const loc = stored.locations.find(l => l && String(l.id).toLowerCase() === String(id).toLowerCase());
  if (!loc) return json(request, env, 404, { error: 'location_not_found', id });
  const before = Array.isArray(loc.employees) ? loc.employees.length : 0;
  loc.employees = (loc.employees || []).filter(e => !(e && String(e.name).toLowerCase() === name.toLowerCase()));
  const removed = before - loc.employees.length;
  if (removed > 0) { stored.updatedAt = now(); await env.OMNIP_KV.put(KV_KEY, JSON.stringify(stored)); }
  return json(request, env, 200, { ok: true, removed, employees: loc.employees });
}

// ── MetaHuman (asistente IA de la tienda) ───────────────────────────────────
// Reúne el contexto real del punto (mismo KV) + el cerebro Grok (xAI) + la voz
// ElevenLabs (worker admira-tts). Lo consume el gemelo hiperrealista de Unreal:
// POST /metahuman/ask { loc, question, lang?, voice? } → { ok, answer, audioBase64?, mime? }
// El avatar reproduce el audio y lo enchufa a Audio2Face para el lip-sync.
const TTS_URL = 'https://admira-tts.csilvasantin.workers.dev/tts/elevenlabs';
const ROLE_ES = { cajero: 'cajero/a', repositor: 'repositor/a', azafata: 'azafata/host', manager: 'store manager', dj: 'DJ' };

function fmtSince(iso) {
  if (!iso) return '';
  try { const d = new Date(iso); if (isNaN(d)) return ''; return d.toISOString().slice(0, 10); } catch { return ''; }
}

function buildStoreContext(loc, lang) {
  if (!loc) return 'Tienda Admira XP (sin datos del punto).';
  const screens = Number.isFinite(loc.screens) ? loc.screens
    : (Array.isArray(loc.surfaces) ? loc.surfaces.filter(s => s && (s.surface === 'pantalla' || s.surface === 'escaparate')).length : 0);
  const emp = Array.isArray(loc.employees) ? loc.employees : [];
  const team = emp.length
    ? emp.map(e => {
        const since = fmtSince(e && e.since);
        return `${e.name} (${ROLE_ES[e && e.role] || e && e.role || 'equipo'}${since ? `, desde ${since}` : ''})`;
      }).join('; ')
    : 'sin equipo registrado';
  return [
    `Tienda: ${loc.name || loc.id}${loc.addr ? ` · ${loc.addr}` : ''}.`,
    `Tipo: ${loc.kind || 'estanco Xtanco'}.`,
    `Pantallas de digital signage: ${screens}. Hilo musical: ${loc.music || 'sin definir'}. Cámaras: ${loc.cameras === false ? 'no' : 'sí'}.`,
    `Equipo del punto: ${team}.`,
  ].join(' ');
}

async function callGrok(env, system, user) {
  const key = String(env.XAI_API_KEY || env.GROK_API_KEY || '').trim();
  if (!key) return { error: 'xai_key_not_set' };
  const model = String(env.XAI_MODEL || 'grok-4.20-beta-latest-non-reasoning');
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.6,
      max_tokens: 220,
    }),
  });
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  if (!res.ok || !j) {
    const detail = (j && j.error && (j.error.message || j.error)) || String(txt).slice(0, 400);
    return { error: `xai_http_${res.status}`, detail, model };
  }
  const answer = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!answer) return { error: 'xai_no_answer' };
  return { answer: String(answer).trim() };
}

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah (multilingüe); override con secret ELEVENLABS_VOICE_ID
function bufToBase64(buf) {
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
async function ttsBase64(env, text) {
  const clean = String(text).slice(0, 1200);
  // 1) ElevenLabs directo (voz premium; la misma que alimentará Audio2Face en Unreal).
  const key = String(env.ELEVENLABS_API_KEY || '').trim();
  if (key) {
    try {
      const voice = String(env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID);
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text: clean,
          model_id: String(env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'),
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (res.ok) return { b64: bufToBase64(await res.arrayBuffer()) };
      const t = await res.text();
      return { err: `elevenlabs_http_${res.status}: ${String(t).slice(0, 220)}`, voice };
    } catch (e) { return { err: 'elevenlabs_exception: ' + (e && e.message || e) }; }
  }
  // 2) Fallback: worker admira-tts (si vuelve a estar operativo).
  try {
    const res = await fetch(TTS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean }),
    });
    if (res.ok) return { b64: bufToBase64(await res.arrayBuffer()) };
  } catch {}
  return { err: 'no_elevenlabs_key_and_admira_tts_down' };
}

async function handleMetahumanAsk(request, env) {
  let body;
  try { body = await request.json(); } catch { return json(request, env, 400, { error: 'invalid_json' }); }
  const id = String(body && body.loc || '').trim();
  const question = String(body && body.question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const lang = String(body && body.lang || 'es').trim().toLowerCase().startsWith('en') ? 'en' : 'es';
  const wantVoice = body && body.voice !== false; // por defecto sí
  if (!question) return json(request, env, 400, { error: 'missing_question' });

  let loc = null;
  if (id) {
    try {
      const raw = await env.OMNIP_KV.get(KV_KEY);
      if (raw) { const stored = JSON.parse(raw); loc = (stored.locations || []).find(l => l && String(l.id).toLowerCase() === id.toLowerCase()) || null; }
    } catch {}
  }
  const context = buildStoreContext(loc, lang);
  const system = (lang === 'en'
    ? `You are the in-store AI assistant (a hyperrealistic MetaHuman avatar) of an Admira XP tobacco/retail shop. Be warm, brief and helpful like a great shop clerk. Speak naturally — your text will be spoken aloud, so 1-3 short sentences, no markdown or lists. You KNOW this store and its team:\n`
    : `Eres el asistente de IA en tienda (un avatar MetaHuman hiperrealista) de una tienda Admira XP (estanco/retail). Sé cercano, breve y útil como un buen dependiente. Habla de forma natural — tu texto se dirá en voz alta, así que 1-3 frases cortas, sin markdown ni listas. CONOCES esta tienda y a su equipo:\n`)
    + context;

  const g = await callGrok(env, system, question);
  if (g.error) return json(request, env, g.error === 'xai_key_not_set' ? 503 : 502, { ok: false, error: g.error, detail: g.detail, context });
  const out = { ok: true, answer: g.answer, loc: id || null };
  if (wantVoice) {
    const tts = await ttsBase64(env, g.answer);
    if (tts && tts.b64) { out.audioBase64 = tts.b64; out.mime = 'audio/mpeg'; }
    else out.voiceNote = (tts && tts.err) || 'tts_unavailable';
  }
  return json(request, env, 200, out);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' && path === '/health')    return json(request, env, 200, { ok: true, ts: now() });
      if (request.method === 'GET' && path === '/locations') return await handleGetLocations(request, env);
      if (request.method === 'PUT' && path === '/locations') return await handlePutLocations(request, env);
      const mEmpRm = path.match(/^\/location\/([^/]+)\/employee\/remove$/);
      if (request.method === 'POST' && mEmpRm) return await handleRemoveEmployee(request, env, decodeURIComponent(mEmpRm[1]));
      const mEmp = path.match(/^\/location\/([^/]+)\/employee$/);
      if (request.method === 'POST' && mEmp) return await handleAddEmployee(request, env, decodeURIComponent(mEmp[1]));
      if (request.method === 'POST' && path === '/metahuman/ask') return await handleMetahumanAsk(request, env);
      return json(request, env, 404, { error: 'not_found', path });
    } catch (err) {
      return json(request, env, 500, { error: 'server_error', message: String(err && err.message || err) });
    }
  },
};
