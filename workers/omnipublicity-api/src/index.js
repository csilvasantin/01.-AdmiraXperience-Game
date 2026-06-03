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
  'https://admira.app',
  'https://www.admira.app',
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

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const allowOrigin = (allowed.includes(origin) || LOCAL_ORIGIN_RE.test(origin)) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
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
      return json(request, env, 404, { error: 'not_found', path });
    } catch (err) {
      return json(request, env, 500, { error: 'server_error', message: String(err && err.message || err) });
    }
  },
};
