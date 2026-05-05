#!/usr/bin/env node
// suno-local · proxy minimo a la API privada de Suno usando cookie de sesion (Clerk).
// Tres endpoints (los que consume Pixer.ai → playSunoLocal):
//   GET  /healthz           → { ok, total_credits_left, monthly_limit }
//   POST /generate          → { clips: [...] }
//   GET  /status?ids=a,b    → [ {id, status, audio_url, ...} ]
//
// Auth: cookie Clerk pegada en .env (SUNO_COOKIE). Cada ~50s refrescamos el JWT
// via https://auth.suno.com/v1/client/sessions/<sid>/tokens y lo cacheamos.
//
// Suno no expone API publica — esto es reverse engineering: fragil, puede romperse,
// y violar TOS si se abusa. Util solo para uso personal con cuenta loginada.

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// ─── .env loader (sin dependencias) ─────────────────────────────────
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      if (/^['"].*['"]$/.test(val)) val = val.slice(1, -1);
      if (val) process.env[m[1]] = val;
    }
  }
})();

const PORT = parseInt(process.env.SUNO_LOCAL_PORT || '3777', 10);
const SUNO_COOKIE = process.env.SUNO_COOKIE || '';
const CLERK_HOST = process.env.SUNO_CLERK_HOST || 'auth.suno.com';
const CLERK_VER = process.env.SUNO_CLERK_JS_VERSION || '5.0.0';
const SUNO_API = process.env.SUNO_API_BASE || 'https://studio-api.suno.ai';
const ALLOWED_ORIGINS = (process.env.SUNO_ALLOWED_ORIGINS
  || 'https://csilvasantin.github.io,http://localhost,http://127.0.0.1')
  .split(',').map(s => s.trim()).filter(Boolean);
const UA = process.env.SUNO_UA
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

if (!SUNO_COOKIE) {
  console.error('✗ SUNO_COOKIE no esta definido en .env');
  console.error('  Crea un .env desde .env.example y pega la cookie de auth.suno.com');
  process.exit(1);
}

// ─── Clerk auth ─────────────────────────────────────────────────────
let cachedSid = null;
let cachedJwt = null;
let cachedJwtExp = 0;

