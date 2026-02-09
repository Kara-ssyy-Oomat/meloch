const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Cloud Function: отправляет Push-уведомление клиенту при новом сообщении от админа
 * Триггер: создание документа в chatMessages
 */
exports.sendChatNotification = functions
  .region('europe-west1')
  .firestore
  .document('chatMessages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    
    // Отправляем только если сообщение от админа
    if (message.sender !== 'admin') {
      console.log('Сообщение от клиента - пропускаем');
      return null;
    }
    
    const clientId = message.clientId;
    if (!clientId) {
      console.log('Нет clientId - пропускаем');
      return null;
    }
    
    try {
      // Получаем FCM токен клиента
      const tokensSnapshot = await db.collection('fcmTokens')
        .where('clientId', '==', clientId)
        .get();
      
      if (tokensSnapshot.empty) {
        console.log('Нет FCM токенов для клиента:', clientId);
        return null;
      }
      
      // Собираем все токены клиента
      const tokens = [];
      tokensSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.token) {
          tokens.push(data.token);
        }
      });
      
      if (tokens.length === 0) {
        console.log('Токены пустые для клиента:', clientId);
        return null;
      }
      
      console.log(`Отправляем push ${tokens.length} устройствам клиента ${clientId}`);
      
      // Формируем уведомление
      const notification = {
        title: '💬 Кербен - Новое сообщение',
        body: message.text?.substring(0, 100) || 'У вас новое сообщение от продавца'
      };
      
      // Отправляем на все устройства клиента
      const response = await messaging.sendEachForMulticast({
        tokens: tokens,
        notification: notification,
        webpush: {
          headers: {
            'Urgency': 'high'  // Высокий приоритет
          },
          notification: {
            icon: 'https://svoysayet.web.app/icon-kerben.jpg',
            badge: 'https://svoysayet.web.app/icon-kerben.jpg',
            vibrate: [300, 100, 300, 100, 300],  // Длинная вибрация
            requireInteraction: true,
            silent: false,  // Включить звук!
            tag: 'kerben-chat-' + Date.now(),  // Уникальный тег
            renotify: true,  // Уведомлять даже если есть похожее
            actions: [
              { action: 'open', title: '📖 Открыть' },
              { action: 'close', title: '✖️ Закрыть' }
            ]
          },
          fcmOptions: {
            link: 'https://svoysayet.web.app/chat.html'
          }
        },
        // Для Android
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'high',
            channelId: 'chat_messages'
          }
        },
        data: {
          type: 'chat_message',
          clientId: clientId,
          messageId: context.params.messageId
        }
      });
      
      console.log(`Push отправлен: ${response.successCount} успешно, ${response.failureCount} ошибок`);
      
      // Удаляем невалидные токены
      const tokensToDelete = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          const error = result.error;
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            tokensToDelete.push(tokens[index]);
          }
        }
      });
      
      // Удаляем невалидные токены из Firestore
      if (tokensToDelete.length > 0) {
        const batch = db.batch();
        for (const token of tokensToDelete) {
          const tokenDoc = db.collection('fcmTokens').doc(token);
          batch.delete(tokenDoc);
        }
        await batch.commit();
        console.log(`Удалено ${tokensToDelete.length} невалидных токенов`);
      }
      
      return { success: true, sent: response.successCount };
      
    } catch (error) {
      console.error('Ошибка отправки push:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Cloud Function: отправляет Push-уведомление о новом заказе
 * Можно вызвать вручную с токеном клиента
 */
exports.sendOrderNotification = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    const { clientId, orderNumber, status } = data;
    
    if (!clientId) {
      throw new functions.https.HttpsError('invalid-argument', 'clientId обязателен');
    }
    
    try {
      // Получаем токены клиента
      const tokensSnapshot = await db.collection('fcmTokens')
        .where('clientId', '==', clientId)
        .get();
      
      if (tokensSnapshot.empty) {
        return { success: false, message: 'Нет FCM токенов' };
      }
      
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);
      
      const statusMessages = {
        'new': '🆕 Новый заказ создан',
        'processing': '⏳ Заказ обрабатывается',
        'shipped': '🚚 Заказ отправлен',
        'delivered': '✅ Заказ доставлен',
        'cancelled': '❌ Заказ отменён'
      };
      
      const notification = {
        title: '📦 Кербен - Заказ',
        body: statusMessages[status] || `Заказ ${orderNumber || ''}: ${status}`
      };
      
      const response = await messaging.sendEachForMulticast({
        tokens: tokens,
        notification: notification,
        webpush: {
          fcmOptions: {
            link: 'https://svoysayet.web.app/profile.html'
          }
        }
      });
      
      return { success: true, sent: response.successCount };
      
    } catch (error) {
      console.error('Ошибка:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Cloud Function: массовая рассылка Push всем подписчикам
 * Для рекламных акций и объявлений
 */
exports.sendBroadcastPush = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    const { title, body, link } = data;
    
    if (!title || !body) {
      throw new functions.https.HttpsError('invalid-argument', 'title и body обязательны');
    }
    
    try {
      // Получаем все токены
      const tokensSnapshot = await db.collection('fcmTokens').get();
      
      if (tokensSnapshot.empty) {
        return { success: false, message: 'Нет подписчиков' };
      }
      
      const allTokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);
      
      // Разбиваем на батчи по 500 (лимит FCM)
      const batchSize = 500;
      let totalSent = 0;
      let totalFailed = 0;
      
      for (let i = 0; i < allTokens.length; i += batchSize) {
        const batchTokens = allTokens.slice(i, i + batchSize);
        
        const response = await messaging.sendEachForMulticast({
          tokens: batchTokens,
          notification: { title, body },
          webpush: {
            fcmOptions: {
              link: link || 'https://svoysayet.web.app/'
            }
          }
        });
        
        totalSent += response.successCount;
        totalFailed += response.failureCount;
      }
      
      console.log(`Broadcast: ${totalSent} успешно, ${totalFailed} ошибок из ${allTokens.length}`);
      
      return { 
        success: true, 
        total: allTokens.length,
        sent: totalSent, 
        failed: totalFailed 
      };
      
    } catch (error) {
      console.error('Ошибка broadcast:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });
