// ===================================================================
// КЕРБЕН B2B Market — Cloud Functions
// ===================================================================
//   • processNotificationQueue — push-уведомления через FCM.
//   • telegramProxy             — прокси к Telegram API. Токен бота
//                                 хранится в Firebase Secret Manager,
//                                 в коде клиента/репозитории его нет.
// ===================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

// ===================================================================
// Telegram-токен. Хранится в Secret Manager, а не в коде.
// Чтобы задать значение:
//   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
// (вставить новый токен от @BotFather после /revoke).
// ===================================================================
const TELEGRAM_BOT_TOKEN_SECRET = 'TELEGRAM_BOT_TOKEN';

// Разрешённые домены, с которых можно вызывать telegramProxy.
// Защищает от того, чтобы любой сайт мог использовать ваш бот.
const ALLOWED_ORIGINS = [
  'https://svoysayet.firebaseapp.com',
  'https://svoysayet.web.app',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

function pickCorsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Любой локальный дев-сервер (Live Server 5500, Firebase emulator и т.п.).
  // localhost и 127.0.0.1 — разные Origin для браузера; оба нужны.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  // Запрос без Origin (curl, Postman) — разрешаем первый прод-домен как дефолт.
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS[0];
}

function setCorsHeaders(req, res) {
  res.set('Access-Control-Allow-Origin', pickCorsOrigin(req));
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-AppCheck');
  res.set('Access-Control-Max-Age', '3600');
}

// ==================== ОБРАБОТКА ОЧЕРЕДИ УВЕДОМЛЕНИЙ ====================
exports.processNotificationQueue = functions.firestore
  .document('notificationQueue/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.data();

    if (notif.status !== 'pending') return null;

    try {
      console.log('📨 Новое уведомление:', notif.type);

      if (notif.type === 'chat') {
        await sendChatNotification(notif);
      } else if (notif.type === 'admin_chat') {
        await sendAdminNotification(notif);
      } else if (notif.type === 'broadcast') {
        await sendBroadcastNotification(notif);
      }

      await snap.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('❌ Ошибка отправки:', error.message);
      await snap.ref.update({
        status: 'error',
        error: error.message
      });
    }

    return null;
  });

// Создаём web-push сообщение
// webpush.notification — браузер ГАРАНТИРОВАННО покажет уведомление
// data — для обработки в foreground (onMessage) и клика
function buildWebPushMessage(token, title, body, extraData) {
  return {
    token: token,
    data: {
      title: title,
      body: body,
      ...extraData,
      timestamp: Date.now().toString()
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      notification: {
        title: title,
        body: body,
        icon: '/icon-kerben.jpg',
        badge: '/icon-kerben.jpg',
        vibrate: [300, 150, 300, 150, 300],
        tag: extraData.tag || 'kerben',
        renotify: true,
        requireInteraction: true,
        data: extraData
      }
    }
  };
}

// ==================== ЧАТ-УВЕДОМЛЕНИЕ КЛИЕНТУ ====================
async function sendChatNotification(notif) {
  let token = null;

  const clientDoc = await db.collection('chatClients')
    .doc(notif.targetClientId).get();

  if (clientDoc.exists && clientDoc.data().pushToken) {
    token = clientDoc.data().pushToken;
  }

  if (!token) {
    const tokensQuery = await db.collection('pushTokens')
      .where('clientId', '==', notif.targetClientId)
      .limit(1).get();

    if (!tokensQuery.empty) {
      token = tokensQuery.docs[0].data().token;
      await db.collection('chatClients').doc(notif.targetClientId).set({
        pushToken: token, pushEnabled: true
      }, { merge: true });
    }
  }

  if (!token) {
    console.log('⚠️ Клиент не подписан:', notif.targetClientId);
    return;
  }

  const title = notif.title || 'Кербен';
  const body = notif.body || 'Новое сообщение';

  console.log('📤 Push клиенту:', notif.targetClientId, 'token:', token.substring(0, 20) + '...');

  const message = buildWebPushMessage(token, title, body, {
    type: 'chat',
    clientId: notif.targetClientId || '',
    url: '/index.html',
    tag: 'chat-' + (notif.targetClientId || 'default')
  });

  try {
    const msgId = await admin.messaging().send(message);
    console.log('✅ Push клиенту отправлен, ID:', msgId);
  } catch (error) {
    console.error('❌ Ошибка push клиенту:', error.code, error.message);
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log('🗑️ Удаляем невалидный токен');
      await db.collection('chatClients').doc(notif.targetClientId).update({
        pushToken: admin.firestore.FieldValue.delete(),
        pushEnabled: false
      }).catch(() => {});
      await db.collection('pushTokens').doc(token).delete().catch(() => {});
    }
    throw error;
  }
}