async function getSessionId() {
  if (cachedSid) return cachedSid;
  const r = await fetch(`https://${CLERK_HOST}/v1/client?_clerk_js_version=${CLERK_VER}`, {
    headers: {
      cookie: SUNO_COOKIE, 'user-agent': UA, accept: 'application/json',
      origin: 'https://suno.com', referer: 'https://suno.com/',
    },
  });
  if (!r.ok) throw new Error(`clerk client list failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const sessions = data?.response?.sessions || [];
  const active = sessions.find(s => s.status === 'active') || sessions[0];
  if (!active?.id) throw new Error('no active suno session in cookie · ¿reloguea en suno.com y vuelve a copiar la cookie?');
  cachedSid = active.id;
  return cachedSid;
}

async function getJwt() {
  if (cachedJwt && Date.now() < cachedJwtExp - 30_000) return cachedJwt;
  const sid = await getSessionId();
  const r = await fetch(
    `https://${CLERK_HOST}/v1/client/sessions/${sid}/tokens?_clerk_js_version=${CLERK_VER}`,
    { method: 'POST', headers: {
      cookie: SUNO_COOKIE, 'user-agent': UA, accept: 'application/json',
      origin: 'https://suno.com', referer: 'https://suno.com/',
    } }
  );
  if (!r.ok) {
    cachedSid = null; // forzar redescubrimiento
    throw new Error(`clerk token refresh failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data?.jwt) throw new Error('clerk response missing jwt');
  cachedJwt = data.jwt;
  cachedJwtExp = Date.now() + 50_000;
  return cachedJwt;
}

async function sunoFetch(p, opts = {}) {
  const jwt = await getJwt();
  return fetch(SUNO_API + p, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'user-agent': UA,
      'accept': 'application/json',
      'origin': 'https://suno.com',
      'referer': 'https://suno.com/',
      ...(opts.headers || {}),
    },
  });
}

// ─── Helpers HTTP ──────────────────────────────────────────────────
const rl = new Map();
function rateLimit(ip, key, limit, windowMs) {
  const now = Date.now();
  const k = `${ip}|${key}`;
  let entry = rl.get(k);
  if (!entry || now > entry.reset) entry = { count: 0, reset: now + windowMs };
  entry.count++;
  rl.set(k, entry);
  return entry.count <= limit;
}

function originAllowed(origin) {
  if (!origin) return true; // permite curl/healthz/server-to-server
  return ALLOWED_ORIGINS.some(a => origin === a || origin.startsWith(a + '/') || origin.startsWith(a));
}

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', originAllowed(origin) ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', d => {
      buf += d;
      if (buf.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

// ─── Handlers ──────────────────────────────────────────────────────
async function handleHealthz(req, res) {
  try {
    const r = await sunoFetch('/api/billing/info/');
    if (!r.ok) {
      const txt = (await r.text()).slice(0, 300);
      sendJson(res, 200, { ok: false, error: `billing http ${r.status}`, hint: txt });
      return;
    }
    const data = await r.json();
    sendJson(res, 200, {
      ok: true,
      total_credits_left: data.total_credits_left ?? data.credits_left ?? 0,
      monthly_limit: data.monthly_limit ?? null,
      monthly_usage: data.monthly_usage ?? null,
    });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: String(e.message || e) });
  }
}

async function handleGenerate(req, res) {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    sendJson(res, 403, { error: 'origin not allowed', origin, allowed: ALLOWED_ORIGINS });
    return;
  }
  const ip = req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip, 'generate', 3, 60_000)) {
    sendJson(res, 429, { error: 'rate limit · 3 generate por minuto por IP' });
    return;
  }
  try {
    const body = await readBody(req);
    const prompt = String(body.prompt || '').slice(0, 1500);
    if (!prompt) { sendJson(res, 400, { error: 'missing prompt' }); return; }
    const instrumental = !!body.instrumental;
    const model = body.model === 'chirp-v4-5' ? 'chirp-v4-5' : 'chirp-v4';
    const r = await sunoFetch('/api/generate/v2/', {
      method: 'POST',
      body: JSON.stringify({
        gpt_description_prompt: prompt,
        make_instrumental: instrumental,
        mv: model,
        prompt: '',
      }),
    });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 400) }; }
    if (!r.ok) { sendJson(res, r.status, { error: `suno generate ${r.status}`, data }); return; }
    // Suno puede responder con array directo o con {clips:[...]}
    const clips = Array.isArray(data) ? data : (data.clips || []);
    sendJson(res, 200, { clips });
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
}

async function handleStatus(req, res, query) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip, 'status', 60, 60_000)) {
    sendJson(res, 429, { error: 'rate limit · 60 status por minuto por IP' });
    return;
  }
  const ids = String(query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  if (!ids.length) { sendJson(res, 400, { error: 'missing ids' }); return; }
  try {
    const r = await sunoFetch(`/api/feed/?ids=${encodeURIComponent(ids.join(','))}`);
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 400) }; }
    if (!r.ok) { sendJson(res, r.status, { error: `suno feed ${r.status}`, data }); return; }
    const clips = Array.isArray(data) ? data : (data.clips || []);
    sendJson(res, 200, clips);
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
}

// ─── Server ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (u.pathname === '/healthz' && req.method === 'GET') return handleHealthz(req, res);
  if (u.pathname === '/generate' && req.method === 'POST') return handleGenerate(req, res);
  if (u.pathname === '/status' && req.method === 'GET') return handleStatus(req, res, u.query);

  sendJson(res, 404, { error: 'not found', allowed: ['GET /healthz', 'POST /generate', 'GET /status?ids=...'] });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ suno-local listening on http://127.0.0.1:${PORT}`);
  console.log(`  endpoints: GET /healthz · POST /generate · GET /status?ids=...`);
  console.log(`  allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
