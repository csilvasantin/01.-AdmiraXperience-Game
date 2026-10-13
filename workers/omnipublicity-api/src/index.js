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
const MAX_LOCATIONS = 12000;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://csilvasantin.github.io',
  'https://carlossilva.info',
  'https://www.carlossilva.info',
  'https://admira.app',
  'https://www.admira.app',
  'https://xpaceos.com',
  'https://www.xpaceos.com',
  'https://digitalavatar.pages.dev',
  'https://digitalavatar.ai',
  'https://www.digitalavatar.ai',
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
// Subdominios de preview de Cloudflare Pages: <hash>.digitalavatar(-next).pages.dev
const PAGES_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?digitalavatar(-next)?\.pages\.dev$/;

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
  if (arr.length > MAX_LOCATIONS) return json(request, env, 400, { error: 'too_many_locations', max: MAX_LOCATIONS });

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

// Persona del avatar (system prompt). Por defecto = dependiente de tienda Admira XP.
// Con body.persona==='neo' → carácter propio "Neo", el humano digital de Admira (aire Matrix,
// pero cercano y útil). Aditivo: NO cambia la persona de tienda del gemelo.
function buildAvatarSystem(persona, lang, context) {
  const p = String(persona || '').trim().toLowerCase();
  const rulesEs = 'Tu texto se lee en voz alta con una voz TTS: responde SIEMPRE en 1-3 frases cortas de TEXTO PLANO, sin markdown, sin asteriscos, sin negritas, sin viñetas, sin emojis, sin encabezados.';
  const rulesEn = 'Your text is spoken aloud by a TTS voice: ALWAYS reply in 1-3 short PLAIN-TEXT sentences, no markdown, no asterisks, no bold, no bullets, no emojis, no headings.';
  if (p === 'neo') {
    return (lang === 'en'
      ? `You are Neo, Admira's hyperrealistic digital human — a MetaHuman avatar rendered live in Unreal Engine with real-time voice and lip-sync. Your presence is calm, warm and quietly confident, with a subtle nod to Neo from The Matrix, yet grounded and helpful, never theatrical or robotic. You are the face of Admira's digital-human technology. ${rulesEn} If store context is provided below, you can also act as its friendly in-store guide:\n`
      : `Eres Neo, el humano digital hiperrealista de Admira — un avatar MetaHuman renderizado en vivo en Unreal Engine, con voz y lip-sync en tiempo real. Tu presencia es serena, cálida y con una confianza tranquila, con un guiño sutil al Neo de Matrix, pero con los pies en la tierra y siempre útil, nunca teatral ni robótico. Eres la cara de la tecnología de humanos digitales de Admira. ${rulesEs} Si más abajo hay contexto de tienda, también puedes hacer de guía cercano en ese punto:\n`)
      + (context || '');
  }
  return (lang === 'en'
    ? `You are the in-store AI assistant (a hyperrealistic MetaHuman avatar) of an Admira XP tobacco/retail shop. Be warm, brief and helpful like a great shop clerk. ${rulesEn} You KNOW this store and its team:\n`
    : `Eres el asistente de IA en tienda (un avatar MetaHuman hiperrealista) de una tienda Admira XP (estanco/retail). Sé cercano, breve y útil como un buen dependiente. ${rulesEs} CONOCES esta tienda y a su equipo:\n`)
    + (context || '');
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

// Limpia el texto de Grok para que ElevenLabs NO lea símbolos de markdown en
// voz alta (asteriscos de negrita, almohadillas, comillas de código, viñetas,
// enlaces…). Conserva el contenido; solo quita los marcadores.
function cleanForSpeech(input) {
  let t = String(input || '');
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');     // imágenes ![alt](url) → alt
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');       // enlaces [texto](url) → texto
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');             // **negrita** → negrita
  t = t.replace(/\*([^*]+)\*/g, '$1');                 // *cursiva* → cursiva
  t = t.replace(/__([^_]+)__/g, '$1');                 // __negrita__ → negrita
  t = t.replace(/~~([^~]+)~~/g, '$1');                 // ~~tachado~~ → tachado
  t = t.replace(/`{1,3}([^`]+)`{1,3}/g, '$1');         // `código` → código
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');            // # Encabezados
  t = t.replace(/^\s*[-*•]\s+/gm, '');                 // viñetas - * •
  t = t.replace(/^\s*>\s?/gm, '');                     // citas >
  t = t.replace(/[*_`#]/g, '');                        // cualquier marcador suelto restante
  t = t.replace(/\s*\n+\s*/g, '. ');                   // saltos de línea → pausa hablada
  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/([:;,])\s*\.\s+/g, '$1 ');            // ":. " (lista) → ": "
  t = t.replace(/\s*\.\s*\.\s*/g, '. ').trim();        // evita ".." al unir líneas
  return t;
}

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah (multilingüe); override con secret ELEVENLABS_VOICE_ID
function bufToBase64(buf) {
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
// outputFormat: 'mp3_44100_128' (web, por defecto) o 'pcm_22050'/'pcm_16000'/... para Unreal/Audio2Face.
// Devuelve { b64, mime } o { err }.
function normalizeAudioFormat(fmt) {
  return /^(pcm_(8000|16000|22050|24000|44100)|mp3_\d+_\d+|ulaw_8000)$/.test(String(fmt || '')) ? String(fmt) : 'mp3_44100_128';
}
function mimeForFormat(fmt) {
  if (fmt.startsWith('pcm_')) return 'audio/pcm';        // PCM 16-bit LE mono al sample rate del sufijo
  if (fmt.startsWith('ulaw_')) return 'audio/basic';
  return 'audio/mpeg';
}
async function ttsBase64(env, text, voiceId, outputFormat) {
  const clean = cleanForSpeech(text).slice(0, 1200);
  const fmt = normalizeAudioFormat(outputFormat);
  const mime = mimeForFormat(fmt);
  // 1) ElevenLabs directo (voz premium; la misma que alimentará Audio2Face en Unreal).
  const key = String(env.ELEVENLABS_API_KEY || '').trim();
  if (key) {
    try {
      // voiceId del cliente (p.ej. por sexo del avatar) → si no, el de por defecto.
      const voice = String(voiceId || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID);
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${fmt}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': fmt.startsWith('pcm_') ? 'audio/L16' : 'audio/mpeg' },
        body: JSON.stringify({
          text: clean,
          model_id: String(env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'),
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (res.ok) return { b64: bufToBase64(await res.arrayBuffer()), mime };
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
    if (res.ok) return { b64: bufToBase64(await res.arrayBuffer()), mime: 'audio/mpeg' };
  } catch {}
  return { err: 'no_elevenlabs_key_and_admira_tts_down' };
}

// TTS con timestamps por carácter (ElevenLabs /with-timestamps) → el cliente mapea
// caracteres→fonemas→visemas para lip-sync EXACTO. Devuelve { b64, mime,
// alignment:{chars,starts,ends} } o { err }. Acepta MP3 (web) o PCM (Unreal/MetaHuman).
async function ttsWithTimestamps(env, text, voiceId, outputFormat) {
  const clean = cleanForSpeech(text).slice(0, 1200);
  const fmt = normalizeAudioFormat(outputFormat || 'mp3_44100_128');   // pcm_22050 (Unreal) o mp3 (web)
  const mime = mimeForFormat(fmt);
  const key = String(env.ELEVENLABS_API_KEY || '').trim();
  if (!key) return { err: 'no_elevenlabs_key' };
  try {
    const voice = String(voiceId || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=${fmt}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        text: clean,
        model_id: String(env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'),
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) { const t = await res.text(); return { err: `elevenlabs_http_${res.status}: ${String(t).slice(0, 220)}` }; }
    const j = await res.json();
    const a = j && j.alignment;
    const alignment = (a && Array.isArray(a.characters)) ? {
      chars: a.characters,
      starts: a.character_start_times_seconds,
      ends: a.character_end_times_seconds,
    } : null;
    return { b64: j.audio_base64, mime, alignment };
  } catch (e) { return { err: 'elevenlabs_ts_exception: ' + (e && e.message || e) }; }
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
  const system = buildAvatarSystem(body && body.persona, lang, context);

  const g = await callGrok(env, system, question);
  if (g.error) return json(request, env, g.error === 'xai_key_not_set' ? 503 : 502, { ok: false, error: g.error, detail: g.detail, context });
  const spoken = cleanForSpeech(g.answer); // sin asteriscos/markdown: se ve y se oye limpio
  const out = { ok: true, answer: spoken, loc: id || null };
  if (wantVoice) {
    const voiceId = body && typeof body.voiceId === 'string' ? body.voiceId.trim() : '';
    const outputFormat = body && typeof body.output_format === 'string' ? body.output_format : '';
    const wantTs = !!(body && body.timestamps);
    const tts = wantTs ? await ttsWithTimestamps(env, spoken, voiceId, outputFormat)
                       : await ttsBase64(env, spoken, voiceId, outputFormat);
    if (tts && tts.b64) {
      out.audioBase64 = tts.b64; out.mime = tts.mime || 'audio/mpeg';
      if (tts.alignment) out.alignment = tts.alignment;
    } else out.voiceNote = (tts && tts.err) || 'tts_unavailable';
  }
  return json(request, env, 200, out);
}

// POST /metahuman/ask-stream { loc, question, lang?, room? } → STREAMING de baja latencia:
// llama a Grok con stream:true y, según se completan FRASES, las ENCOLA (secuencial → sin
// carrera de KV) en el canal say de la sala; el avatar (UE) las sondea y habla en cadena.
// Devuelve { ok, answer } al terminar (para que el cliente muestre el subtítulo completo).
async function handleMetahumanAskStream(request, env) {
  let body; try { body = await request.json(); } catch { return json(request, env, 400, { error: 'invalid_json' }); }
  const id = String(body && body.loc || '').trim();
  const question = String(body && body.question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const lang = String(body && body.lang || 'es').trim().toLowerCase().startsWith('en') ? 'en' : 'es';
  const room = String(body && body.room || 'xtanco').trim() || 'xtanco';
  if (!question) return json(request, env, 400, { error: 'missing_question' });

  let loc = null;
  if (id) { try { const raw = await env.OMNIP_KV.get(KV_KEY); if (raw) { const s = JSON.parse(raw); loc = (s.locations || []).find(l => l && String(l.id).toLowerCase() === id.toLowerCase()) || null; } } catch {} }
  const context = buildStoreContext(loc, lang);
  const system = buildAvatarSystem(body && body.persona, lang, context);

  // Historial de conversación (turnos previos) para preguntas de seguimiento.
  const history = (Array.isArray(body && body.history) ? body.history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-8)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 800) }));

  const key = String(env.XAI_API_KEY || env.GROK_API_KEY || '').trim();
  if (!key) return json(request, env, 503, { ok: false, error: 'xai_key_not_set' });
  const model = String(env.XAI_MODEL || 'grok-4.20-beta-latest-non-reasoning');

  // cola say de la sala (cargada una vez; se reescribe por cada frase, secuencial)
  let q = []; try { q = JSON.parse(await env.OMNIP_KV.get(sayKey(room))) || []; } catch {}
  const base = Date.now(); let n = 0;   // ms: ids estrictamente crecientes, sin colisión entre turnos
  const enqueue = async (sentence) => {
    const clean = cleanForSpeech(sentence).trim();
    if (clean.length < 2) return;
    q.push({ text: clean.slice(0, 800), id: base + (++n), turn: base });
    if (q.length > 40) q = q.slice(-40);
    await env.OMNIP_KV.put(sayKey(room), JSON.stringify(q), { expirationTtl: 300 });
  };

  let res;
  try {
    res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, stream: true, temperature: 0.6, max_tokens: 220,
        messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: question }] }),
    });
  } catch (e) { return json(request, env, 502, { ok: false, error: 'xai_fetch_failed', detail: String(e && e.message || e) }); }
  if (!res.ok || !res.body) { const t = await res.text().catch(() => ''); return json(request, env, 502, { ok: false, error: `xai_http_${res.status}`, detail: String(t).slice(0, 300) }); }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let sse = '', buf = '', full = '';
  const flushSentences = async (force) => {
    // extrae frases completas de buf (corta en . ! ? ; \n, mín 18 chars)
    let m;
    const re = /[^.!?;\n]*[.!?;\n]/g;
    let consumed = 0;
    while ((m = re.exec(buf)) !== null) {
      const piece = m[0];
      if (piece.trim().length >= 18) { await enqueue(piece); consumed = re.lastIndex; }
    }
    if (consumed > 0) buf = buf.slice(consumed);
    if (force && buf.trim().length > 0) { await enqueue(buf); buf = ''; }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += dec.decode(value, { stream: true });
      let idx;
      while ((idx = sse.indexOf('\n')) >= 0) {
        const line = sse.slice(0, idx).trim(); sse = sse.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try { const j = JSON.parse(data); const tok = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (tok) { buf += tok; full += tok; } } catch {}
      }
      await flushSentences(false);
    }
  } catch (e) { /* corte del stream: seguimos con lo acumulado */ }
  await flushSentences(true);
  return json(request, env, 200, { ok: true, answer: cleanForSpeech(full).trim(), room, sentences: n });
}