// ==================== УВЕДОМЛЕНИЕ АДМИНУ ====================
async function sendAdminNotification(notif) {
  const adminTokens = await db.collection('pushTokens')
    .where('role', '==', 'admin').get();
  const adminTokens2 = await db.collection('adminPushTokens').get();

  const tokens = new Set();
  adminTokens.forEach(doc => {
    if (doc.data().token) tokens.add(doc.data().token);
  });
  adminTokens2.forEach(doc => {
    if (doc.data().token) tokens.add(doc.data().token);
  });

  const tokenArray = [...tokens];
  if (tokenArray.length === 0) {
    console.log('⚠️ Нет админ-токенов');
    return;
  }

  console.log('📤 Отправка', tokenArray.length, 'админам');

  const clientName = notif.clientName || 'Клиент';
  const title = '💬 ' + clientName;
  const body = notif.body || 'Новое сообщение';

  const invalidTokens = [];
  for (const token of tokenArray) {
    const message = buildWebPushMessage(token, title, body, {
      type: 'admin_chat',
      clientId: notif.clientId || '',
      url: '/admin-chat.html',
      tag: 'admin-chat-' + (notif.clientId || 'default')
    });

    try {
      const msgId = await admin.messaging().send(message);
      console.log('✅ Push админу:', token.substring(0, 20) + '... ID:', msgId);
    } catch (error) {
      console.error('❌ Push админу ошибка:', token.substring(0, 20) + '...', error.code);
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        invalidTokens.push(token);
      }
    }
  }

  for (const t of invalidTokens) {
    await db.collection('adminPushTokens').doc(t).delete().catch(() => {});
    await db.collection('pushTokens').doc(t).delete().catch(() => {});
  }

  console.log(`Admin push: ${tokenArray.length - invalidTokens.length}/${tokenArray.length} OK`);
}

// ==================== РАССЫЛКА ВСЕМ ====================
async function sendBroadcastNotification(notif) {
  const tokensSnapshot = await db.collection('pushTokens').get();

  if (tokensSnapshot.empty) {
    console.log('⚠️ Нет подписчиков');
    return;
  }

  const tokens = [];
  tokensSnapshot.forEach(doc => {
    if (doc.data().token) tokens.push(doc.data().token);
  });

  if (tokens.length === 0) return;

  const title = notif.title || 'Кербен';
  const body = notif.body || 'Новое уведомление';

  const batches = [];
  for (let i = 0; i < tokens.length; i += 500) {
    batches.push(tokens.slice(i, i + 500));
  }

  let successCount = 0;
  let failCount = 0;
  const invalidTokens = [];

  for (const batch of batches) {
    const message = {
      data: {
        title: title,
        body: body,
        type: 'broadcast',
        url: '/index.html',
        tag: 'broadcast',
        timestamp: Date.now().toString()
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' }
      },
      tokens: batch
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    successCount += response.successCount;
    failCount += response.failureCount;

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(batch[idx]);
        }
      }
    });
  }

  if (invalidTokens.length > 0) {
    await Promise.all(invalidTokens.map(t =>
      db.collection('pushTokens').doc(t).delete().catch(() => {})
    ));
    console.log('🗑️ Удалено невалидных:', invalidTokens.length);
  }

  console.log(`Broadcast: ${successCount} OK, ${failCount} ошибок`);
}

// ===================================================================
//                    TELEGRAM PROXY
// -------------------------------------------------------------------
// Принимает от клиента запрос и пересылает в Telegram Bot API.
// Токен бота лежит в Secret Manager (process.env.TELEGRAM_BOT_TOKEN),
// в коде сайта/GitHub его нет.
//
// Поддерживаемые методы:
//   • sendMessage  { chat_id, text, parse_mode? }
//   • sendDocument { chat_id, caption?, file_base64, file_name, file_mime }
//   • sendPhoto    { chat_id, caption?, file_base64, file_name, file_mime }
//
// Защиты:
//   • Firebase App Check (заголовок X-Firebase-AppCheck) — скрипты и боты без вашего сайта.
//   • Только разрешённые методы (whitelist).
//   • Лимит размера файла 10 МБ.
//   • Лимит длины текста/подписи.
//   • CORS только с доменов вашего сайта.
//   • Простая защита от спама: 30 запросов/мин с одного IP (in-memory).
// ===================================================================

