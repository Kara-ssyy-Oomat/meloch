// Firebase Messaging Service Worker для Push-уведомлений
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

// Инициализация Firebase
firebase.initializeApp({
  apiKey: "AIzaSyBRQ6hH7kXq7ApJmqbvTG1EQsXwxWEnaGg",
  authDomain: "svoysayet.firebaseapp.com",
  projectId: "svoysayet",
  storageBucket: "svoysayet.firebasestorage.app",
  messagingSenderId: "450143000217",
  appId: "1:450143000217:web:7495cefaea0b94966e8a08"
});

const messaging = firebase.messaging();

// Обработка push-уведомлений в фоне (когда сайт закрыт)
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Получено фоновое сообщение:', payload);
  
  const notificationTitle = payload.notification?.title || 'Кербен';
  const notificationOptions = {
    body: payload.notification?.body || 'Новое сообщение',
    icon: './icon-kerben.jpg',
    badge: './icon-kerben.jpg',
    tag: 'kerben-notification',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Открыть' },
      { action: 'close', title: 'Закрыть' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM SW] Клик по уведомлению:', event);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // Открываем сайт при клике
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Если окно уже открыто - фокусируемся на нём
        for (const client of clientList) {
          if (client.url.includes('index.html') || client.url.includes('chat.html')) {
            return client.focus();
          }
        }
        // Иначе открываем новое окно
        return clients.openWindow('./chat.html');
      })
  );
});

// Push event (альтернативный способ)
self.addEventListener('push', (event) => {
  console.log('[FCM SW] Push событие:', event);
  
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {
    data = { title: 'Кербен', body: event.data?.text() || 'Новое уведомление' };
  }
  
  const title = data.notification?.title || data.title || 'Кербен';
  const options = {
    body: data.notification?.body || data.body || 'Новое сообщение',
    icon: './icon-kerben.jpg',
    badge: './icon-kerben.jpg',
    tag: 'kerben-push',
    vibrate: [200, 100, 200],
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});
