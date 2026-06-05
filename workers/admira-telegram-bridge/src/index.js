const DEFAULT_ALLOWED_ORIGINS = [
  'https://csilvasantin.github.io',
  'https://www.carlossilva.info',
  'https://carlossilva.info',
  'https://www.xpaceos.com',
  'https://xpaceos.com',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:8084',
  'http://localhost:9124',
  'http://127.0.0.1:9124',
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
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

function configured(env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

function defaultChatId(env) {
  return String(env.TELEGRAM_CHAT_ID || '').trim();
}

function allowedChatIds(env) {
  return String(env.TELEGRAM_ALLOWED_CHAT_IDS || defaultChatId(env) || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function isAllowedChat(env, chatId) {
  const normalized = String(chatId || '').trim();
  if (!normalized) return false;
  const allowed = allowedChatIds(env);
  if (!allowed.length) return true;
  return allowed.includes(normalized);
}

async function telegramApi(env, method, payload = {}) {
  if (!configured(env)) throw new Error('Telegram no configurado');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(data.description || `Telegram HTTP ${response.status}`);
  }
  return data.result;
}

function commandStore(env) {
  const id = env.COMMAND_STORE.idFromName('admira-telegram-commands');
  return env.COMMAND_STORE.get(id);
}

async function sendMessage(request, env, replyMode) {
  if (!configured(env)) {
    return jsonResponse(request, env, 503, {
      ok: false,
      error: 'telegram_not_configured',
      message: 'TELEGRAM_BOT_TOKEN no está configurado en Cloudflare Worker.',
    });
  }

  const body = await readJson(request);
  const chatId = String(body.chatId || defaultChatId(env) || '').trim();
  const text = String(body.text || '').trim();
  if (!chatId || !text) {
    return jsonResponse(request, env, 400, {
      ok: false,
      error: 'missing_chat_or_text',
      message: 'Falta chatId o text.',
    });
  }
  if (!isAllowedChat(env, chatId)) {
    return jsonResponse(request, env, 403, {
      ok: false,
      error: 'chat_not_allowed',
      message: 'Chat no permitido.',
    });
  }

  try {
    const result = await telegramApi(env, 'sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 3900),
      reply_to_message_id: replyMode ? body.replyToMessageId || undefined : undefined,
      parse_mode: body.parseMode || undefined,
      disable_web_page_preview: true,
    });
    return jsonResponse(request, env, 200, {
      ok: true,
      messageId: result.message_id,
      chatId: String(result.chat.id),
    });
  } catch (error) {
    return jsonResponse(request, env, 502, {
      ok: false,
      error: replyMode ? 'telegram_reply_failed' : 'telegram_send_failed',
      message: error.message,
    });
  }
}

async function sendDocument(request, env) {
  if (!configured(env)) {
    return jsonResponse(request, env, 503, {
      ok: false,
      error: 'telegram_not_configured',
      message: 'TELEGRAM_BOT_TOKEN no está configurado en Cloudflare Worker.',
    });
  }
  const body = await readJson(request);
  const chatId   = String(body.chatId || defaultChatId(env) || '').trim();
  const document = String(body.document || '').trim();
  const caption  = String(body.caption || '').slice(0, 1024);
  if (!chatId)   return jsonResponse(request, env, 400, { ok: false, error: 'missing_chat_id' });
  if (!document) return jsonResponse(request, env, 400, { ok: false, error: 'missing_document', message: 'Falta document (URL pública del archivo).' });
  if (!/^https?:\/\//i.test(document)) {
    return jsonResponse(request, env, 400, { ok: false, error: 'invalid_document', message: 'document debe ser una URL https pública.' });
  }
  if (!isAllowedChat(env, chatId)) {
    return jsonResponse(request, env, 403, { ok: false, error: 'chat_not_allowed' });
  }
  try {
    const result = await telegramApi(env, 'sendDocument', {
      chat_id: chatId,
      document,
      caption: caption || undefined,
      parse_mode: body.parseMode || undefined,
      disable_content_type_detection: body.detectType === false ? true : undefined,
    });
    return jsonResponse(request, env, 200, {
      ok: true,
      messageId: result.message_id,
      chatId: String(result.chat.id),
    });
  } catch (error) {
    return jsonResponse(request, env, 502, { ok: false, error: 'telegram_document_failed', message: error.message });
  }
}

function cleanLine(value, fallback = '') {
  return String(value || fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || '';
}

async function notifyXpaceVisit(request, env) {
  if (!configured(env)) {
    return jsonResponse(request, env, 503, { ok: false, error: 'telegram_not_configured' });
  }

  const body = await readJson(request);
  const chatId = defaultChatId(env);
  if (!chatId) {
    return jsonResponse(request, env, 400, { ok: false, error: 'missing_default_chat' });
  }
  if (!isAllowedChat(env, chatId)) {
    return jsonResponse(request, env, 403, { ok: false, error: 'chat_not_allowed' });
  }

  const origin = request.headers.get('Origin') || '';
  const country = request.cf && request.cf.country ? request.cf.country : 'n/a';
  const city = request.cf && request.cf.city ? request.cf.city : '';
  const colo = request.cf && request.cf.colo ? request.cf.colo : '';
  const page = cleanLine(body.page || 'https://www.xpaceos.com/');
  const title = cleanLine(body.title || 'XpaceOS');
  const referrer = cleanLine(body.referrer || 'direct');
  const lang = cleanLine(body.lang || 'n/a');
  const tz = cleanLine(body.tz || 'n/a');
  const ua = cleanLine(request.headers.get('User-Agent') || body.ua || 'n/a');
  const ip = cleanLine(clientIp(request) || 'n/a');
  const now = new Date().toISOString();

  const locationBits = [country, city, colo].filter(Boolean).join(' · ');
  const text = [
    '🚀 Nueva visita en XpaceOS',
    `• Página: ${page}`,
    `• Título: ${title}`,
    `• Referrer: ${referrer}`,
    `• Idioma: ${lang}`,
    `• Zona horaria: ${tz}`,
    `• Origen: ${origin || 'n/a'}`,
    `• Ubicación CF: ${locationBits || 'n/a'}`,
    `• IP: ${ip}`,
    `• User-Agent: ${ua}`,
    `• Hora: ${now}`,
  ].join('\n');

  try {
    const result = await telegramApi(env, 'sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
    return jsonResponse(request, env, 200, {
      ok: true,
      messageId: result.message_id,
      chatId: String(result.chat.id),
    });
  } catch (error) {
    return jsonResponse(request, env, 502, {
      ok: false,
      error: 'xpace_visit_notify_failed',
      message: error.message,
    });
  }
}

async function handleWebhook(request, env, secret) {
  if (!configured(env)) {
    return jsonResponse(request, env, 503, { ok: false, error: 'telegram_not_configured' });
  }
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return jsonResponse(request, env, 403, { ok: false, error: 'invalid_webhook_secret' });
  }

  const update = await readJson(request);
  const store = commandStore(env);
  const storeResponse = await store.fetch('https://command-store/queue', {
    method: 'POST',
    body: JSON.stringify(update),
  });
  const payload = await storeResponse.json();
  return jsonResponse(request, env, 200, payload);
}

export class TelegramCommandStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/queue' && request.method === 'POST') {
      return this.queue(request);
    }
    if (url.pathname === '/commands' && request.method === 'GET') {
      return this.commands(url);
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      return this.status();
    }
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  async queue(request) {
    const update = await request.json().catch(() => ({}));
    const message = update.message || update.edited_message || null;
    const text = message && typeof message.text === 'string' ? message.text.trim() : '';
    const chatId = message && message.chat ? String(message.chat.id) : '';
    if (!text || !isAllowedChat(this.env, chatId)) {
      return Response.json({ ok: true, queued: false });
    }

    const from = message.from || {};
    const command = {
      id: Number(update.update_id || Date.now()),
      telegramMessageId: message.message_id,
      chatId,
      from: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Telegram',
      username: from.username || '',
      text,
      receivedAt: new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    };

    const commands = await this.state.storage.get('commands') || [];
    const filtered = commands.filter(item => item.id !== command.id);
    filtered.push(command);
    filtered.sort((a, b) => a.id - b.id);
    await this.state.storage.put('commands', filtered.slice(-100));
    await this.state.storage.put('lastCommandId', command.id);
    return Response.json({ ok: true, queued: true, commandId: command.id });
  }

  async commands(url) {
    const since = Number(url.searchParams.get('since') || 0);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 10)));
    const commands = await this.state.storage.get('commands') || [];
    const latest = commands.length ? commands[commands.length - 1].id : Number(await this.state.storage.get('lastCommandId') || 0);
    return Response.json({
      ok: true,
      commands: commands.filter(command => command.id > since).slice(0, limit),
      lastCommandId: latest,
    });
  }

  async status() {
    const commands = await this.state.storage.get('commands') || [];
    const latest = commands.length ? commands[commands.length - 1].id : Number(await this.state.storage.get('lastCommandId') || 0);
    return Response.json({
      ok: true,
      queued: commands.length,
      lastCommandId: latest,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse(request, env, 200, {
        ok: true,
        service: 'admira-telegram-bridge',
        configured: configured(env),
        defaultChatConfigured: !!defaultChatId(env),
        allowedChatsConfigured: allowedChatIds(env).length,
      });
    }

    if (url.pathname === '/telegram/status' && request.method === 'GET') {
      let bot = null;
      try {
        bot = configured(env) ? await telegramApi(env, 'getMe') : null;
      } catch (error) {
        return jsonResponse(request, env, 502, {
          ok: false,
          configured: configured(env),
          error: 'telegram_get_me_failed',
          message: error.message,
        });
      }
      const storeStatus = await (await commandStore(env).fetch('https://command-store/status')).json();
      return jsonResponse(request, env, 200, {
        ok: true,
        configured: configured(env),
        polling: true,
        bot: bot ? { id: bot.id, username: bot.username, firstName: bot.first_name } : null,
        defaultChatId: defaultChatId(env) ? 'configured' : '',
        allowedChatIds: allowedChatIds(env).map(() => 'configured'),
        queued: storeStatus.queued || 0,
        lastCommandId: storeStatus.lastCommandId || 0,
      });
    }

    if (url.pathname === '/telegram/send' && request.method === 'POST') {
      return sendMessage(request, env, false);
    }

    if (url.pathname === '/visits/xpaceos' && request.method === 'POST') {
      return notifyXpaceVisit(request, env);
    }

    if (url.pathname === '/telegram/reply' && request.method === 'POST') {
      return sendMessage(request, env, true);
    }

    if (url.pathname === '/telegram/send-document' && request.method === 'POST') {
      return sendDocument(request, env);
    }

    if (url.pathname === '/telegram/commands' && request.method === 'GET') {
      const storeResponse = await commandStore(env).fetch(`https://command-store/commands${url.search}`);
      const payload = await storeResponse.json();
      return jsonResponse(request, env, storeResponse.status, payload);
    }

    // Mando móvil propio (remote.html): encola un comando CLI autenticado por
    // REMOTE_KEY. Reutiliza el mismo /queue del Durable Object que usa Telegram,
    // con el chat por defecto (autorizado) como remitente sintético. El gemelo
    // lo pollea por /telegram/commands y lo ejecuta vía executeTelegramText.
    if (url.pathname === '/remote/cmd' && request.method === 'POST') {
      if (!env.REMOTE_KEY) {
        return jsonResponse(request, env, 503, { ok: false, error: 'remote_key_not_set' });
      }
      const body = await readJson(request);
      const key = String(body.key || request.headers.get('X-Remote-Key') || '');
      if (key !== String(env.REMOTE_KEY)) {
        return jsonResponse(request, env, 401, { ok: false, error: 'unauthorized' });
      }
      const text = String(body.text || '').trim().slice(0, 200);
      if (!text) return jsonResponse(request, env, 400, { ok: false, error: 'missing_text' });
      const chatId = defaultChatId(env) || 'remote';
      const now = Date.now();
      const update = {
        update_id: now,
        message: {
          message_id: now,
          chat: { id: chatId },
          from: { first_name: 'Remote', username: 'remote' },
          text,
          date: Math.floor(now / 1000),
        },
      };
      const storeResponse = await commandStore(env).fetch('https://command-store/queue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      });
      const data = await storeResponse.json().catch(() => ({}));
      return jsonResponse(request, env, 200, { ok: true, queued: data.queued === true, commandId: data.commandId || null, text });
    }

    const webhookMatch = url.pathname.match(/^\/telegram\/webhook\/([^/]+)$/);
    if (webhookMatch && request.method === 'POST') {
      return handleWebhook(request, env, webhookMatch[1]);
    }

    return jsonResponse(request, env, 404, {
      ok: false,
      error: 'not_found',
      message: 'Endpoint no encontrado.',
    });
  },
};
