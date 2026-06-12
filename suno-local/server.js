#!/usr/bin/env node
// suno-local · proxy minimo a la API privada de Suno usando cookie de sesion (Clerk).
// Tres endpoints (los que consume PixerIA → playSunoLocal):
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
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

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
let SUNO_COOKIE = process.env.SUNO_COOKIE || '';
const CLERK_HOST = process.env.SUNO_CLERK_HOST || 'auth.suno.com';
const CLERK_VER = process.env.SUNO_CLERK_JS_VERSION || '5.117.0';
const CLERK_API_VER = process.env.SUNO_CLERK_API_VERSION || '2025-11-10';
const CLERK_QS = `__clerk_api_version=${encodeURIComponent(CLERK_API_VER)}&_clerk_js_version=${encodeURIComponent(CLERK_VER)}`;
const SUNO_API = process.env.SUNO_API_BASE || 'https://studio-api-prod.suno.com';
const ALLOWED_ORIGINS = (process.env.SUNO_ALLOWED_ORIGINS
  || 'https://csilvasantin.github.io,http://localhost,http://127.0.0.1')
  .split(',').map(s => s.trim()).filter(Boolean);
const UA = process.env.SUNO_UA
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

// ─── Estado de auth (compartido entre Chrome refresh y Clerk flow) ──
let cachedSid = null;
let cachedJwt = null;
let cachedJwtExp = 0;
let DIRECT_JWT_MODE = false;

// ─── Auto-refresh desde Chrome (macOS) ───────────────────────────────
// Lee las cookies de Suno directamente del SQLite de Chrome y las
// descifra con la clave del Keychain. Esto incluye __client (HttpOnly,
// no accesible por JS) que es lo que permite que Clerk auto-refresque
// el JWT cada hora sin recopiar nada a mano.
//
// Requisitos:
//   - macOS, Chrome instalado en ~/Library/Application Support/Google/Chrome.
//   - Sesión iniciada en suno.com en el profile "Default".
//   - Keychain accesible (pedirá permiso la primera vez al leer "Chrome Safe Storage").
//
// Si no estamos en macOS o Chrome no está, no hace nada y se respeta
// el SUNO_COOKIE del .env.
const CHROME_PROFILE = process.env.SUNO_CHROME_PROFILE || 'Default';
const CHROME_COOKIES_PATH = path.join(
  os.homedir(), 'Library/Application Support/Google/Chrome', CHROME_PROFILE, 'Cookies'
);
let CHROME_REFRESH_OK = false;

