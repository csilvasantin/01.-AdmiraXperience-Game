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
  'https://www.carlossilva.info',
  'https://carlossilva.info',
  'https://www.xpaceos.com',
  'https://xpaceos.com',
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

// ── Visión: normaliza imágenes de entrada a [{mime, b64}] ──────────
// Acepta: body.image / body.images (data-URL, base64 crudo, o {url}|{b64}),
// y body.imageUrl / body.imageUrls (http(s) o data-URL). Máx 4 imágenes.
const MAX_IMAGES = 4;

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function sniffImageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return 'image/jpeg';
}

function parseDataUrl(s) {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(s || ''));
  return m ? { mime: m[1], b64: m[2] } : null;
}

async function urlToImage(url) {
  const d = parseDataUrl(url);
  if (d) return d;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdmiraXP-GrokProxy/1.0)', 'Accept': 'image/*' },
  });
  if (!r.ok) throw new Error(`image fetch HTTP ${r.status}`);
  let mime = (r.headers.get('Content-Type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
  // Telegram y otros sirven imágenes como application/octet-stream → los modelos lo rechazan.
  // Si no es un mime de imagen, lo deducimos de los magic bytes (o JPEG por defecto).
  const buf = new Uint8Array(await r.arrayBuffer());
  if (!/^image\//.test(mime)) mime = sniffImageMime(buf);
  return { mime, b64: bytesToBase64(buf) };
}

async function collectImages(body) {
  const out = [];
  const urls = [];
  const items = [];
  if (body.image) items.push(body.image);
  if (Array.isArray(body.images)) items.push(...body.images);
  if (body.imageUrl) urls.push(body.imageUrl);
  if (Array.isArray(body.imageUrls)) urls.push(...body.imageUrls);

  for (const item of items) {
    if (typeof item === 'string') {
      const d = parseDataUrl(item);
      if (d) out.push(d);
      else out.push({ mime: body.imageMime || 'image/jpeg', b64: item });
    } else if (item && typeof item === 'object') {
      if (item.url) urls.push(item.url);
      else if (item.b64 || item.data) out.push({ mime: item.mime || 'image/jpeg', b64: item.b64 || item.data });
    }
  }
  for (const u of urls) out.push(await urlToImage(u));
  return out.slice(0, MAX_IMAGES);
}

const SYSTEM_PROMPT = 'Eres AdmiraXPBot dentro de Admira XP. Responde breve, claro y útil para un juego de simulación de tienda. Usa el idioma indicado por el contexto o el usuario. No antepongas nombres de rol ni estados internos como "Unitree Bot:" o "Scan in progress".';

function pickProvider(env, body) {
  const want = body && String(body.provider || '').toLowerCase();
  if (want === 'xai' && env.XAI_API_KEY) return 'xai';
  if (want === 'gemini' && env.GEMINI_API_KEY) return 'gemini';
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.XAI_API_KEY) return 'xai';
  return null;
}

function defaultModel(env, provider) {
  if (provider === 'gemini') return env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (provider === 'xai') return env.XAI_MODEL || 'grok-4-latest';
  return '';
}

async function askGemini(request, env, body, prompt, images) {
  const model = String(body.model || env.GEMINI_MODEL || 'gemini-2.5-flash');
  const baseUrl = String(env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const parts = [{ text: prompt }];
  for (const im of (images || [])) parts.push({ inline_data: { mime_type: im.mime, data: im.b64 } });
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
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
  const respParts = cand && cand.content && cand.content.parts;
  const text = respParts ? respParts.map(p => String(p.text || '')).join('').trim() : '';
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

async function askXai(request, env, body, prompt, images) {
  // Si llega imagen y el modelo configurado no es de visión, usa uno que sí lo sea.
  let model = String(body.model || env.XAI_MODEL || 'grok-4-latest');
  if ((images && images.length) && /grok-3|grok-2(?!-vision)|grok-beta/i.test(model)) {
    model = env.XAI_VISION_MODEL || 'grok-4-latest';
  }
  const baseUrl = String(env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, '');
  const userContent = (images && images.length)
    ? [
        { type: 'text', text: prompt },
        ...images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.b64}`, detail: 'high' } })),
      ]
    : prompt;
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
        { role: 'user', content: userContent },
      ],
      temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
      max_tokens: Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : 900,
    }),
  });
  const rawXai = await response.text();
  let data = {};
  try { data = JSON.parse(rawXai); } catch { /* no-json */ }
  if (!response.ok) {
    return jsonResponse(request, env, response.status, {
      ok: false,
      error: data.error || 'xai_error',
      message: (data.error && data.error.message) ? data.error.message : `xAI HTTP ${response.status}: ${rawXai.slice(0, 300)}`,
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
  const body = await readJson(request);
  const provider = pickProvider(env, body);
  if (!provider) {
    return jsonResponse(request, env, 500, {
      ok: false,
      error: 'missing_secret',
      message: 'Configura GEMINI_API_KEY (gratis) o XAI_API_KEY en Cloudflare Worker.',
    });
  }
  let images = [];
  try {
    images = await collectImages(body);
  } catch (error) {
    return jsonResponse(request, env, 400, {
      ok: false,
      error: 'image_error',
      message: `No pude leer la imagen: ${error.message || error}`,
    });
  }
  let prompt = normalizePrompt(body);
  if (!prompt) {
    if (images.length) prompt = 'Describe esta imagen con detalle: qué muestra, objetos y texto visibles.';
    else return jsonResponse(request, env, 400, { ok: false, error: 'empty_prompt', message: 'Falta prompt.' });
  }
  if (provider === 'gemini') return askGemini(request, env, body, prompt, images);
  return askXai(request, env, body, prompt, images);
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
