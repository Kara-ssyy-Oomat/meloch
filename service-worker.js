// Service Worker для PWA
// ВАЖНО: При каждом изменении сайта увеличивайте номер версии!
const CACHE_NAME = 'meloch-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html'
];

// Установка Service Worker - принудительно активируется немедленно
self.addEventListener('install', (event) => {
  // Пропускаем ожидание, активируем сразу
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Кэш открыт');
        return cache.addAll(urlsToCache);
      })
  );
});

// Активация Service Worker - берём контроль над всеми страницами
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Активация');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            // Удаляем старые кэши при обновлении
            console.log('Service Worker: Удален старый кэш', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Немедленно берём контроль над всеми открытыми страницами
      console.log('Service Worker: Контроль захвачен');
      return self.clients.claim();
    })
  );
});

// Обработка запросов - Network First стратегия для HTML
self.addEventListener('fetch', (event) => {
  // Для HTML файлов - сначала пытаемся загрузить с сервера
  if (event.request.url.includes('.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Обновляем кэш новой версией
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Если офлайн - используем кэш
          console.log('Service Worker: Загрузка из кэша (офлайн)');
          return caches.match(event.request);
        })
    );
  } else {
    // Для остальных ресурсов (картинки, CSS, JS) - Cache First
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});

// Уведомление о новой версии
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
