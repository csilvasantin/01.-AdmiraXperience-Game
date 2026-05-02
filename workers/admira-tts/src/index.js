// admira-tts — Text-to-speech proxy del Xpace OS
// Endpoints:
//   GET  /health             → { ok, hasKey, voice, model }
//   POST /tts/elevenlabs     → audio/mpeg binario
//     body: { text: string, voiceId?: string }
//
// Coste: ElevenLabs es DE PAGO (~$0.30 / 1k chars en planes Creator). El
// frontend ya muestra aviso explícito antes de invocar este endpoint.
//
// Setup:
//   wrangler secret put ELEVENLABS_API_KEY --config workers/admira-tts/wrangler.toml
//   wrangler deploy --config workers/admira-tts/wrangler.toml

const DEFAULT_ALLOWED_ORIGINS = [
  'https://csilvasantin.github.io',
  'http://localhost:9124',
  'http://127.0.0.1:9124',
  'http://localhost:9126',
  'http://127.0.0.1:9126',
];

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
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

function jsonResponse(request, env, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === '/health') {
      return jsonResponse(request, env, 200, {
        ok: true,
        hasKey: !!env.ELEVENLABS_API_KEY,
        voice: env.ELEVENLABS_DEFAULT_VOICE || null,
        model: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      });
    }

    if (url.pathname === '/tts/elevenlabs' && request.method === 'POST') {
      if (!env.ELEVENLABS_API_KEY) {
        return jsonResponse(request, env, 503, {
          ok: false,
          error: 'missing_secret',
          message: 'ELEVENLABS_API_KEY no configurado en este worker',
        });
      }
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const text = String(body.text || '').slice(0, 1500).trim();
      if (!text) {
        return jsonResponse(request, env, 400, { ok: false, message: 'text vacío' });
      }
      const voiceId = String(body.voiceId || env.ELEVENLABS_DEFAULT_VOICE || 'EXAVITQu4vr4xnSDxMaL');
      const model = String(body.model || env.ELEVENLABS_MODEL || 'eleven_multilingual_v2');
      const baseUrl = String(env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');

      const upstream = await fetch(`${baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
        }),
      });

      if (!upstream.ok) {
        let detail = '';
        try { detail = await upstream.text(); } catch (e) {}
        return jsonResponse(request, env, upstream.status, {
          ok: false,
          error: 'upstream_error',
          status: upstream.status,
          message: detail.slice(0, 400) || ('ElevenLabs HTTP ' + upstream.status),
        });
      }

      const audio = await upstream.arrayBuffer();
      return new Response(audio, {
        status: 200,
        headers: {
          ...corsHeaders(request, env),
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-store',
        },
      });
    }

    return jsonResponse(request, env, 404, { ok: false, message: 'Not found' });
  },
};
