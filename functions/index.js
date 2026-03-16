// ===================================================================
// КЕРБЕН B2B Market — Cloud Functions для push-уведомлений
// ===================================================================
//
// УСТАНОВКА И ДЕПЛОЙ:
// 1. Установите Firebase CLI: npm install -g firebase-tools
// 2. firebase login
// 3. cd в папку проекта
// 4. firebase init functions (выберите JavaScript)
// 5. Скопируйте этот файл в functions/index.js
// 6. cd functions && npm install firebase-admin firebase-functions
// 7. firebase deploy --only functions
//
// ===================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

// ==================== ОБРАБОТКА ОЧЕРЕДИ УВЕДОМЛЕНИЙ ====================
// Слушаем новые документы в коллекции notificationQueue
exports.processNotificationQueue = functions.firestore
  .document('notificationQueue/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.data();

    if (notif.status !== 'pending') return null;

    try {
      if (notif.type === 'chat') {
        // Уведомление конкретному клиенту (ответ в чате)
        await sendChatNotification(notif);
      } else if (notif.type === 'broadcast') {
        // Рассылка всем подписчикам
        await sendBroadcastNotification(notif);
      }

      // Помечаем как отправленное
      await snap.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Ошибка отправки уведомления:', error);
      await snap.ref.update({
        status: 'error',
        error: error.message
      });
    }

    return null;
  });

// ==================== ОТПРАВКА ЧАТ-УВЕДОМЛЕНИЯ ====================
async function sendChatNotification(notif) {
  // Находим FCM токен клиента
  const clientDoc = await db.collection('chatClients')
    .doc(notif.targetClientId)
    .get();

  if (!clientDoc.exists || !clientDoc.data().pushToken) {
    console.log('Клиент не подписан на push:', notif.targetClientId);
    return;
  }

  const token = clientDoc.data().pushToken;

  const message = {
    token: token,
    // НЕ используем notification — только data!
    // Иначе Android сам обрабатывает уведомление тихо
    data: {
      title: notif.title || 'Кербен',
      body: notif.body || 'Новое сообщение',
      type: 'chat',
      clientId: notif.targetClientId || '',
      url: './index.html',
      tag: 'chat-' + (notif.targetClientId || 'default'),
      timestamp: Date.now().toString()
    },
    // Android: максимальный приоритет = heads-up уведомление сверху
    android: {
      priority: 'high',
      notification: {
        title: notif.title || 'Кербен',
        body: notif.body || 'Новое сообщение',
        icon: 'icon_kerben',
        channelId: 'kerben_messages',
        priority: 'max',
        visibility: 'public',
        defaultSound: true,
        defaultVibrateTimings: true,
        notificationCount: 1
      }
    },
    // iOS (Apple) — максимальный приоритет
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert'
      },
      payload: {
        aps: {
          alert: {
            title: notif.title || 'Кербен',
            body: notif.body || 'Новое сообщение'
          },
          sound: 'default',
          badge: 1,
          'mutable-content': 1,
          'content-available': 1
        }
      }
    },
    // Web Push: громкий с вибрацией
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      notification: {
        title: notif.title || 'Кербен',
        body: notif.body || 'Новое сообщение',
        icon: './icon-kerben.jpg',
        badge: './icon-kerben.jpg',
        vibrate: [300, 150, 300, 150, 300],
        tag: 'chat-' + (notif.targetClientId || 'default'),
        renotify: true,
        requireInteraction: true,
        actions: [
          { action: 'open', title: '📖 Открыть' },
          { action: 'close', title: '✕ Закрыть' }
        ]
      },
      fcmOptions: {
        link: './index.html'
      }
    }
  };

  try {
    await admin.messaging().send(message);
    console.log('Push отправлен клиенту:', notif.targetClientId);
  } catch (error) {
    // Если токен невалидный — удаляем его
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log('Удаляем невалидный токен для:', notif.targetClientId);
      await db.collection('chatClients').doc(notif.targetClientId).update({
        pushToken: admin.firestore.FieldValue.delete(),
        pushEnabled: false
      });
      await db.collection('pushTokens').doc(token).delete();
    }
    throw error;
  }
}

// ==================== РАССЫЛКА ВСЕМ ====================
async function sendBroadcastNotification(notif) {
  // Получаем все активные токены
  const tokensSnapshot = await db.collection('pushTokens').get();

  if (tokensSnapshot.empty) {
    console.log('Нет подписчиков для broadcast');
    return;
  }

  const tokens = [];
  tokensSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.token) {
      tokens.push(data.token);
    }
  });

  if (tokens.length === 0) return;

  const message = {
    data: {
      title: notif.title || 'Кербен',
      body: notif.body || 'Новое уведомление',
      type: 'broadcast',
      url: './index.html',
      tag: 'broadcast',
      timestamp: Date.now().toString()
    },
    android: {
      priority: 'high',
      notification: {
        title: notif.title || 'Кербен',
        body: notif.body || 'Новое уведомление',
        icon: 'icon_kerben',
        channelId: 'kerben_messages',
        priority: 'max',
        visibility: 'public',
        defaultSound: true,
        defaultVibrateTimings: true
      }
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert'
      },
      payload: {
        aps: {
          alert: {
            title: notif.title || 'Кербен',
            body: notif.body || 'Новое уведомление'
          },
          sound: 'default',
          badge: 1,
          'mutable-content': 1,
          'content-available': 1
        }
      }
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      notification: {
        title: notif.title || 'Кербен',
        body: notif.body || 'Новое уведомление',
        icon: './icon-kerben.jpg',
        badge: './icon-kerben.jpg',
        vibrate: [300, 150, 300, 150, 300],
        tag: 'broadcast',
        renotify: true,
        requireInteraction: true,
        actions: [
          { action: 'open', title: '📖 Открыть' },
          { action: 'close', title: '✕ Закрыть' }
        ]
      },
      fcmOptions: {
        link: './index.html'
      }
    }
  };

  // Отправляем пакетами по 500 (лимит FCM)
  const batches = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    batches.push(batch);
  }

  let successCount = 0;
  let failCount = 0;
  const invalidTokens = [];

  for (const batch of batches) {
    const response = await admin.messaging().sendEachForMulticast({
      ...message,
      tokens: batch
    });

    successCount += response.successCount;
    failCount += response.failureCount;

    // Собираем невалидные токены для удаления
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        if (errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered') {
          invalidTokens.push(batch[idx]);
        }
      }
    });
  }

  // Удаляем невалидные токены
  if (invalidTokens.length > 0) {
    const deletePromises = invalidTokens.map(token =>
      db.collection('pushTokens').doc(token).delete()
    );
    await Promise.all(deletePromises);
    console.log('Удалено невалидных токенов:', invalidTokens.length);
  }

  console.log(`Broadcast: отправлено ${successCount}, ошибок ${failCount}`);
}
