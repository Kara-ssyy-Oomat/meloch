// ===================================================================
// КЕРБЕН B2B Market — Cloud Functions
// ===================================================================
//   • processNotificationQueue   — push-уведомления через FCM.
//   • notifyOnStockChange        — алёрты low/out по остаткам.
//   • deductStockOnOrderCreate — в codebase functions-stock
//   • telegramProxy              — прокси к Telegram API (Secret Manager).
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
  'https://kara-ssyy.github.io',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

// Регексп для GitHub Pages: позволяет любые поддомены *.github.io.
// Если такой широкий список нежелателен — оставьте только конкретный домен в ALLOWED_ORIGINS.
const ALLOWED_ORIGIN_REGEXES = [
  /^https:\/\/[a-z0-9-]+\.github\.io$/i
];

function pickCorsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGIN_REGEXES.some(rx => rx.test(origin))) return origin;
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
      } else if (notif.type === 'admin_stock_out') {
        await sendStockAdminNotification(notif, 'out');
      } else if (notif.type === 'admin_low_stock') {
        await sendStockAdminNotification(notif, 'low');
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
  // Админов обычно <20. Лимит 100 — защита от случайного раздувания
  // коллекции pushTokens (если кто-то по ошибке проставил role:admin).
  // На каждое сообщение в чате эта функция вызывается => лимит критичен.
  const adminTokens = await db.collection('pushTokens')
    .where('role', '==', 'admin').limit(100).get();
  const adminTokens2 = await db.collection('adminPushTokens').limit(100).get();

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
  // Жёсткий лимит, чтобы случайная рассылка не сожгла тысячи Read Ops.
  // 2000 подписчиков — это уже промышленный масштаб; если будет больше,
  // переходим на topic-based messaging (admin.messaging().sendToTopic).
  const tokensSnapshot = await db.collection('pushTokens').limit(2000).get();

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

// ==================== УВЕДОМЛЕНИЕ АДМИНУ ОБ ОСТАТКАХ ====================
// kind = 'out' (товар закончился) | 'low' (низкий остаток)
async function sendStockAdminNotification(notif, kind) {
  // Собираем все админ-токены так же, как делает sendAdminNotification.
  const adminTokens = await db.collection('pushTokens')
    .where('role', '==', 'admin').limit(100).get();
  const adminTokens2 = await db.collection('adminPushTokens').limit(100).get();

  const tokens = new Set();
  adminTokens.forEach(doc => {
    if (doc.data().token) tokens.add(doc.data().token);
  });
  adminTokens2.forEach(doc => {
    if (doc.data().token) tokens.add(doc.data().token);
  });

  const tokenArray = [...tokens];
  if (tokenArray.length === 0) {
    console.log('⚠️ Нет админ-токенов для stock-уведомления');
    return;
  }

  const productTitle = (notif.productTitle || 'Товар').toString().slice(0, 150);
  const remaining = (typeof notif.remaining === 'number') ? notif.remaining : null;

  let title;
  let body;
  if (kind === 'out') {
    title = '❌ Закончился товар';
    body = `${productTitle} — остаток 0. Пополните склад.`;
  } else {
    title = '⚠️ Заканчивается товар';
    const left = remaining !== null ? ` (осталось ${remaining})` : '';
    body = `${productTitle}${left}. Скоро потребуется пополнение.`;
  }

  console.log('📤 Stock-уведомление (' + kind + ') →', tokenArray.length, 'админам:', productTitle);

  const invalidTokens = [];
  for (const token of tokenArray) {
    const message = buildWebPushMessage(token, title, body, {
      type: kind === 'out' ? 'admin_stock_out' : 'admin_low_stock',
      productId: notif.productId || '',
      url: '/admin-warehouse.html',
      tag: 'stock-' + (notif.productId || 'unknown') + '-' + kind
    });

    try {
      await admin.messaging().send(message);
    } catch (error) {
      console.error('❌ Stock-push ошибка:', token.substring(0, 20) + '...', error.code);
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

  console.log(`Stock push (${kind}): ${tokenArray.length - invalidTokens.length}/${tokenArray.length} OK`);
}

// ==================== ТРИГГЕР: ИЗМЕНЕНИЕ ОСТАТКА ТОВАРА ====================
// Срабатывает на любое обновление документа products/{id}.
// Логика:
//   • БЫЛО > 0, СТАЛО ≤ 0  → создаём stockAlerts (out) + push админам.
//   • БЫЛО > порога, СТАЛО ≤ порога, но > 0 → создаём stockAlerts (low) + push.
// Дубликаты подавляются через документ stockAlerts/{productId}_{kind}_active.
// Когда товар пополнили (стало > порога) — активный алёрт автоматически
// помечается resolved=true, чтобы при следующем падении снова сработало.
//
// Порог "мало" по умолчанию = 5, может быть переопределён в
// settings/warehouse.lowStockThreshold (число).
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

async function getLowStockThreshold() {
  try {
    const doc = await db.collection('settings').doc('warehouse').get();
    if (doc.exists) {
      const t = doc.data().lowStockThreshold;
      if (typeof t === 'number' && isFinite(t) && t >= 0 && t <= 10000) return Math.floor(t);
    }
  } catch (e) {
    // fallthrough — используем дефолт
  }
  return DEFAULT_LOW_STOCK_THRESHOLD;
}

function _toFiniteInt(v) {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return Math.floor(v);
}

exports.notifyOnStockChange = functions.firestore
  .document('products/{productId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const beforeStock = _toFiniteInt(before.stock);
    const afterStock = _toFiniteInt(after.stock);

    // Если у товара stock не задан как число — учёт не ведётся, выходим.
    if (afterStock === null) return null;

    // Не алёртим товары, у которых склад не настроен (нет warehouseStock).
    // Это совпадает с логикой order-submit.js: такие товары считаются
    // "безлимитными" и не требуют контроля остатка.
    const hasWarehouseSetup = after.warehouseStock
      && typeof after.warehouseStock === 'object'
      && Object.keys(after.warehouseStock).length > 0;
    if (!hasWarehouseSetup) return null;

    // Заблокированные вручную товары — не алёртим (админ и так знает).
    if (after.blocked === true) return null;

    const threshold = await getLowStockThreshold();
    const productId = context.params.productId;
    const productTitle = (after.title || after.name || 'Товар').toString();

    const wasOut = (beforeStock !== null && beforeStock <= 0);
    const isOut = afterStock <= 0;
    const wasLow = (beforeStock !== null && beforeStock <= threshold);
    const isLow = afterStock <= threshold && afterStock > 0;

    // 1) Переход в "закончился"
    if (!wasOut && isOut) {
      await createStockAlert({
        productId,
        productTitle,
        kind: 'out',
        remaining: afterStock,
        threshold
      });
    }
    // 2) Переход в "мало" (не было мало, стало мало, но не ноль).
    //    Не дублируем с "out": если уже ушли ниже нуля — там сразу 'out'.
    else if (!wasLow && isLow && !isOut) {
      await createStockAlert({
        productId,
        productTitle,
        kind: 'low',
        remaining: afterStock,
        threshold
      });
    }

    // 3) Если товар пополнили — закрываем активные алёрты.
    //    Это позволит при следующем падении снова отправить push
    //    (иначе deduplication заблокировал бы повторное уведомление).
    if (afterStock > threshold) {
      await resolveActiveAlerts(productId).catch(e =>
        console.error('resolveActiveAlerts error:', e.message));
    }

    return null;
  });

// Создание stockAlert с защитой от дублей: документ с фиксированным id
// {productId}_{kind}_active существует только пока алёрт активен.
// Если он уже есть — пропускаем (не шлём дубль push).
async function createStockAlert({ productId, productTitle, kind, remaining, threshold }) {
  const activeKey = `${productId}_${kind}_active`;
  const activeRef = db.collection('stockAlerts').doc(activeKey);

  try {
    // Транзакция, чтобы исключить гонку при двух одновременных заказах.
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(activeRef);
      if (snap.exists) return false;
      tx.set(activeRef, {
        productId,
        productTitle,
        kind,
        remaining: remaining,
        threshold: threshold,
        active: true,
        resolved: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        timestamp: Date.now()
      });
      return true;
    });

    if (!created) {
      console.log(`stockAlert ${activeKey} уже активен — push не дублируем`);
      return;
    }

    // Кладём задачу в очередь уведомлений — её подхватит processNotificationQueue.
    await db.collection('notificationQueue').add({
      type: kind === 'out' ? 'admin_stock_out' : 'admin_low_stock',
      productId,
      productTitle,
      remaining,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: Date.now()
    });

    console.log(`📣 stockAlert создан: ${kind} ${productTitle} (${remaining})`);
  } catch (e) {
    console.error('createStockAlert error:', e.message);
  }
}

