// ===================================================================
// КЕРБЕН B2B Market — Cloud Functions для push-уведомлений
// ===================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

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
