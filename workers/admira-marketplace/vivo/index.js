var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var DEFAULT_ALLOWED_ORIGINS = [
  "https://csilvasantin.github.io",
  "https://www.xpaceos.com",
  "https://xpaceos.com",
  "https://admira.store",
  "https://xpl.admira.store",
  "http://localhost:9124",
  "http://127.0.0.1:9124",
  "http://localhost:5173"
];
var INVENTORY_CACHE_TTL_MS = 5e3;
var inventoryCache = null;
var schemaReady = false;
function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ALLOWED_ORIGINS);
}
__name(getAllowedOrigins, "getAllowedOrigins");
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function json(request, env, status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}
__name(json, "json");
async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
__name(readBody, "readBody");
function now() {
  return Math.floor(Date.now() / 1e3);
}
__name(now, "now");
function emergencyNoD1(env) {
  const v = String(env.EMERGENCY_NO_D1 ?? "0").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}
__name(emergencyNoD1, "emergencyNoD1");
function staticInventoryPayload() {
  const ts = now();
  const items = SEED_SLOTS.map((s) => ({
    slot: {
      id: s.id,
      name: s.name,
      channel: s.channel,
      kind: s.kind,
      size: s.size,
      reservePrice: s.reserve_price | 0,
      description: s.description,
      surfaceRef: s.surface_ref
    },
    auction: null,
    activeCampaign: null
  }));
  return {
    items,
    serverTime: ts,
    emergency: true,
    note: "D1 reads disabled \u2014 admira-marketplace-db purge in progress (IN-79380980)"
  };
}
__name(staticInventoryPayload, "staticInventoryPayload");
async function ipHash(request) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Real-IP") || "";
  if (!ip) return null;
  const enc = new TextEncoder().encode("admira-mkt:" + ip);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(ipHash, "ipHash");