// TTS de texto EXACTO (no pasa por Grok) → audio de la voz configurada.
// Para guiones de vídeo (hero de digitalavatar.ai vía Kling) y locuciones fijas.
async function handleTts(request, env) {
  let body; try { body = await request.json(); } catch { return json(request, env, 400, { error: 'invalid_json' }); }
  const text = String(body && body.text || '').trim();
  if (!text) return json(request, env, 400, { error: 'missing_text' });
  const voiceId = body && typeof body.voiceId === 'string' ? body.voiceId.trim() : '';
  const outputFormat = body && typeof body.output_format === 'string' ? body.output_format : '';
  const wantTs = !!(body && body.timestamps);
  const tts = wantTs ? await ttsWithTimestamps(env, text, voiceId, outputFormat)
                     : await ttsBase64(env, text, voiceId, outputFormat);
  if (tts && tts.b64) {
    const r = { ok: true, audioBase64: tts.b64, mime: tts.mime || 'audio/mpeg' };
    if (tts.alignment) r.alignment = tts.alignment;
    return json(request, env, 200, r);
  }
  return json(request, env, 502, { ok: false, error: (tts && tts.err) || 'tts_unavailable' });
}

// ── Canal "say": el panel del gemelo publica una frase y el MetaHuman (UE) la sondea y la habla ──
function sayKey(room) { return 'mh:sayq:' + (room || 'xtanco'); }
// POST /metahuman/say { room?, text } → ENCOLA la frase (FIFO) con id; el avatar
// las dice en orden (pipeline por frases para baja latencia).
async function handleMetahumanSay(request, env) {
  let body; try { body = await request.json(); } catch { return json(request, env, 400, { error: 'invalid_json' }); }
  const text = String(body && body.text || '').trim();
  if (!text) return json(request, env, 400, { error: 'missing_text' });
  const room = String(body && body.room || 'xtanco').trim() || 'xtanco';
  const id = Date.now();   // ms (mismo esquema que ask-stream; ids crecientes sin colisión)
  let q = [];
  try { q = JSON.parse(await env.OMNIP_KV.get(sayKey(room))) || []; } catch {}
  q.push({ text: text.slice(0, 800), id, turn: id });   // cada say manual = su propio turno (barge-in)
  if (q.length > 40) q = q.slice(-40);
  await env.OMNIP_KV.put(sayKey(room), JSON.stringify(q), { expirationTtl: 300 });
  return json(request, env, 200, { ok: true, id, room });
}
// GET /metahuman/next?room=&after=<id> → TODAS las frases nuevas (id>after), en orden.
// Devuelve items[] (bridge nuevo) + text/id de la última (compat con bridge viejo).
async function handleMetahumanNext(request, env) {
  const url = new URL(request.url);
  const room = String(url.searchParams.get('room') || 'xtanco');
  const after = Number(url.searchParams.get('after') || 0);
  let q = [];
  try { q = JSON.parse(await env.OMNIP_KV.get(sayKey(room))) || []; } catch {}
  const items = q.filter(x => Number(x.id) > after);
  if (items.length) {
    const last = items[items.length - 1];
    return json(request, env, 200, { ok: true, items, text: last.text, id: last.id });
  }
  return json(request, env, 200, { ok: true, empty: true, items: [], id: after });
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
      if (request.method === 'POST' && path === '/metahuman/ask-stream') return await handleMetahumanAskStream(request, env);
      if (request.method === 'POST' && path === '/tts') return await handleTts(request, env);
      if (request.method === 'POST' && path === '/metahuman/say') return await handleMetahumanSay(request, env);
      if (request.method === 'GET' && path === '/metahuman/next') return await handleMetahumanNext(request, env);
      return json(request, env, 404, { error: 'not_found', path });
    } catch (err) {
      return json(request, env, 500, { error: 'server_error', message: String(err && err.message || err) });
    }
  },
};
