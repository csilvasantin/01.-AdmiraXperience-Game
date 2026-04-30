// Admira XP — programmatic marketplace worker.
//
// Endpoints:
//   GET  /inventory                      -> seeds + closes-due, returns slots+auctions+leaders+activeCampaign
//   GET  /active-campaigns               -> just slot_id -> active campaign payload (game polls this)
//   POST /bid    {slotId, bidderName, bidderEmail, amount, brandName, brandColor, brandMessage, brandLogoUrl}
//   POST /admin/seed   {token}           -> idempotent seed of slots + initial auctions
//   POST /admin/close  {token, slotId}   -> manually close an auction
//   GET  /health
//
// The auction model is English (ascending-bid). Bids must beat the leader by
// at least MIN_BID_INCREMENT or beat the reserve price for the first bid.
// When `/inventory` or `/active-campaigns` is hit, any auction whose ends_at
// is in the past is closed and awarded lazily — no scheduler required.

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
function now() { return Math.floor(Date.now() / 1000); }
async function ipHash(request) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '';
  if (!ip) return null;
  const enc = new TextEncoder().encode('admira-mkt:' + ip);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── seed inventory ────────────────────────────────────────────────────────
const SEED_SLOTS = [
  { id: 'ds1',         name: 'DS · Pared izquierda · arriba',     channel: 'digital',  kind: 'screen',   size: '4K vertical', reserve_price: 30,  surface_ref: 'ds1',        sort_order: 10, description: 'Pantalla LED grande sobre la entrada. Loop continuo.' },
  { id: 'ds2',         name: 'DS · Pared izquierda · abajo',      channel: 'digital',  kind: 'screen',   size: '4K vertical', reserve_price: 30,  surface_ref: 'ds2',        sort_order: 11, description: 'Pantalla LED secundaria a nivel cliente.' },
  { id: 'escaparate',  name: 'Escaparate · sobre la puerta',      channel: 'digital',  kind: 'screen',   size: '32:9 banner', reserve_price: 80,  surface_ref: 'escaparate', sort_order: 5,  description: 'El cartel más visible de la calle: cruza la fachada del estanco.' },
  { id: 'metahuman',   name: 'Tótem Metahuman · pantalla AI',     channel: 'digital',  kind: 'screen',   size: '9:21 portrait', reserve_price: 40, surface_ref: 'metahuman',  sort_order: 12, description: 'Pantalla del agente IA. Alto engagement: el cliente le habla.' },
  { id: 'hilo-musical',name: 'Hilo musical · jingle 30s',         channel: 'audio',    kind: 'jingle',   size: '30 s',        reserve_price: 25,  surface_ref: 'hilo',       sort_order: 20, description: 'Cuña de audio entre canciones. Cobertura de toda la tienda.' },
  { id: 'poster-a',    name: 'Cartel pared lateral · A2',         channel: 'physical', kind: 'poster',   size: 'A2 (42×59 cm)', reserve_price: 15, surface_ref: 'poster-a',   sort_order: 30, description: 'Papel impreso. Junto a la fila de cajas. Sin conexión.' },
  { id: 'flyer',       name: 'Flyer en mostrador',                channel: 'physical', kind: 'flyer',    size: 'A6 (10×15 cm)', reserve_price: 8,  surface_ref: 'flyer',      sort_order: 31, description: 'Tarjetón en el mostrador, lo coge el cliente al pagar.' },
  { id: 'gondola',     name: 'Cabeza de góndola · estantería',    channel: 'physical', kind: 'gondola',  size: '60×40 cm',    reserve_price: 35,  surface_ref: 'gondola',    sort_order: 32, description: 'Top-spot en una estantería del centro. Ojos del cliente.' },
  { id: 'takeover',    name: 'MANCHA DE MARCA · tienda completa', channel: 'takeover', kind: 'all',      size: 'todo',        reserve_price: 220, surface_ref: 'all',        sort_order: 1,  description: 'Un único anunciante se queda toda la tienda: pantallas, hilo, posters, gestión de colas, Metahuman y Opinador.' },
];