const _rateLimit = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = _rateLimit.get(ip);
  if (!entry || entry.resetAt < now) {
    _rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

exports.telegramProxy = functions
  .runWith({
    secrets: [TELEGRAM_BOT_TOKEN_SECRET],
    memory: '512MB',
    timeoutSeconds: 60
  })
  .https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    if (!checkRateLimit(String(ip).split(',')[0].trim())) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    const appCheckHeader = req.get('X-Firebase-AppCheck');
    if (!appCheckHeader || typeof appCheckHeader !== 'string') {
      res.status(401).json({ ok: false, error: 'missing_app_check' });
      return;
    }
    try {
      await admin.appCheck().verifyToken(appCheckHeader);
    } catch (err) {
      console.warn('App Check verify failed:', err.code || err.message);
      res.status(401).json({ ok: false, error: 'invalid_app_check' });
      return;
    }

    const token = process.env[TELEGRAM_BOT_TOKEN_SECRET];
    if (!token) {
      console.error('TELEGRAM_BOT_TOKEN не задан. Выполните firebase functions:secrets:set TELEGRAM_BOT_TOKEN');
      res.status(500).json({ ok: false, error: 'server_misconfigured' });
      return;
    }

    const body = req.body || {};
    const method = body.method;

    if (!['sendMessage', 'sendDocument', 'sendPhoto'].includes(method)) {
      res.status(400).json({ ok: false, error: 'invalid_method' });
      return;
    }

    const chatId = body.chat_id;
    if (chatId === undefined || chatId === null || chatId === '') {
      res.status(400).json({ ok: false, error: 'chat_id_required' });
      return;
    }

    const url = `https://api.telegram.org/bot${token}/${method}`;

    try {
      let tgRes;

      if (method === 'sendMessage') {
        const text = body.text;
        if (typeof text !== 'string' || text.length === 0 || text.length > 4096) {
          res.status(400).json({ ok: false, error: 'invalid_text' });
          return;
        }
        const payload = {
          chat_id: chatId,
          text: text,
          parse_mode: typeof body.parse_mode === 'string' ? body.parse_mode : 'Markdown'
        };
        tgRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // sendDocument | sendPhoto
        const fileBase64 = body.file_base64;
        if (typeof fileBase64 !== 'string' || fileBase64.length === 0) {
          res.status(400).json({ ok: false, error: 'file_base64_required' });
          return;
        }
        const fileBuffer = Buffer.from(fileBase64, 'base64');
        if (fileBuffer.length === 0 || fileBuffer.length > 10 * 1024 * 1024) {
          res.status(400).json({ ok: false, error: 'file_too_large_or_empty' });
          return;
        }

        const caption = typeof body.caption === 'string' ? body.caption.slice(0, 1024) : undefined;
        const fileName = typeof body.file_name === 'string'
          ? body.file_name.slice(0, 200).replace(/[\r\n]/g, '_')
          : 'file.bin';
        const fileMime = typeof body.file_mime === 'string'
          ? body.file_mime.slice(0, 100)
          : 'application/octet-stream';

        // ВАЖНО: Node 20 имеет встроенный fetch (undici), который понимает
        // ТОЛЬКО нативные FormData/Blob, а не npm-пакет form-data.
        // Иначе тело запроса уходит пустым → Telegram возвращает HTML/пусто.
        const fd = new FormData();
        fd.append('chat_id', String(chatId));
        if (caption) fd.append('caption', caption);

        const fieldName = method === 'sendDocument' ? 'document' : 'photo';
        fd.append(fieldName, new Blob([fileBuffer], { type: fileMime }), fileName);

        tgRes = await fetch(url, {
          method: 'POST',
          body: fd
        });
      }

      // Читаем тело как текст и пробуем распарсить как JSON.
      // Telegram при ошибках иногда отвечает пустым телом или HTML.
      const rawText = await tgRes.text();
      let data;
      try {
        data = rawText ? JSON.parse(rawText) : { ok: false, description: 'empty response from Telegram' };
      } catch (parseErr) {
        console.error('telegramProxy: non-JSON response from Telegram', tgRes.status, rawText.slice(0, 500));
        data = { ok: false, description: 'non-JSON from Telegram', status: tgRes.status };
      }
      res.status(tgRes.status).json(data);
    } catch (err) {
      console.error('telegramProxy error:', err);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
