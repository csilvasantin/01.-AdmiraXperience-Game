// Xtanco Club — loyalty backend for Admira XP
// Endpoints:
//   POST /register           { joinCode, name, avatarEmoji } -> { token, customer }
//   GET  /me?token=...                                       -> { customer, recentVisits }
//   POST /checkin            { token }                       -> { customer }   marks "I'm in the shop now"
//   POST /visit              { token, product, revenue }     -> { customer, free, stamps }
//   GET  /active                                             -> { customers: [...active in window] }
//   GET  /health                                             -> { ok:true }

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

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function now() { return Math.floor(Date.now() / 1000); }

function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

const NAME_RE = /^[\p{L}\p{N}\s.\-_'!?]{1,32}$/u;
const EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}‍️]{1,8}$/u;
const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function sanitizeName(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return NAME_RE.test(t) ? t : null;
}
function sanitizeEmoji(s) {
  const t = String(s || '').trim();
  if (!t) return '🙂';
  return EMOJI_RE.test(t) ? t : '🙂';
}
function sanitizeBirthday(s) {
  if (s == null || s === '') return null;
  const t = String(s).trim();
  return BIRTHDAY_RE.test(t) ? t : null;
}
function todayMMDD() {
  const d = new Date();
  return String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

async function publicCustomer(c) {
  if (!c) return null;
  const birthday = c.birthday || null;
  return {
    id: c.id,
    name: c.name,
    avatarEmoji: c.avatar_emoji,
    stamps: c.stamps,
    totalVisits: c.total_visits,
    totalSpend: c.total_spend,
    freePending: !!c.free_pending,
    createdAt: c.created_at,
    lastSeenAt: c.last_seen_at,
    lastCheckin: c.last_checkin,
    birthday,
    isBirthday: !!(birthday && birthday === todayMMDD()),
  };
}

async function getCustomerByToken(env, token) {
  if (!token || typeof token !== 'string') return null;
  const row = await env.DB.prepare('SELECT * FROM customers WHERE token = ? LIMIT 1').bind(token).first();
  return row || null;
}

async function handleRegister(request, env) {
  const body = await readBody(request);
  const expected = String(env.JOIN_CODE || '').trim();
  const provided = String(body.joinCode || '').trim().toUpperCase();
  if (expected && provided !== expected.toUpperCase()) {
    return json(request, env, 403, { error: 'invalid_join_code' });
  }
  const name = sanitizeName(body.name);
  if (!name) return json(request, env, 400, { error: 'invalid_name' });
  const avatar = sanitizeEmoji(body.avatarEmoji);
  const birthday = sanitizeBirthday(body.birthday);
  const token = newToken();
  const ts = now();
  await env.DB.prepare(`
    INSERT INTO customers (token, name, avatar_emoji, stamps, total_visits, total_spend, free_pending, created_at, last_seen_at, last_checkin, birthday)
    VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, 0, ?)
  `).bind(token, name, avatar, ts, ts, birthday).run();
  const row = await getCustomerByToken(env, token);
  return json(request, env, 200, { token, customer: await publicCustomer(row) });
}

async function handleUpdate(request, env) {
  const body = await readBody(request);
  const c = await getCustomerByToken(env, body.token);
  if (!c) return json(request, env, 404, { error: 'not_found' });
  const sets = []; const vals = [];
  if (body.name !== undefined) {
    const name = sanitizeName(body.name);
    if (!name) return json(request, env, 400, { error: 'invalid_name' });
    sets.push('name = ?'); vals.push(name);
  }
  if (body.avatarEmoji !== undefined) {
    sets.push('avatar_emoji = ?'); vals.push(sanitizeEmoji(body.avatarEmoji));
  }
  if (body.birthday !== undefined) {
    sets.push('birthday = ?'); vals.push(sanitizeBirthday(body.birthday));
  }
  if (!sets.length) return json(request, env, 400, { error: 'nothing_to_update' });
  vals.push(c.id);
  await env.DB.prepare('UPDATE customers SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
  const fresh = await getCustomerByToken(env, body.token);
  return json(request, env, 200, { customer: await publicCustomer(fresh) });
}

async function handleMe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const c = await getCustomerByToken(env, token);
  if (!c) return json(request, env, 404, { error: 'not_found' });
  await env.DB.prepare('UPDATE customers SET last_seen_at = ? WHERE id = ?').bind(now(), c.id).run();
  const visits = await env.DB.prepare(
    'SELECT ts, product, revenue, was_free FROM visits WHERE customer_id = ? ORDER BY ts DESC LIMIT 20'
  ).bind(c.id).all();
  return json(request, env, 200, {
    customer: await publicCustomer({ ...c, last_seen_at: now() }),
    recentVisits: visits.results || [],
    stampsForFree: Number(env.STAMPS_FOR_FREE || 5),
  });
}

async function handleCheckin(request, env) {
  const body = await readBody(request);
  const c = await getCustomerByToken(env, body.token);
  if (!c) return json(request, env, 404, { error: 'not_found' });
  const ts = now();
  await env.DB.prepare('UPDATE customers SET last_checkin = ?, last_seen_at = ? WHERE id = ?').bind(ts, ts, c.id).run();
  const fresh = await getCustomerByToken(env, body.token);
  return json(request, env, 200, { customer: await publicCustomer(fresh) });
}

async function applyVisit(env, customer, product, revenue) {
  const STAMPS_FOR_FREE = Math.max(2, Number(env.STAMPS_FOR_FREE || 5));
  const ts = now();
  let wasFree = 0;
  let newStamps = customer.stamps;
  let newFreePending = customer.free_pending;
  if (customer.free_pending) {
    wasFree = 1;
    newFreePending = 0;
    newStamps = 0;
  } else {
    newStamps = customer.stamps + 1;
    if (newStamps >= STAMPS_FOR_FREE) {
      newFreePending = 1;
      newStamps = STAMPS_FOR_FREE;
    }
  }
  const billedRevenue = wasFree ? 0 : Math.max(0, Math.floor(Number(revenue) || 0));
  await env.DB.prepare(`
    UPDATE customers
       SET stamps = ?, total_visits = total_visits + 1, total_spend = total_spend + ?,
           free_pending = ?, last_seen_at = ?
     WHERE id = ?
  `).bind(newStamps, billedRevenue, newFreePending, ts, customer.id).run();
  await env.DB.prepare(`
    INSERT INTO visits (customer_id, ts, product, revenue, was_free)
    VALUES (?, ?, ?, ?, ?)
  `).bind(customer.id, ts, String(product || '').slice(0, 64) || null, billedRevenue, wasFree).run();
  const fresh = await env.DB.prepare('SELECT * FROM customers WHERE id = ? LIMIT 1').bind(customer.id).first();
  return {
    customer: await publicCustomer(fresh),
    free: !!wasFree,
    stamps: newStamps,
    stampsForFree: STAMPS_FOR_FREE,
  };
}

async function handleVisit(request, env) {
  const body = await readBody(request);
  const c = await getCustomerByToken(env, body.token);
  if (!c) return json(request, env, 404, { error: 'not_found' });
  const result = await applyVisit(env, c, body.product, body.revenue);
  return json(request, env, 200, result);
}

// Shop-authenticated visit: the game (csilvasantin.github.io / localhost) marks a
// purchase for a customer that physically "entered" the shop (i.e. has an active
// check-in) and is rate-limited to 1 visit / 20s per customer to discourage abuse.
async function handleShopVisit(request, env) {
  const body = await readBody(request);
  const expected = String(env.JOIN_CODE || '').trim().toUpperCase();
  const provided = String(body.shopJoinCode || '').trim().toUpperCase();
  if (expected && provided !== expected) {
    return json(request, env, 403, { error: 'invalid_shop_code' });
  }
  const id = Number(body.customerId);
  if (!Number.isFinite(id) || id <= 0) return json(request, env, 400, { error: 'invalid_customer_id' });
  const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ? LIMIT 1').bind(id).first();
  if (!c) return json(request, env, 404, { error: 'not_found' });
  const ts = now();
  const windowSec = Math.max(30, Number(env.ACTIVE_WINDOW_SECONDS || 120));
  if (!c.last_checkin || ts - c.last_checkin > windowSec) {
    return json(request, env, 409, { error: 'not_active', message: 'Customer has no recent check-in' });
  }
  const lastVisit = await env.DB.prepare('SELECT ts FROM visits WHERE customer_id = ? ORDER BY ts DESC LIMIT 1').bind(id).first();
  if (lastVisit && ts - lastVisit.ts < 20) {
    return json(request, env, 429, { error: 'rate_limited', retryAfter: 20 - (ts - lastVisit.ts) });
  }
  const result = await applyVisit(env, c, body.product, body.revenue);
  return json(request, env, 200, result);
}

async function handleActive(request, env) {
  const windowSec = Math.max(30, Number(env.ACTIVE_WINDOW_SECONDS || 120));
  const cutoff = now() - windowSec;
  const rows = await env.DB.prepare(`
    SELECT id, token, name, avatar_emoji, stamps, total_visits, total_spend, free_pending,
           created_at, last_seen_at, last_checkin, birthday
      FROM customers
     WHERE last_checkin >= ?
     ORDER BY last_checkin DESC
  `).bind(cutoff).all();
  const customers = await Promise.all((rows.results || []).map(publicCustomer));
  return json(request, env, 200, {
    customers,
    windowSeconds: windowSec,
    stampsForFree: Number(env.STAMPS_FOR_FREE || 5),
    serverTime: now(),
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
      if (request.method === 'GET'  && path === '/health')   return json(request, env, 200, { ok: true, ts: now() });
      if (request.method === 'POST' && path === '/register') return await handleRegister(request, env);
      if (request.method === 'POST' && path === '/update')   return await handleUpdate(request, env);
      if (request.method === 'GET'  && path === '/me')       return await handleMe(request, env);
      if (request.method === 'POST' && path === '/checkin')  return await handleCheckin(request, env);
      if (request.method === 'POST' && path === '/visit')    return await handleVisit(request, env);
      if (request.method === 'POST' && path === '/shop/visit') return await handleShopVisit(request, env);
      if (request.method === 'GET'  && path === '/active')   return await handleActive(request, env);
      return json(request, env, 404, { error: 'not_found', path });
    } catch (err) {
      return json(request, env, 500, { error: 'server_error', message: String(err && err.message || err) });
    }
  },
};