function refreshCookieFromChrome() {
  if (process.platform !== 'darwin') return false;
  if (!fs.existsSync(CHROME_COOKIES_PATH)) return false;
  try {
    const tmp = path.join(os.tmpdir(), `suno-local-chrome-cookies-${process.pid}.sqlite`);
    fs.copyFileSync(CHROME_COOKIES_PATH, tmp);
    const pw = execSync('security find-generic-password -wa "Chrome" -s "Chrome Safe Storage"',
      { encoding: 'utf8' }).trim();
    const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
    const iv = Buffer.alloc(16, ' ');

    function decrypt(blob, hostKey) {
      if (!blob || blob.length < 4) return '';
      if (blob.slice(0, 3).toString() !== 'v10') return blob.toString();
      const ct = blob.slice(3);
      const dec = crypto.createDecipheriv('aes-128-cbc', key, iv);
      let pt = Buffer.concat([dec.update(ct), dec.final()]);
      // Chrome ≥v24 prepende sha256(host_key) (32 bytes) al plaintext.
      if (hostKey && pt.length > 32) {
        const expected = crypto.createHash('sha256').update(hostKey).digest();
        if (pt.slice(0, 32).equals(expected)) pt = pt.slice(32);
      }
      return pt.toString('utf8');
    }

    const out = execSync(
      `/usr/bin/sqlite3 -separator $'\\t' "${tmp}" ` +
      `"SELECT name, host_key, hex(encrypted_value) FROM cookies ` +
      `WHERE host_key LIKE '%suno.com' AND name IN ('__client','__session','__client_uat','_cfuvid');"`,
      { encoding: 'utf8' }
    ).trim();
    try { fs.unlinkSync(tmp); } catch (_) {}

    const wanted = ['__client', '__session', '__client_uat', '_cfuvid'];
    const found = {};
    for (const row of out.split('\n')) {
      if (!row) continue;
      const [name, host, hex] = row.split('\t');
      if (!wanted.includes(name)) continue;
      const val = decrypt(Buffer.from(hex, 'hex'), host);
      // __session aparece duplicado (suno.com + .suno.com); el de suno.com es el último escrito.
      // Si ya tenemos uno, nos quedamos con el JWT con mayor exp (parsed).
      if (found[name]) {
        try {
          const expOf = (jwt) => {
            const p = jwt.split('.');
            if (p.length !== 3) return 0;
            const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
            const j = JSON.parse(Buffer.from(pad(p[1]).replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
            return j.exp || 0;
          };
          if (expOf(val) > expOf(found[name])) found[name] = val;
        } catch (_) {}
      } else {
        found[name] = val;
      }
    }
    if (!found['__client'] || !found['__session']) {
      console.log('⚠ Chrome cookies sin __client/__session — ¿estás logueado en suno.com en Chrome?');
      return false;
    }
    const cookie = Object.entries(found).map(([n,v]) => `${n}=${v}`).join('; ');
    SUNO_COOKIE = cookie;
    cachedSid = null; cachedJwt = null; cachedJwtExp = 0;
    DIRECT_JWT_MODE = false;
    CHROME_REFRESH_OK = true;
    return true;
  } catch (e) {
    console.log('⚠ refreshCookieFromChrome:', e.message);
    return false;
  }
}

// Intento de auto-refresh al arranque. Si funciona, ignoramos lo que
// hubiera en .env (Chrome siempre es más fresco). Si no, caemos al
// .env como antes.
if (refreshCookieFromChrome()) {
  console.log('✓ Cookie de Suno leída de Chrome (auto-refresh activado)');
} else if (!SUNO_COOKIE) {
  console.error('✗ SUNO_COOKIE no esta definido en .env y no se pudo leer de Chrome');
  console.error('  Opciones: (a) loguéate en suno.com en Chrome, (b) pega cookie en .env');
  process.exit(1);
}

// Reintento periódico cada 10 min: Chrome actualiza __session cada
// hora; con esto el server siempre tiene el JWT fresco sin que la
// página haga nada.
setInterval(() => {
  if (refreshCookieFromChrome()) {
    // silencio en consola para no spamear; solo log si algo cambia.
  }
}, 10 * 60 * 1000).unref();

// Cuando Clerk dice 401/403 (cookies caducadas o usuario deslogueado),
// abrimos Chrome en /sign-in y avisamos por Telegram. Throttle de 15 min
// para que un /healthz polling no spamee aperturas.
let LAST_REAUTH_PROMPT = 0;
const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || '';

function promptUserToReauth(reason) {
  if (Date.now() - LAST_REAUTH_PROMPT < 15 * 60 * 1000) return;
  LAST_REAUTH_PROMPT = Date.now();
  // 1) Reintenta refrescar desde Chrome — quizá el usuario ya se logueó.
  if (refreshCookieFromChrome()) {
    console.log('↻ Re-leído de Chrome tras error Clerk — JWT debería volver a funcionar.');
    return;
  }
  console.log('⚠ Sesión Suno caducada en Chrome. Abriendo /sign-in…  motivo:', reason);
  try { execSync(`open -a "Google Chrome" "https://suno.com/sign-in"`); } catch (_) {}
  if (TELEGRAM_BOT && TELEGRAM_CHAT) {
    const text = `⚠️ Admira DJ: sesión caducada (${reason}). Te he abierto la ventana de login para que vuelvas a entrar. Una vez logueado, el servicio retoma solo en ≤10 min (o reinícialo).`;
    const body = `chat_id=${encodeURIComponent(TELEGRAM_CHAT)}&text=${encodeURIComponent(text)}`;
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`, {
      method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body,
    }).catch(()=>{});
  }
}

// ─── Clerk auth ─────────────────────────────────────────────────────
// Modo directo (fallback): extraer el JWT directamente del cookie
// __session cuando solo tenemos cookies accesibles por JS (sin
// __client HttpOnly). Si Chrome refresh funcionó, este bloque no
// hace nada y usamos el flujo Clerk normal (con auto-refresh).
if (!CHROME_REFRESH_OK) (function extractDirectJwt() {
  const m = SUNO_COOKIE.match(/(?:^|;\s*)__session=([^;]+)/);
  if (!m) return;
  const jwt = m[1].trim();
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return;
    const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
    const payload = JSON.parse(Buffer.from(pad(parts[1]).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const expMs = payload.exp ? payload.exp * 1000 : 0;
    if (expMs && expMs > Date.now()) {
      cachedJwt = jwt;
      cachedJwtExp = expMs;
      DIRECT_JWT_MODE = true;
      const mins = Math.round((expMs - Date.now()) / 60000);
      console.log(`✓ JWT extraído del cookie __session (modo directo, caduca en ${mins} min — sin auto-refresh)`);
    } else {
      console.log(`⚠ JWT del cookie __session ${expMs ? 'YA CADUCÓ' : 'no tiene exp legible'} — intentaré refrescar vía Clerk`);
    }
  } catch (e) {
    console.log('⚠ no pude parsear el JWT del cookie __session:', e.message);
  }
})();

async function getSessionId() {
  if (cachedSid) return cachedSid;
  const r = await fetch(`https://${CLERK_HOST}/v1/client?${CLERK_QS}`, {
    headers: {
      cookie: SUNO_COOKIE, 'user-agent': UA, accept: 'application/json',
      origin: 'https://suno.com', referer: 'https://suno.com/',
    },
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) promptUserToReauth(`clerk client list ${r.status}`);
    throw new Error(`clerk client list failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const data = await r.json();
  const sessions = data?.response?.sessions || [];
  const active = sessions.find(s => s.status === 'active') || sessions[0];
  if (!active?.id) {
    promptUserToReauth('no active session');
    throw new Error('no active suno session in cookie · reloguea en la ventana de Chrome que acabo de abrir');
  }
  cachedSid = active.id;
  return cachedSid;
}

async function getJwt() {
  if (cachedJwt && Date.now() < cachedJwtExp - 30_000) return cachedJwt;
  if (DIRECT_JWT_MODE) {
    throw new Error('JWT directo caducó · recopia la cookie __session desde suno.com (vía JS de la página) — sin __client no podemos refrescar vía Clerk');
  }
  const sid = await getSessionId();
  const r = await fetch(
    `https://${CLERK_HOST}/v1/client/sessions/${sid}/tokens?${CLERK_QS}`,
    { method: 'POST', headers: {
      cookie: SUNO_COOKIE, 'user-agent': UA, accept: 'application/json',
      origin: 'https://suno.com', referer: 'https://suno.com/',
    } }
  );
  if (!r.ok) {
    cachedSid = null; // forzar redescubrimiento
    if (r.status === 401 || r.status === 403) promptUserToReauth(`clerk token ${r.status}`);
    throw new Error(`clerk token refresh failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data?.jwt) throw new Error('clerk response missing jwt');
  cachedJwt = data.jwt;
  cachedJwtExp = Date.now() + 50_000;
  return cachedJwt;
}

// ─── Puppeteer (Chromium invisible para puentear Turnstile) ──────────
// Suno ha endurecido Cloudflare Turnstile en /api/generate/v2/ y similar:
// rechaza 422 'token_validation_failed' aunque el JWT sea válido si la
// request no viene de un contexto de navegador "limpio" (cf_clearance,
// challenge cookies). Solución: lanzamos un Chromium headless al
// arrancar, le inyectamos las cookies decifradas de tu Chrome, lo
// dejamos en https://suno.com/create, y todos los fetch a la API se
// ejecutan DENTRO de esa página via page.evaluate. El navegador
// resuelve Turnstile solo en el primer navigate y reutilizamos.
let puppeteer = null;
try {
  // puppeteer-extra + stealth disfraza marcadores de automation que Cloudflare/Clerk
  // usan para detectar headless. Sigue habiendo casos (Clerk Turnstile en endpoints
  // como /api/generate/v2/) donde Suno rechaza igual; el bypass completo requiere
  // que el widget Turnstile renderice — fuera de alcance hoy.
  puppeteer = require('puppeteer-extra');
  const stealth = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(stealth());
} catch (e) {
  try { puppeteer = require('puppeteer'); } catch (e2) {
    console.log('⚠ puppeteer no instalado — /generate y /status no funcionarán (solo /healthz)');
  }
}
let browser = null;
let page = null;
let pageReadyPromise = null;

function buildPuppeteerCookies() {
  if (process.platform !== 'darwin' || !fs.existsSync(CHROME_COOKIES_PATH)) return [];
  try {
    const tmp = path.join(os.tmpdir(), `suno-local-pup-${process.pid}.sqlite`);
    fs.copyFileSync(CHROME_COOKIES_PATH, tmp);
    const pw = execSync('security find-generic-password -wa "Chrome" -s "Chrome Safe Storage"', {encoding:'utf8'}).trim();
    const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
    const iv = Buffer.alloc(16, ' ');
    function dec(b, h){
      if(!b||b.length<4)return'';
      if(b.slice(0,3).toString()!=='v10')return b.toString();
      const d=crypto.createDecipheriv('aes-128-cbc',key,iv);
      let p=Buffer.concat([d.update(b.slice(3)),d.final()]);
      if(h&&p.length>32){const e=crypto.createHash('sha256').update(h).digest();if(p.slice(0,32).equals(e))p=p.slice(32);}
      return p.toString('utf8');
    }
    const rows = execSync(
      `/usr/bin/sqlite3 -separator $'\\t' "${tmp}" "SELECT name, host_key, hex(encrypted_value), is_secure, is_httponly, path FROM cookies WHERE host_key LIKE '%suno.com';"`,
      {encoding:'utf8'}
    ).trim().split('\n');
    try { fs.unlinkSync(tmp); } catch(_) {}
    const out = [];
    for (const r of rows) {
      if (!r) continue;
      const [name, host, hex, sec, http, cpath] = r.split('\t');
      out.push({name, value: dec(Buffer.from(hex,'hex'), host), domain: host, path: cpath||'/', secure: sec==='1', httpOnly: http==='1', sameSite:'Lax'});
    }
    return out;
  } catch (e) {
    console.log('⚠ buildPuppeteerCookies:', e.message);
    return [];
  }
}

async function ensurePage() {
  if (page && !page.isClosed()) return page;
  if (pageReadyPromise) return pageReadyPromise;
  if (!puppeteer) throw new Error('puppeteer no instalado');
  pageReadyPromise = (async () => {
    if (!browser) {
      // HEADFUL + perfil PERSISTENTE: Suno protege /generate con Turnstile/browser-token
      // que solo produce su JS en un navegador "real". Un Chromium headless efímero
      // choca (422). Headful + userDataDir persistente conserva cf_clearance y el
      // reto Turnstile entre arranques (se resuelve, como mucho, una vez a mano).
      const profileDir = process.env.SUNO_BROWSER_PROFILE_DIR || path.join(__dirname, '.suno-chrome-profile');
      const headless = process.env.SUNO_HEADLESS === '1';
      browser = await puppeteer.launch({
        headless,
        userDataDir: profileDir,
        args: ['--no-sandbox','--disable-blink-features=AutomationControlled','--disable-features=IsolateOrigins,site-per-process'],
        defaultViewport: null,
      });
      console.log(`✓ Chrome puppeteer ${headless?'headless':'headful'} · perfil ${profileDir}`);
      browser.on('disconnected', () => { browser = null; page = null; pageReadyPromise = null; });
    }
    const pages = await browser.pages();
    const p = pages.find(pg => { try { return pg.url().includes('suno.com'); } catch(_) { return false; } }) || await browser.newPage();
    await p.setUserAgent(UA);
    const cookies = buildPuppeteerCookies();
    if (cookies.length) { try { await p.setCookie(...cookies); } catch(_) {} }
    if (!p.url().includes('suno.com/create')) {
      console.log(`↻ Puppeteer: navegando a suno.com/create (${cookies.length} cookies inyectadas)…`);
      await p.goto('https://suno.com/create', {waitUntil:'networkidle2', timeout:60000});
    }
    // Esperar a que el composer (textareas de React) renderice de verdad —
    // sin esto, /generate y /dryrun a veces ven el DOM vacío (timing).
    try { await p.waitForFunction(() => document.querySelectorAll('textarea').length >= 2, { timeout: 25000 }); } catch(_) {}
    console.log('✓ Puppeteer: página suno.com lista');
    page = p;
    return p;
  })();
  try { return await pageReadyPromise; }
  finally { pageReadyPromise = null; }
}

// Cada 30 min refrescamos la sesión del navegador re-inyectando cookies
// frescas de tu Chrome (que rota __session vía Clerk en la web visible).
setInterval(async () => {
  if (!page || page.isClosed()) return;
  const cookies = buildPuppeteerCookies();
  if (cookies.length) {
    try { await page.setCookie(...cookies); } catch(_) {}
  }
}, 30 * 60 * 1000).unref();

async function sunoFetch(p, opts = {}) {
  const pg = await ensurePage();
  const jwt = await getJwt().catch(() => '');
  const result = await pg.evaluate(async (url, payload, jwt) => {
    const headers = {
      'Content-Type': 'application/json',
      'accept': 'application/json',
      ...(payload.headers || {}),
    };
    if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
    // Suno requires these on most studio-api endpoints. Sniffed 2026-05-28.
    headers['browser-token'] = JSON.stringify({ token: btoa(JSON.stringify({ timestamp: Date.now() })) });
    const did = document.cookie.match(/suno_device_id=([^;]+)/);
    if (did && !headers['device-id']) headers['device-id'] = did[1];
    const r = await fetch(url, {
      method: payload.method || 'GET',
      headers,
      body: payload.body || undefined,
      credentials: 'include',
    });
    return { status: r.status, ok: r.ok, text: await r.text() };
  }, SUNO_API + p, { method: opts.method, body: opts.body, headers: opts.headers || {} }, jwt);
  // Devolvemos un objeto compatible con la Response usada antes por los handlers.
  return {
    ok: result.ok,
    status: result.status,
    text: async () => result.text,
    json: async () => JSON.parse(result.text),
  };
}

// ─── Generación CONDUCIENDO LA UI real (esquiva Turnstile) ───────────
// Suno valida /api/generate con un browser-token que solo produce su JS al
// pulsar Create de verdad. En vez de fabricarlo (imposible), tecleamos la
// descripción y pulsamos Create en la página real; luego recogemos los clips
// nuevos del feed (que SÍ se lee solo con el JWT).
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getFeedIds(pg) {
  return pg.evaluate(async () => {
    try {
      const jwt = await window.Clerk.session.getToken();
      const r = await fetch('https://studio-api-prod.suno.com/api/feed/v2?page=0',
        { headers: { Authorization: 'Bearer ' + jwt }, credentials: 'include' });
      const d = await r.json();
      const clips = d.clips || d || [];
      return (Array.isArray(clips) ? clips : []).map(c => c.id);
    } catch (e) { return []; }
  });
}

async function getFeedClips(pg, ids) {
  return pg.evaluate(async (wantIds) => {
    try {
      const jwt = await window.Clerk.session.getToken();
      const want = new Set(wantIds);
      // El feed devuelve los más recientes; basta page 0 para clips recién creados.
      const r = await fetch('https://studio-api-prod.suno.com/api/feed/v2?page=0',
        { headers: { Authorization: 'Bearer ' + jwt }, credentials: 'include' });
      const d = await r.json();
      const clips = d.clips || d || [];
      return (Array.isArray(clips) ? clips : []).filter(c => want.has(c.id)).map(c => ({
        id: c.id, title: c.title, status: c.status,
        audio_url: c.audio_url, video_url: c.video_url, image_url: c.image_url,
        metadata: { duration: c.metadata && c.metadata.duration },
      }));
    } catch (e) { return []; }
  }, ids);
}

async function uiGenerate(pg, { prompt, lyrics, title, instrumental }) {
  if (!pg.url().includes('suno.com/create')) {
    await pg.goto('https://suno.com/create', { waitUntil: 'networkidle2', timeout: 60000 });
  }
  // Confirmar sesión — Clerk hidrata async tras cargar la página, así que esperamos.
  const logged = await pg.evaluate(async () => {
    for (let i = 0; i < 24; i++) { if (window.Clerk && window.Clerk.session) return true; await new Promise(r => setTimeout(r, 500)); }
    return false;
  });
  if (!logged) { promptUserToReauth('puppeteer page sin sesión Clerk'); throw new Error('no logueado en suno.com en el Chrome del proxy'); }

  const before = new Set(await getFeedIds(pg));

  // 1) Si se pide instrumental, activar el toggle (sin cambiar de modo: el campo
  //    de descripción de canción de Custom es el que habilita Create).
  if (instrumental) {
    await pg.evaluate(() => {
      const inst = [...document.querySelectorAll('button')].find(b => /^instrumental$/i.test((b.innerText||'').trim()));
      if (inst && inst.getAttribute('aria-pressed') !== 'true' && !/on|active/i.test(inst.getAttribute('data-state')||'')) inst.click();
    });
    await sleep(300);
  }

  // Helper de relleno que React registra (valueTracker) → habilita Create.
  const fillField = (s, txt) => pg.evaluate((sel, t) => {
    const el = document.querySelector(sel); if (!el) return; el.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    const last = el.value; setter.call(el, t);
    if (el._valueTracker) el._valueTracker.setValue(last);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, s, txt);

  if (lyrics) {
    // ── Modo LETRA (Custom): rellenar Lyrics + Estilos (prompt como tags). ──
    const lyrSel = await pg.evaluate(() => {
      const t = [...document.querySelectorAll('textarea')].filter(x => x.offsetParent !== null)
        .find(x => /\[|verse|chorus|estrofa|lyric|letra/i.test(x.placeholder || ''));
      if (!t) return null; if (!t.id) t.id = '__suno_lyrics'; return '#' + t.id;
    });
    if (!lyrSel) throw new Error('no encuentro el campo de Letra en suno/create');
    await fillField(lyrSel, String(lyrics).slice(0, 2900));
    if (prompt) {
      const styleSel = await pg.evaluate(() => {
        const tas = [...document.querySelectorAll('textarea')].filter(x => x.offsetParent !== null);
        const t = tas.find(x => /style|genre|estilo|g[eé]nero|tags?/i.test(x.placeholder || ''))
          || tas.find(x => !/\[|verse|chorus|song|canci|about|describe/i.test(x.placeholder || '') && (x.placeholder || '').length < 70 && (x.placeholder || '').includes(','));
        if (!t) return null; if (!t.id) t.id = '__suno_styles'; return '#' + t.id;
      });
      if (styleSel) await fillField(styleSel, String(prompt).slice(0, 200));
    }
    await sleep(800);
  } else {
    // ── Modo AUTO: descripción de canción (la que habilita Create). ──
    const sel = await pg.evaluate(() => {
      const tas = [...document.querySelectorAll('textarea')].filter(t => t.offsetParent !== null);
      const isLyrics = t => /\[|verse|chorus|estrofa/i.test(t.placeholder || '');
      const ta = tas.find(t => !isLyrics(t) && /song|canci|about|sobre|singer|expressive|deep house|story|historia|describe the sound/i.test(t.placeholder || ''))
              || tas.find(t => !isLyrics(t) && (t.placeholder || '').length > 25);
      if (!ta) return null;
      if (!ta.id) ta.id = '__suno_desc';
      return '#' + ta.id;
    });
    if (!sel) throw new Error('no encuentro el campo de descripción en suno/create');
    await fillField(sel, String(prompt || 'instrumental ambient bed').slice(0, 400));
    await sleep(700);
  }

  const clicked = await pg.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => {
      const t = (x.innerText || '').trim().toLowerCase();
      return (t === 'create' || t === 'crear') && !x.disabled;
    });
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) throw new Error('botón Create no disponible tras teclear la descripción');

  // Poll del feed hasta que aparezcan clips nuevos (la request tarda en registrar).
  let fresh = [];
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const ids = await getFeedIds(pg);
    fresh = ids.filter(id => !before.has(id));
    if (fresh.length) break;
  }
  if (!fresh.length) throw new Error('no aparecieron clips nuevos tras Create (¿Turnstile bloqueó la generación?)');
  return fresh.slice(0, 4);
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
    const lyrics = String(body.lyrics || '').slice(0, 3000).trim();
    const title = String(body.title || '').slice(0, 80).trim();
    if (!prompt && !lyrics) { sendJson(res, 400, { error: 'missing prompt or lyrics' }); return; }
    // Generamos CONDUCIENDO la UI real (no raw API): es la única forma que pasa
    // el Turnstile/browser-token de Suno. Devolvemos los ids de los clips nuevos;
    // el frontend hace polling a /status para recoger audio_url cuando estén listos.
    const pg = await ensurePage();
    const newIds = await uiGenerate(pg, { prompt, lyrics, title, instrumental: !!body.instrumental });
    const clips = newIds.map(id => ({ id, title: title || '', status: 'submitted' }));
    sendJson(res, 200, { clips, ids: newIds, mode: lyrics ? 'custom' : 'auto' });
  } catch (e) {
    sendJson(res, 502, { error: String(e.message || e), hint: 'driveUI' });
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
    // Leemos el feed DENTRO de la página real con el JWT (no necesita Turnstile).
    const pg = await ensurePage();
    const clips = await getFeedClips(pg, ids);
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