var SEED_SLOTS = [
  { id: "ds1", name: "DS \xB7 Pared izquierda \xB7 arriba", channel: "digital", kind: "screen", size: "4K vertical", reserve_price: 30, surface_ref: "ds1", sort_order: 10, description: "Pantalla LED grande sobre la entrada. Loop continuo." },
  { id: "ds2", name: "DS \xB7 Pared izquierda \xB7 abajo", channel: "digital", kind: "screen", size: "4K vertical", reserve_price: 30, surface_ref: "ds2", sort_order: 11, description: "Pantalla LED secundaria a nivel cliente." },
  { id: "escaparate", name: "Escaparate \xB7 sobre la puerta", channel: "digital", kind: "screen", size: "32:9 banner", reserve_price: 80, surface_ref: "escaparate", sort_order: 5, description: "El cartel m\xE1s visible de la calle: cruza la fachada del estanco." },
  { id: "metahuman", name: "T\xF3tem Metahuman \xB7 pantalla AI", channel: "digital", kind: "screen", size: "9:21 portrait", reserve_price: 40, surface_ref: "metahuman", sort_order: 12, description: "Pantalla del agente IA. Alto engagement: el cliente le habla." },
  { id: "hilo-musical", name: "Hilo musical \xB7 jingle 30s", channel: "audio", kind: "jingle", size: "30 s", reserve_price: 25, surface_ref: "hilo", sort_order: 20, description: "Cu\xF1a de audio entre canciones. Cobertura de toda la tienda." },
  { id: "poster-a", name: "Cartel pared lateral \xB7 A2", channel: "physical", kind: "poster", size: "A2 (42\xD759 cm)", reserve_price: 15, surface_ref: "poster-a", sort_order: 30, description: "Papel impreso. Junto a la fila de cajas. Sin conexi\xF3n." },
  { id: "flyer", name: "Flyer en mostrador", channel: "physical", kind: "flyer", size: "A6 (10\xD715 cm)", reserve_price: 8, surface_ref: "flyer", sort_order: 31, description: "Tarjet\xF3n en el mostrador, lo coge el cliente al pagar." },
  { id: "gondola", name: "Cabeza de g\xF3ndola \xB7 estanter\xEDa", channel: "physical", kind: "gondola", size: "60\xD740 cm", reserve_price: 35, surface_ref: "gondola", sort_order: 32, description: "Top-spot en una estanter\xEDa del centro. Ojos del cliente." },
  { id: "takeover", name: "MANCHA DE MARCA \xB7 tienda completa", channel: "takeover", kind: "all", size: "todo", reserve_price: 220, surface_ref: "all", sort_order: 1, description: "Un \xFAnico anunciante se queda toda la tienda: pantallas, hilo, posters, gesti\xF3n de colas, Metahuman y Opinador." }
];
async function ensureSchema(env) {
  if (schemaReady) return;
  try {
    await env.DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_auctions_one_live ON auctions(slot_id) WHERE status = 'live'`
    ).run();
    schemaReady = true;
  } catch (err) {
    console.warn("ensureSchema unique index deferred:", String(err && err.message || err));
  }
}
__name(ensureSchema, "ensureSchema");
async function ensureSeed(env) {
  await ensureSchema(env);
  const have = await env.DB.prepare(`SELECT 1 AS ok FROM slots WHERE id = 'takeover' LIMIT 1`).first();
  if (!have) {
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
  const hours = Math.max(1, Number(env.DEFAULT_AUCTION_HOURS || 24));
  const ts = now();
  const ends = ts + hours * 3600;
  for (const s of SEED_SLOTS) {
    try {
      await env.DB.prepare(`
        INSERT INTO auctions (slot_id, starts_at, ends_at, status)
        SELECT ?, ?, ?, 'live'
         WHERE NOT EXISTS (
           SELECT 1 FROM auctions WHERE slot_id = ? AND status = 'live' LIMIT 1
         )
      `).bind(s.id, ts, ends, s.id).run();
    } catch (err) {
      const msg = String(err && err.message || err);
      if (!/UNIQUE|constraint/i.test(msg)) throw err;
    }
  }
}
__name(ensureSeed, "ensureSeed");
async function openLiveAuction(env, slotId, ts) {
  const hours = Math.max(1, Number(env.DEFAULT_AUCTION_HOURS || 24));
  try {
    await env.DB.prepare(`
      INSERT INTO auctions (slot_id, starts_at, ends_at, status)
      SELECT ?, ?, ?, 'live'
       WHERE NOT EXISTS (
         SELECT 1 FROM auctions WHERE slot_id = ? AND status = 'live' LIMIT 1
       )
    `).bind(slotId, ts, ts + hours * 3600, slotId).run();
  } catch (err) {
    const msg = String(err && err.message || err);
    if (!/UNIQUE|constraint/i.test(msg)) throw err;
  }
}
__name(openLiveAuction, "openLiveAuction");
async function lazyClose(env) {
  const ts = now();
  const due = await env.DB.prepare(`
    SELECT id, slot_id, ends_at FROM auctions
     WHERE status = 'live' AND ends_at <= ?
     ORDER BY ends_at ASC
     LIMIT 20
  `).bind(ts).all();
  for (const a of due.results || []) {
    const top = await env.DB.prepare(
      `SELECT id, amount FROM bids WHERE auction_id = ? ORDER BY amount DESC, id ASC LIMIT 1`
    ).bind(a.id).first();
    if (top) {
      await env.DB.prepare(
        `UPDATE auctions SET status = 'awarded', winning_bid_id = ? WHERE id = ? AND status = 'live'`
      ).bind(top.id, a.id).run();
      const campaignHours = Math.max(1, Number(env.DEFAULT_CAMPAIGN_HOURS || 24));
      await env.DB.prepare(
        `INSERT INTO campaigns (bid_id, slot_id, starts_at, ends_at, active) VALUES (?, ?, ?, ?, 1)`
      ).bind(top.id, a.slot_id, ts, ts + campaignHours * 3600).run();
    } else {
      await env.DB.prepare(
        `UPDATE auctions SET status = 'noBids' WHERE id = ? AND status = 'live'`
      ).bind(a.id).run();
    }
    await openLiveAuction(env, a.slot_id, ts);
  }
  await env.DB.prepare(
    `UPDATE campaigns SET active = 0 WHERE active = 1 AND ends_at <= ?`
  ).bind(ts).run();
}
__name(lazyClose, "lazyClose");
var NAME_RE = /^[\p{L}\p{N}\s.\-_'!?&]{1,40}$/u;
var COLOR_RE = /^#[0-9a-fA-F]{6}$/;
var URL_RE = /^https:\/\/[^\s<>"]{1,200}$/;
var EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{1,16}$/;
function sanitizeName(s) {
  const t = String(s || "").trim().slice(0, 40);
  return NAME_RE.test(t) ? t : null;
}
__name(sanitizeName, "sanitizeName");
function sanitizeMsg(s) {
  return String(s || "").trim().slice(0, 140) || null;
}
__name(sanitizeMsg, "sanitizeMsg");
function sanitizeColor(s) {
  const t = String(s || "").trim();
  return COLOR_RE.test(t) ? t : null;
}
__name(sanitizeColor, "sanitizeColor");
function sanitizeUrl(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  return URL_RE.test(t) ? t : null;
}
__name(sanitizeUrl, "sanitizeUrl");
function sanitizeEmail(s) {
  if (!s) return null;
  const t = String(s).trim().slice(0, 192);
  return EMAIL_RE.test(t) ? t : null;
}
__name(sanitizeEmail, "sanitizeEmail");
function sanitizeAmount(s) {
  const n = Math.floor(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
__name(sanitizeAmount, "sanitizeAmount");
async function getInventoryShape(env) {
  await lazyClose(env);
  const ts = now();
  const joined = await env.DB.prepare(`
    SELECT
      s.id AS slot_id, s.name, s.channel, s.kind, s.size, s.reserve_price,
      s.description, s.surface_ref, s.sort_order,
      a.id AS auction_id, a.starts_at, a.ends_at, a.status AS auction_status
    FROM slots s
    LEFT JOIN auctions a ON a.slot_id = s.id AND a.status = 'live'
    ORDER BY s.sort_order ASC, s.id ASC
  `).all();
  const rows = joined.results || [];
  const auctionIds = [...new Set(rows.map((r) => r.auction_id).filter(Boolean))];
  const leadersByAuction = /* @__PURE__ */ new Map();
  if (auctionIds.length) {
    const ph = auctionIds.map(() => "?").join(",");
    const leaders = await env.DB.prepare(`
      SELECT b.auction_id, b.bidder_name, b.brand_name, b.brand_color, b.brand_message,
             b.brand_logo_url, b.amount, b.ts
        FROM bids b
       WHERE b.auction_id IN (${ph})
         AND b.id = (
           SELECT b2.id FROM bids b2
            WHERE b2.auction_id = b.auction_id
            ORDER BY b2.amount DESC, b2.id ASC
            LIMIT 1
         )
    `).bind(...auctionIds).all();
    for (const L of leaders.results || []) {
      leadersByAuction.set(L.auction_id, L);
    }
  }
  const camps = await env.DB.prepare(`
    SELECT c.slot_id, c.id AS campaign_id, c.starts_at, c.ends_at,
           b.brand_name, b.brand_color, b.brand_message, b.brand_logo_url, b.amount, b.bidder_name
      FROM campaigns c
      JOIN bids b ON c.bid_id = b.id
     WHERE c.active = 1 AND c.ends_at > ?
     ORDER BY c.id DESC
  `).bind(ts).all();
  const campBySlot = /* @__PURE__ */ new Map();
  for (const c of camps.results || []) {
    if (!campBySlot.has(c.slot_id)) campBySlot.set(c.slot_id, c);
  }
  const items = [];
  for (const r of rows) {
    const leader = r.auction_id ? leadersByAuction.get(r.auction_id) || null : null;
    const camp = campBySlot.get(r.slot_id) || null;
    items.push({
      slot: {
        id: r.slot_id,
        name: r.name,
        channel: r.channel,
        kind: r.kind,
        size: r.size,
        reservePrice: r.reserve_price | 0,
        description: r.description,
        surfaceRef: r.surface_ref
      },
      auction: r.auction_id ? {
        id: r.auction_id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.auction_status,
        leader: leader ? {
          bidderName: leader.bidder_name,
          brandName: leader.brand_name,
          brandColor: leader.brand_color,
          brandMessage: leader.brand_message,
          brandLogoUrl: leader.brand_logo_url,
          amount: leader.amount | 0,
          ts: leader.ts | 0
        } : null,
        bidCount: leader ? 1 : 0
      } : null,
      activeCampaign: camp ? {
        id: camp.campaign_id,
        slotId: camp.slot_id,
        startsAt: camp.starts_at,
        endsAt: camp.ends_at,
        bidderName: camp.bidder_name,
        brandName: camp.brand_name,
        brandColor: camp.brand_color,
        brandMessage: camp.brand_message,
        brandLogoUrl: camp.brand_logo_url,
        amount: camp.amount | 0
      } : null
    });
  }
  return { items, serverTime: ts };
}
__name(getInventoryShape, "getInventoryShape");
async function handleInventory(request, env) {
  if (emergencyNoD1(env)) {
    return json(request, env, 200, staticInventoryPayload(), { "X-Emergency-No-D1": "1" });
  }
  const hit = inventoryCache && Date.now() - inventoryCache.ts < INVENTORY_CACHE_TTL_MS;
  if (hit) {
    return json(request, env, 200, inventoryCache.payload, { "X-Inventory-Cache": "HIT" });
  }
  await ensureSeed(env);
  const data = await getInventoryShape(env);
  inventoryCache = { ts: Date.now(), payload: data };
  return json(request, env, 200, data, { "X-Inventory-Cache": "MISS" });
}
__name(handleInventory, "handleInventory");
async function handleActiveCampaigns(request, env) {
  if (emergencyNoD1(env)) {
    return json(request, env, 200, {
      campaigns: {},
      serverTime: now(),
      emergency: true
    }, { "X-Emergency-No-D1": "1" });
  }
  if (inventoryCache && Date.now() - inventoryCache.ts < INVENTORY_CACHE_TTL_MS) {
    const map2 = {};
    for (const it of inventoryCache.payload.items || []) {
      if (it.activeCampaign) map2[it.slot.id] = {
        slotId: it.slot.id,
        brandName: it.activeCampaign.brandName,
        brandColor: it.activeCampaign.brandColor,
        brandMessage: it.activeCampaign.brandMessage,
        brandLogoUrl: it.activeCampaign.brandLogoUrl,
        bidderName: it.activeCampaign.bidderName,
        amount: it.activeCampaign.amount | 0,
        startsAt: it.activeCampaign.startsAt,
        endsAt: it.activeCampaign.endsAt
      };
    }
    return json(request, env, 200, {
      campaigns: map2,
      serverTime: inventoryCache.payload.serverTime,
      cached: true
    }, { "X-Inventory-Cache": "HIT" });
  }
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
  for (const r of rows.results || []) {
    if (map[r.slot_id]) continue;
    map[r.slot_id] = {
      slotId: r.slot_id,
      brandName: r.brand_name,
      brandColor: r.brand_color,
      brandMessage: r.brand_message,
      brandLogoUrl: r.brand_logo_url,
      bidderName: r.bidder_name,
      amount: r.amount | 0,
      startsAt: r.starts_at,
      endsAt: r.ends_at
    };
  }
  return json(request, env, 200, { campaigns: map, serverTime: ts });
}
__name(handleActiveCampaigns, "handleActiveCampaigns");
async function handleBid(request, env) {
  if (emergencyNoD1(env)) {
    return json(request, env, 503, {
      error: "emergency_d1_disabled",
      message: "Bidding paused while admira-marketplace-db purge runs (IN-79380980). Set EMERGENCY_NO_D1=0 after cleanup."
    });
  }
  inventoryCache = null;
  await ensureSeed(env);
  await lazyClose(env);
  const body = await readBody(request);
  const slotId = String(body.slotId || "").trim();
  if (!slotId) return json(request, env, 400, { error: "missing_slot_id" });
  const slot = await env.DB.prepare(`SELECT * FROM slots WHERE id = ?`).bind(slotId).first();
  if (!slot) return json(request, env, 404, { error: "slot_not_found" });
  const live = await env.DB.prepare(
    `SELECT id, starts_at, ends_at, status FROM auctions WHERE slot_id = ? AND status = 'live' LIMIT 1`
  ).bind(slotId).first();
  if (!live) return json(request, env, 409, { error: "no_live_auction" });
  if (now() > (live.ends_at | 0)) return json(request, env, 409, { error: "auction_ended" });
  const bidderName = sanitizeName(body.bidderName);
  const brandName = sanitizeName(body.brandName);
  const amount = sanitizeAmount(body.amount);
  const brandColor = sanitizeColor(body.brandColor) || "#78f3ff";
  const brandMsg = sanitizeMsg(body.brandMessage);
  const brandLogo = sanitizeUrl(body.brandLogoUrl);
  const email = sanitizeEmail(body.bidderEmail);
  if (!bidderName) return json(request, env, 400, { error: "invalid_bidder_name" });
  if (!brandName) return json(request, env, 400, { error: "invalid_brand_name" });
  if (amount == null) return json(request, env, 400, { error: "invalid_amount" });
  const top = await env.DB.prepare(
    `SELECT amount FROM bids WHERE auction_id = ? ORDER BY amount DESC, id ASC LIMIT 1`
  ).bind(live.id).first();
  const minIncrement = Math.max(1, Number(env.MIN_BID_INCREMENT || 5));
  const reserve = slot.reserve_price | 0;
  const minRequired = top ? (top.amount | 0) + minIncrement : reserve;
  if (amount < minRequired) {
    return json(request, env, 409, { error: "bid_too_low", minRequired, currentTop: top ? top.amount | 0 : 0, reserve });
  }
  const ts = now();
  const ip = await ipHash(request);
  await env.DB.prepare(`
    INSERT INTO bids (auction_id, bidder_name, bidder_email, amount, brand_name, brand_color, brand_message, brand_logo_url, ts, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(live.id, bidderName, email, amount, brandName, brandColor, brandMsg, brandLogo, ts, ip).run();
  if ((live.ends_at | 0) - ts < 60) {
    await env.DB.prepare(`UPDATE auctions SET ends_at = ? WHERE id = ?`).bind(ts + 60, live.id).run();
  }
  const data = await getInventoryShape(env);
  inventoryCache = { ts: Date.now(), payload: data };
  const item = data.items.find((it) => it.slot.id === slotId) || null;
  return json(request, env, 200, { ok: true, item, serverTime: ts });
}
__name(handleBid, "handleBid");
async function handleAdminSeed(request, env) {
  const body = await readBody(request);
  if (String(body.token || "") !== String(env.ADMIN_TOKEN || "")) return json(request, env, 403, { error: "forbidden" });
  if (emergencyNoD1(env)) return json(request, env, 503, { error: "emergency_d1_disabled" });
  inventoryCache = null;
  await ensureSeed(env);
  return json(request, env, 200, { ok: true });
}
__name(handleAdminSeed, "handleAdminSeed");
async function handleAdminClose(request, env) {
  const body = await readBody(request);
  if (String(body.token || "") !== String(env.ADMIN_TOKEN || "")) return json(request, env, 403, { error: "forbidden" });
  if (emergencyNoD1(env)) return json(request, env, 503, { error: "emergency_d1_disabled" });
  const slotId = String(body.slotId || "").trim();
  if (!slotId) return json(request, env, 400, { error: "missing_slot_id" });
  inventoryCache = null;
  const live = await env.DB.prepare(
    `SELECT id FROM auctions WHERE slot_id = ? AND status = 'live' LIMIT 1`
  ).bind(slotId).first();
  if (!live) return json(request, env, 409, { error: "no_live_auction" });
  await env.DB.prepare(`UPDATE auctions SET ends_at = ? WHERE id = ?`).bind(now() - 1, live.id).run();
  await lazyClose(env);
  return json(request, env, 200, { ok: true });
}
__name(handleAdminClose, "handleAdminClose");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (request.method === "GET" && path === "/health") {
        return json(request, env, 200, {
          ok: true,
          ts: now(),
          fix: "d1-bleed-v2",
          emergencyNoD1: emergencyNoD1(env),
          inventoryCacheTtlMs: INVENTORY_CACHE_TTL_MS,
          schemaReady
        });
      }
      if (request.method === "GET" && path === "/inventory") return await handleInventory(request, env);
      if (request.method === "GET" && path === "/active-campaigns") return await handleActiveCampaigns(request, env);
      if (request.method === "POST" && path === "/bid") return await handleBid(request, env);
      if (request.method === "POST" && path === "/admin/seed") return await handleAdminSeed(request, env);
      if (request.method === "POST" && path === "/admin/close") return await handleAdminClose(request, env);
      return json(request, env, 404, { error: "not_found", path });
    } catch (err) {
      return json(request, env, 500, { error: "server_error", message: String(err && err.message || err) });
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