// Закрываем все активные алёрты товара при пополнении остатка.
async function resolveActiveAlerts(productId) {
  const keys = [`${productId}_out_active`, `${productId}_low_active`];
  const batch = db.batch();
  let touched = 0;
  for (const k of keys) {
    const ref = db.collection('stockAlerts').doc(k);
    const snap = await ref.get();
    if (!snap.exists) continue;
    // Сохраняем историю в отдельный документ stockAlerts/{productId}_{kind}_{ts}
    const data = snap.data();
    const historyId = `${productId}_${data.kind}_${data.timestamp || Date.now()}`;
    batch.set(db.collection('stockAlerts').doc(historyId), {
      ...data,
      active: false,
      resolved: true,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedAtMs: Date.now()
    });
    batch.delete(ref);
    touched++;
  }
  if (touched > 0) {
    await batch.commit();
    console.log(`✅ resolved ${touched} stockAlerts для ${productId}`);
  }
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

    // App Check можно временно отключить через переменную APPCHECK_ENFORCE=false
    // в файле functions/.env (новый рекомендованный способ Firebase Functions).
    // По умолчанию — включено.
    const appCheckEnforce =
      String(process.env.APPCHECK_ENFORCE ?? 'true').toLowerCase() !== 'false';

    if (appCheckEnforce) {
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

// ===================================================================
//                         ORDER NOTIFY (HTTP)
// -------------------------------------------------------------------
// НАДЁЖНАЯ ДОСТАВКА ЗАКАЗА — работает ДАЖЕ БЕЗ Firebase Auth / App Check.
//
// Проблема которую решает:
//   • У клиента Firebase Auth может возвращать 403 (кэш GCP, ограничения API).
//   • Firestore .set() не проходит → заказ в offline queue → админ не видит.
//   • telegramProxy требует App Check, который у некоторых браузеров
//     заблокирован (Safari ITP, throttled reCAPTCHA, WebView и т.п.).
//   • Клиент видел «Заказ сохранён и уходит к нам» → но фактически заказ
//     висел на устройстве до следующего визита.
//
// Как работает:
//   1. Клиент шлёт POST на этот endpoint параллельно с orderRef.set().
//   2. Мы валидируем данные (rate limit, санити-чек).
//   3. Пишем заказ в Firestore через admin SDK (обходит клиентский auth).
//   4. Шлём короткий текст в Telegram админа (2 чата).
//   5. Возвращаем клиенту {ok:true, orderId, firestore, telegram}.
//
// Без App Check — потому что для критичной доставки надёжность важнее,
// чем защита от спама. Rate limit по IP (30 req/min) уже блокирует ботов.
// Плюс жёсткая валидация payload (см. ниже).
// ===================================================================
exports.orderNotify = functions
  .runWith({
    secrets: [TELEGRAM_BOT_TOKEN_SECRET],
    memory: '256MB',
    timeoutSeconds: 30
  })
  .https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    if (!checkRateLimit(String(ip).split(',')[0].trim())) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    const body = req.body || {};
    const orderId = body.orderId;
    const payload = body.payload || {};

    // ─── ВАЛИДАЦИЯ ─────────────────────────────────────────
    // Санити-чек: без базовых полей заказ не имеет смысла.
    if (!orderId || typeof orderId !== 'string' || orderId.length < 5 || orderId.length > 100) {
      res.status(400).json({ ok: false, error: 'invalid_order_id' });
      return;
    }
    if (typeof payload.name !== 'string' || payload.name.length === 0 || payload.name.length > 200) {
      res.status(400).json({ ok: false, error: 'invalid_name' });
      return;
    }
    if (typeof payload.phone !== 'string' || payload.phone.length === 0 || payload.phone.length > 30) {
      res.status(400).json({ ok: false, error: 'invalid_phone' });
      return;
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 200) {
      res.status(400).json({ ok: false, error: 'invalid_items' });
      return;
    }
    if (typeof payload.total !== 'number' || !isFinite(payload.total) || payload.total < 0 || payload.total > 100000000) {
      res.status(400).json({ ok: false, error: 'invalid_total' });
      return;
    }
    if (payload.address !== undefined && payload.address !== null &&
        (typeof payload.address !== 'string' || payload.address.length > 1000)) {
      res.status(400).json({ ok: false, error: 'invalid_address' });
      return;
    }

    // ─── 1) ЗАПИСЬ В FIRESTORE через admin SDK ────────────
    // .create() вместо .set() — не перезаписывает если клиентский .set()
    // сработал первым. Игнорируем ошибку 'already-exists' — это ОК.
    // Форсируем безопасные поля (клиент не может подделать статус списания).
    let firestoreOk = false;
    let firestoreError = null;
    try {
      const safePayload = {
        ...payload,
        // Форсируем эти поля независимо от того что прислал клиент:
        stockDeducted: false,
        stockDeductionStatus: 'pending',
        warehouseDeductions: null,
        // Метка что заказ прошёл через orderNotify (для дебага)
        _viaOrderNotify: true,
        _orderNotifyAt: Date.now()
      };
      await db.collection('orders').doc(orderId).create(safePayload);
      firestoreOk = true;
      console.log(`[OrderNotify] заказ ${orderId} записан в БД`);
    } catch (e) {
      if (e && (e.code === 6 || /already[-_ ]?exists/i.test(String(e.message || e.code)))) {
        // Заказ уже создан клиентским .set() — это отлично, не паникуем.
        firestoreOk = true;
        firestoreError = 'already_exists';
        console.log(`[OrderNotify] заказ ${orderId} уже был в БД (клиент успел раньше)`);
      } else {
        firestoreError = e && e.message ? e.message : String(e);
        console.error(`[OrderNotify] ошибка записи в БД:`, firestoreError);
      }
    }

    // ─── 2) ОТПРАВКА В TELEGRAM ────────────────────────────
    const token = process.env[TELEGRAM_BOT_TOKEN_SECRET];
    let telegramResults = { primary: false, secondary: false };

    if (!token) {
      console.error('[OrderNotify] TELEGRAM_BOT_TOKEN не задан');
    } else {
      // Формируем короткий текстовый заказ (plain text, без Markdown)
      const items = payload.items;
      const MAX_ITEMS = 15;
      const shownItems = items.slice(0, MAX_ITEMS);
      const restCount = items.length - shownItems.length;
      const itemsText = shownItems.map(i => {
        const qty = i.qty || 0;
        const price = i.price || 0;
        const title = String(i.title || 'Товар').replace(/[*_`\[\]]/g, '');
        const variant = i.variant ? ` [${i.variant}]` : '';
        return `• ${title}${variant} — ${qty} × ${price} сом`;
      }).join('\n') + (restCount > 0 ? `\n… и ещё ${restCount} товар(ов)` : '');

      const extraLines = [];
      if (payload.placedByAgentName || (payload.placedByAgent && payload.placedByAgent.name)) {
        extraLines.push(`👥 Оформил агент: ${payload.placedByAgentName || payload.placedByAgent.name}`);
      }
      if (payload.partner) extraLines.push(`🤝 Партнёр: ${payload.partner}`);
      if (payload.driverName || payload.driverPhone) {
        extraLines.push(`🚗 Водитель: ${payload.driverName || '-'} / ${payload.driverPhone || '-'}`);
      }
      if (payload.unfulfilledOrder) {
        extraLines.push(`⚠️ ЗАЯВКА — товары были распроданы. Клиент ждёт связи!`);
      }
      // Дебаг-метка: показать в Telegram что это резервный канал сработал.
      // Полезно если сам заказ ещё не в БД — админ поймёт откуда пришло.
      extraLines.push(firestoreOk
        ? (firestoreError === 'already_exists' ? '✅ БД: заказ уже есть' : '✅ БД: записан через резервный канал')
        : '⚠️ БД: не удалось записать (' + (firestoreError || 'unknown') + ')');

      const text =
        '🔔 НОВЫЙ ЗАКАЗ\n\n' +
        `👤 ${payload.name}\n` +
        `📞 ${payload.phone}\n` +
        `📍 ${payload.address || '-'}\n\n` +
        '📦 Товары:\n' + itemsText + '\n\n' +
        `💰 Итого: ${payload.total.toLocaleString('ru-RU')} сом\n` +
        `⏰ ${payload.time || new Date().toLocaleString('ru-RU')}\n` +
        `🆔 ${orderId.slice(-8)}\n` +
        extraLines.join('\n');

      const chatIds = ['5567924440', '246421345'];
      const results = await Promise.allSettled(chatIds.map(async (chatId) => {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: text })
        });
        return tgRes.ok;
      }));
      telegramResults.primary = results[0].status === 'fulfilled' && results[0].value === true;
      telegramResults.secondary = results[1].status === 'fulfilled' && results[1].value === true;
    }

    // ─── ОТВЕТ КЛИЕНТУ ─────────────────────────────────────
    // Даже если один из каналов упал — возвращаем ok, чтобы клиент не
    // спамил ретраями. Логи на сервере покажут детали.
    res.status(200).json({
      ok: true,
      orderId: orderId,
      firestore: { ok: firestoreOk, error: firestoreError },
      telegram: telegramResults
    });
  });

// ============================================================
// findOrders — УДАЛЕНО после диагностики пропажи заказа Замира
// (10.08.2026). Заказа с телефоном 0995122334 в БД не было —
// он застрял в Firestore SDK offline queue на планшете агента
// из-за бага «удаление backup по лживому .set().then() успеху».
// Баг исправлен в v4.25 — теперь backup удаляется только после
// server-confirmed через orderNotify.
// Если понадобится снова — восстановить из git history:
//   git show <commit>:functions/index.js | grep -A 100 findOrders
// ============================================================
/* удалено — см. коммит-историю
const FIND_ORDERS_SECRET_UNUSED = null;

function _normalizePhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-9);
}

exports_disabled_findOrders = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const secret = (req.query.secret || req.body.secret || '').toString();
    if (secret !== FIND_ORDERS_SECRET) {
      res.status(403).json({ ok: false, error: 'forbidden' });
      return;
    }

    const phoneRaw = (req.query.phone || req.body.phone || '').toString();
    const nameRaw = (req.query.name || req.body.name || '').toString().trim().toLowerCase();
    const daysStr = (req.query.days || req.body.days || '7').toString();
    const days = Math.min(30, Math.max(1, parseInt(daysStr, 10) || 7));
    const phoneKey = _normalizePhone(phoneRaw);

    const results = [];
    const debug = { checkedCollections: [], errors: [] };

    try {
      // ─── Ищем в orders за последние N дней ─────────────
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const sinceIso = new Date(sinceMs).toISOString();

      // Пробуем несколько возможных полей timestamp
      const collections = ['orders'];
      for (const col of collections) {
        debug.checkedCollections.push(col);
        try {
          // Берём все документы за N дней — постранично
          // Firestore не умеет OR-запросы, поэтому вытягиваем pageful и фильтруем в памяти
          const snap = await db.collection(col)
            .orderBy('createdAt', 'desc')
            .limit(2000)
            .get()
            .catch(async () => {
              // Если поля createdAt нет — просто ограничиваем limit
              return await db.collection(col).limit(2000).get();
            });

          snap.forEach(doc => {
            const d = doc.data() || {};
            const createdMs = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis()
              : (typeof d.createdAt === 'number' ? d.createdAt : null);
            if (createdMs !== null && createdMs < sinceMs) return;

            const docPhoneKey = _normalizePhone(d.phone || d.customerPhone || '');
            const docName = String(d.name || d.customerName || '').toLowerCase();
            const docPartner = String(d.partner || d.referredBy || '').toLowerCase();

            let match = false;
            const matches = [];
            if (phoneKey && docPhoneKey && docPhoneKey === phoneKey) { match = true; matches.push('phone'); }
            if (nameRaw && docName && docName.includes(nameRaw)) { match = true; matches.push('name'); }
            if (nameRaw && docPartner && docPartner.includes(nameRaw)) { match = true; matches.push('partner'); }

            if (match) {
              results.push({
                id: doc.id,
                collection: col,
                matchedOn: matches,
                name: d.name || d.customerName || null,
                phone: d.phone || d.customerPhone || null,
                address: d.address || d.customerAddress || null,
                partner: d.partner || d.referredBy || null,
                placedByAgent: d.placedByAgentName || (d.placedByAgent && d.placedByAgent.name) || null,
                total: d.total || d.totalAmount || null,
                status: d.status || null,
                itemsCount: Array.isArray(d.items) ? d.items.length : null,
                createdAt: createdMs ? new Date(createdMs).toISOString() : null,
              });
            }
          });
        } catch (e) {
          debug.errors.push({ col: col, msg: e.message });
        }
      }

      // ─── Проверяем clientAgents на телефон ─────────────
      if (phoneKey) {
        try {
          const doc = await db.collection('clientAgents').doc(phoneRaw).get();
          if (doc.exists) {
            debug.clientAgentsByRawPhone = doc.data();
          }
          const doc2 = await db.collection('clientAgents').doc(phoneKey).get();
          if (doc2.exists && doc2.id !== doc.id) {
            debug.clientAgentsByNormalizedPhone = doc2.data();
          }
        } catch (e) {
          debug.errors.push({ op: 'clientAgents', msg: e.message });
        }
      }

      res.status(200).json({
        ok: true,
        query: { phone: phoneRaw, phoneKey, name: nameRaw, days },
        found: results.length,
        results: results.slice(0, 50),
        debug
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message, debug });
    }
  });
*/