async function ensureSeed(env) {
  // Slots
  const have = await env.DB.prepare('SELECT COUNT(*) AS n FROM slots').first();
  if (!have || (have.n | 0) < SEED_SLOTS.length) {
    for (const s of SEED_SLOTS) {
      await env.DB.prepare(`
        INSERT INTO slots (id,name,channel,kind,size,reserve_price,description,surface_ref,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, channel=excluded.channel, kind=excluded.kind, size=excluded.size,
          reserve_price=excluded.reserve_price, description=excluded.description,
          surface_ref=excluded.surface_ref, sort_order=excluded.sort_order
      `).bind(s.id, s.name, s.channel, s.kind, s.size, s.reserve_price, s.description, s.surface_ref, s.sort_order).run();
    }
  }
  // For each slot, make sure there's an "open" auction. If the most recent one
  // is awarded/noBids and no live one exists, open a new auction window.
  const slots = await env.DB.prepare('SELECT id FROM slots').all();
  const hours = Math.max(1, Number(env.DEFAULT_AUCTION_HOURS || 24));
  const ts = now();
  for (const r of (slots.results || [])) {
    const live = await env.DB.prepare(`SELECT id FROM auctions WHERE slot_id = ? AND status = 'live' LIMIT 1`).bind(r.id).first();
    if (!live) {
      await env.DB.prepare(`INSERT INTO auctions (slot_id, starts_at, ends_at, status) VALUES (?, ?, ?, 'live')`)
        .bind(r.id, ts, ts + hours * 3600).run();
    }
  }
}

// Lazy close: any auction whose ends_at < now and still 'live' gets awarded.
async function lazyClose(env) {
  const ts = now();
  const due = await env.DB.prepare(`SELECT * FROM auctions WHERE status = 'live' AND ends_at <= ?`).bind(ts).all();
  for (const a of (due.results || [])) {
    const top = await env.DB.prepare(`SELECT id, amount FROM bids WHERE auction_id = ? ORDER BY amount DESC, id ASC LIMIT 1`).bind(a.id).first();
    if (top) {
      await env.DB.prepare(`UPDATE auctions SET status = 'awarded', winning_bid_id = ? WHERE id = ?`).bind(top.id, a.id).run();
      const campaignHours = Math.max(1, Number(env.DEFAULT_CAMPAIGN_HOURS || 24));
      await env.DB.prepare(`INSERT INTO campaigns (bid_id, slot_id, starts_at, ends_at, active) VALUES (?, ?, ?, ?, 1)`)
        .bind(top.id, a.slot_id, ts, ts + campaignHours * 3600).run();
    } else {
      await env.DB.prepare(`UPDATE auctions SET status = 'noBids' WHERE id = ?`).bind(a.id).run();
    }
    // Re-open a fresh auction for that slot.
    const hours = Math.max(1, Number(env.DEFAULT_AUCTION_HOURS || 24));
    await env.DB.prepare(`INSERT INTO auctions (slot_id, starts_at, ends_at, status) VALUES (?, ?, ?, 'live')`)
      .bind(a.slot_id, ts, ts + hours * 3600).run();
  }
  // Expire campaigns whose ends_at has passed.
  await env.DB.prepare(`UPDATE campaigns SET active = 0 WHERE active = 1 AND ends_at <= ?`).bind(ts).run();
}

