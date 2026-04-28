// admira-grok-proxy
// Endpoint: POST /grok/ask  →  { ok, text, model, usage }
//
// Provider auto-pick:
//   1. GEMINI_API_KEY set → Google Gemini (free tier, default)
//   2. XAI_API_KEY    set → xAI Grok (paid, fallback for parity)
//
// Frontend keeps calling /grok/ask with the same shape; the worker
// handles whichever provider is configured. Default Gemini model:
// gemini-2.5-flash (free tier, ~15 RPM, 1M tokens/min).

const DEFAULT_ALLOWED_ORIGINS = [
  'https://csilvasantin.github.io',
  'http://localhost:9124',
  'http://127.0.0.1:9124',
  'http://localhost:9126',
  'http://127.0.0.1:9126',
  'http://localhost:9170',
  'http://127.0.0.1:9170',
];

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
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

async function readJson(request) {
  try { return await request.json(); }
  catch (error) { return {}; }
}

function normalizePrompt(body) {
  const prompt = String(body.prompt || body.message || body.text || '').trim();
  const context = String(body.context || '').trim();
  if (!context) return prompt;
  return `${prompt}\n\nContexto del juego:\n${context}`;
}

const SYSTEM_PROMPT = 'Eres AdmiraXPBot dentro de Admira XP. Responde breve, claro y útil para un juego de simulación de tienda. Usa el idioma indicado por el contexto o el usuario. No antepongas nombres de rol ni estados internos como "Unitree Bot:" o "Scan in progress".';

function pickProvider(env) {
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.XAI_API_KEY) return 'xai';
  return null;
}

function defaultModel(env, provider) {
  if (provider === 'gemini') return env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (provider === 'xai') return env.XAI_MODEL || 'grok-4-latest';
  return '';
}

async function askGemini(request, env, body, prompt) {
  const model = String(body.model || env.GEMINI_MODEL || 'gemini-2.5-flash');
  const baseUrl = String(env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
        maxOutputTokens: Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : 900,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = (data && data.error && data.error.message) || `Gemini HTTP ${response.status}`;
    return jsonResponse(request, env, response.status, {
      ok: false,
      error: (data && data.error) || 'gemini_error',
      message: errMsg,
      provider: 'gemini',
    });
  }
  const cand = data.candidates && data.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  const text = parts ? parts.map(p => String(p.text || '')).join('').trim() : '';
  if (!text) {
    return jsonResponse(request, env, 200, {
      ok: false,
      error: 'empty_response',
      message: cand && cand.finishReason ? `Gemini finish=${cand.finishReason}` : 'Respuesta vacía',
      provider: 'gemini',
      model,
    });
  }
  return jsonResponse(request, env, 200, {
    ok: true,
    text,
    model,
    provider: 'gemini',
    usage: data.usageMetadata || null,
  });
}

async function askXai(request, env, body, prompt) {
  const model = String(body.model || env.XAI_MODEL || 'grok-4-latest');
  const baseUrl = String(env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
      max_tokens: Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : 900,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return jsonResponse(request, env, response.status, {
      ok: false,
      error: data.error || 'xai_error',
      message: data.error && data.error.message ? data.error.message : `xAI HTTP ${response.status}`,
      provider: 'xai',
    });
  }
  const text = data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '').trim()
    : '';
  return jsonResponse(request, env, 200, {
    ok: true,
    text,
    model: data.model || model,
    provider: 'xai',
    usage: data.usage || null,
  });
}

async function askLLM(request, env) {
  const provider = pickProvider(env);
  if (!provider) {
    return jsonResponse(request, env, 500, {
      ok: false,
      error: 'missing_secret',
      message: 'Configura GEMINI_API_KEY (gratis) o XAI_API_KEY en Cloudflare Worker.',
    });
  }
  const body = await readJson(request);
  const prompt = normalizePrompt(body);
  if (!prompt) {
    return jsonResponse(request, env, 400, {
      ok: false,
      error: 'empty_prompt',
      message: 'Falta prompt.',
    });
  }
  if (provider === 'gemini') return askGemini(request, env, body, prompt);
  return askXai(request, env, body, prompt);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      const provider = pickProvider(env);
      return jsonResponse(request, env, 200, {
        ok: true,
        service: 'admira-grok-proxy',
        provider: provider || 'none',
        model: defaultModel(env, provider),
        geminiConfigured: !!env.GEMINI_API_KEY,
        xaiConfigured: !!env.XAI_API_KEY,
      });
    }

    if (url.pathname === '/grok/ask' && request.method === 'POST') {
      return askLLM(request, env);
    }

    return jsonResponse(request, env, 404, {
      ok: false,
      error: 'not_found',
      message: 'Endpoint no encontrado.',
    });
  },
};