const NAME_RE  = /^[\p{L}\p{N}\s.\-_'!?&]{1,40}$/u;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE   = /^https:\/\/[^\s<>"]{1,200}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{1,16}$/;

function sanitizeName(s)   { const t = String(s || '').trim().slice(0, 40); return NAME_RE.test(t) ? t : null; }
function sanitizeMsg(s)    { return String(s || '').trim().slice(0, 140) || null; }
function sanitizeColor(s)  { const t = String(s || '').trim(); return COLOR_RE.test(t) ? t : null; }
function sanitizeUrl(s)    { const t = String(s || '').trim(); if (!t) return null; return URL_RE.test(t) ? t : null; }
function sanitizeEmail(s)  { if (!s) return null; const t = String(s).trim().slice(0, 192); return EMAIL_RE.test(t) ? t : null; }
function sanitizeAmount(s) { const n = Math.floor(Number(s)); return Number.isFinite(n) && n >= 0 ? n : null; }

async function getInventoryShape(env) {
  await lazyClose(env);
  const slots = await env.DB.prepare(`SELECT * FROM slots ORDER BY sort_order ASC, id ASC`).all();
  const items = [];
  for (const s of (slots.results || [])) {
    const live = await env.DB.prepare(`SELECT * FROM auctions WHERE slot_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1`).bind(s.id).first();
    let leader = null, bidCount = 0;
    if (live) {
      const top = await env.DB.prepare(`SELECT bidder_name, brand_name, brand_color, brand_message, brand_logo_url, amount, ts FROM bids WHERE auction_id = ? ORDER BY amount DESC, id ASC LIMIT 1`).bind(live.id).first();
      const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM bids WHERE auction_id = ?`).bind(live.id).first();
      leader = top || null;
      bidCount = (cnt && cnt.n) | 0;
    }
    const camp = await env.DB.prepare(`
      SELECT c.*, b.brand_name, b.brand_color, b.brand_message, b.brand_logo_url, b.amount, b.bidder_name
        FROM campaigns c JOIN bids b ON c.bid_id = b.id
       WHERE c.slot_id = ? AND c.active = 1 AND c.ends_at > ?
       ORDER BY c.id DESC LIMIT 1
    `).bind(s.id, now()).first();
    items.push({
      slot: {
        id: s.id, name: s.name, channel: s.channel, kind: s.kind, size: s.size,
        reservePrice: s.reserve_price | 0, description: s.description,
        surfaceRef: s.surface_ref,
      },
      auction: live ? {
        id: live.id,
        startsAt: live.starts_at, endsAt: live.ends_at,
        status: live.status,
        leader: leader ? {
          bidderName: leader.bidder_name, brandName: leader.brand_name,
          brandColor: leader.brand_color, brandMessage: leader.brand_message,
          brandLogoUrl: leader.brand_logo_url, amount: leader.amount | 0, ts: leader.ts | 0,
        } : null,
        bidCount,
      } : null,
      activeCampaign: camp ? {
        id: camp.id, slotId: camp.slot_id,
        startsAt: camp.starts_at, endsAt: camp.ends_at,
        bidderName: camp.bidder_name, brandName: camp.brand_name,
        brandColor: camp.brand_color, brandMessage: camp.brand_message,
        brandLogoUrl: camp.brand_logo_url, amount: camp.amount | 0,
      } : null,
    });
  }
  return { items, serverTime: now() };
}

async function handleInventory(request, env) {
  await ensureSeed(env);
  const data = await getInventoryShape(env);
  return json(request, env, 200, data);
}

async function handleActiveCampaigns(request, env) {
  await ensureSeed(env);
  await lazyClose(env);
  const ts = now();
  const rows = await env.DB.prepare(`
    SELECT c.slot_id, c.starts_at, c.ends_at, b.brand_name, b.brand_color, b.brand_message, b.brand_logo_url, b.bidder_name, b.amount
      FROM campaigns c JOIN bids b ON c.bid_id = b.id
     WHERE c.active = 1 AND c.ends_at > ?
     ORDER BY c.id DESC
  `).bind(ts).all();
  const map = {};
  for (const r of (rows.results || [])) {
    if (map[r.slot_id]) continue;
    map[r.slot_id] = {
      slotId: r.slot_id,
      brandName: r.brand_name,
      brandColor: r.brand_color,
      brandMessage: r.brand_message,
      brandLogoUrl: r.brand_logo_url,
      bidderName: r.bidder_name,
      amount: r.amount | 0,
      startsAt: r.starts_at, endsAt: r.ends_at,
    };
  }
  return json(request, env, 200, { campaigns: map, serverTime: ts });
}

async function handleBid(request, env) {
  await ensureSeed(env);
  await lazyClose(env);
  const body = await readBody(request);
  const slotId = String(body.slotId || '').trim();
  if (!slotId) return json(request, env, 400, { error: 'missing_slot_id' });
  const slot = await env.DB.prepare(`SELECT * FROM slots WHERE id = ?`).bind(slotId).first();
  if (!slot) return json(request, env, 404, { error: 'slot_not_found' });
  const live = await env.DB.prepare(`SELECT * FROM auctions WHERE slot_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1`).bind(slotId).first();
  if (!live) return json(request, env, 409, { error: 'no_live_auction' });
  if (now() > (live.ends_at | 0)) return json(request, env, 409, { error: 'auction_ended' });

  const bidderName = sanitizeName(body.bidderName);
  const brandName  = sanitizeName(body.brandName);
  const amount     = sanitizeAmount(body.amount);
  const brandColor = sanitizeColor(body.brandColor) || '#78f3ff';
  const brandMsg   = sanitizeMsg(body.brandMessage);
  const brandLogo  = sanitizeUrl(body.brandLogoUrl);
  const email      = sanitizeEmail(body.bidderEmail);
  if (!bidderName) return json(request, env, 400, { error: 'invalid_bidder_name' });
  if (!brandName)  return json(request, env, 400, { error: 'invalid_brand_name' });
  if (amount == null) return json(request, env, 400, { error: 'invalid_amount' });

  const top = await env.DB.prepare(`SELECT amount FROM bids WHERE auction_id = ? ORDER BY amount DESC, id ASC LIMIT 1`).bind(live.id).first();
  const minIncrement = Math.max(1, Number(env.MIN_BID_INCREMENT || 5));
  const reserve = (slot.reserve_price | 0);
  const minRequired = top ? ((top.amount | 0) + minIncrement) : reserve;
  if (amount < minRequired) {
    return json(request, env, 409, { error: 'bid_too_low', minRequired, currentTop: top ? (top.amount | 0) : 0, reserve });
  }

  const ts = now();
  const ip = await ipHash(request);
  await env.DB.prepare(`
    INSERT INTO bids (auction_id, bidder_name, bidder_email, amount, brand_name, brand_color, brand_message, brand_logo_url, ts, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(live.id, bidderName, email, amount, brandName, brandColor, brandMsg, brandLogo, ts, ip).run();

  // Soft anti-snipe: if the auction would end in <60s, push end +60s.
  if ((live.ends_at | 0) - ts < 60) {
    await env.DB.prepare(`UPDATE auctions SET ends_at = ? WHERE id = ?`).bind(ts + 60, live.id).run();
  }

  const data = await getInventoryShape(env);
  const item = data.items.find(it => it.slot.id === slotId) || null;
  return json(request, env, 200, { ok: true, item, serverTime: ts });
}

async function handleAdminSeed(request, env) {
  const body = await readBody(request);
  if (String(body.token || '') !== String(env.ADMIN_TOKEN || '')) return json(request, env, 403, { error: 'forbidden' });
  await ensureSeed(env);
  return json(request, env, 200, { ok: true });
}

async function handleAdminClose(request, env) {
  const body = await readBody(request);
  if (String(body.token || '') !== String(env.ADMIN_TOKEN || '')) return json(request, env, 403, { error: 'forbidden' });
  const slotId = String(body.slotId || '').trim();
  if (!slotId) return json(request, env, 400, { error: 'missing_slot_id' });
  const live = await env.DB.prepare(`SELECT * FROM auctions WHERE slot_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1`).bind(slotId).first();
  if (!live) return json(request, env, 409, { error: 'no_live_auction' });
  await env.DB.prepare(`UPDATE auctions SET ends_at = ? WHERE id = ?`).bind(now() - 1, live.id).run();
  await lazyClose(env);
  return json(request, env, 200, { ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET'  && path === '/health')           return json(request, env, 200, { ok: true, ts: now() });
      if (request.method === 'GET'  && path === '/inventory')        return await handleInventory(request, env);
      if (request.method === 'GET'  && path === '/active-campaigns') return await handleActiveCampaigns(request, env);
      if (request.method === 'POST' && path === '/bid')              return await handleBid(request, env);
      if (request.method === 'POST' && path === '/admin/seed')       return await handleAdminSeed(request, env);
      if (request.method === 'POST' && path === '/admin/close')      return await handleAdminClose(request, env);
      return json(request, env, 404, { error: 'not_found', path });
    } catch (err) {
      return json(request, env, 500, { error: 'server_error', message: String(err && err.message || err) });
    }
  },
};
