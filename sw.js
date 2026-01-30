// Service Worker для PWA приложения "Кербен"
// Обеспечивает кэширование и автоматическое обновление

const CACHE_VERSION = 'kerben-v2.1.0-crop-editor'; // Добавлен редактор обрезки фото
const CACHE_NAME = `kerben-cache-${CACHE_VERSION}`;

// Файлы для кэширования
const STATIC_CACHE_URLS = [
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/filters.js',
  './js/advanced-search.js',
  './js/helpers.js',
  './js/image-optimizer.js',
  './js/upload.js',
  './js/gallery.js',
  './js/favorites.js',
  './js/cart.js',
  './js/variants.js',
  './js/quantity.js',
  './js/orders.js',
  './js/customer-auth.js',
  './js/chat.js',
  './js/seller.js',
  './js/admin-chat.js',
  './js/order-tracking.js',
  './js/partners.js',
  './js/orders-management.js',
  './js/profit-report.js',
  './js/expenses.js',
  './js/agents.js',
  './js/bottom-nav.js'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Установка Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование файлов приложения');
        // Кэшируем только критичные файлы для быстрой работы
        // Остальное загружается по требованию (не тормозит сайт)
        return cache.addAll([
          './index.html',
          './manifest.json',
          './css/styles.css',
          './js/advanced-search.js'
        ]);
      })
      .then(() => {
        console.log('[SW] Service Worker установлен (легкий режим)');
        return self.skipWaiting(); // Активируем новый SW сразу
      })
      .catch((error) => {
        console.error('[SW] Ошибка при кэшировании:', error);
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Удаляем старые кэши
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Удаление старого кэша:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker активирован');
        return self.clients.claim(); // Берём контроль над всеми вкладками
      })
  );
});

// Обработка запросов - Network First стратегия (сначала сеть, потом кэш)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Пропускаем запросы к Firebase и внешним API (не кэшируем, не замедляем)
  if (url.origin.includes('firebase') || 
      url.origin.includes('googleapis') ||
      url.origin.includes('telegram') ||
      url.origin.includes('cloudinary')) {
    return; // Пропускаем без обработки - максимальная скорость
  }
  
  // Только для HTML, CSS, JS - остальное грузим напрямую
  if (!event.request.url.match(/\.(html|css|js)$/)) {
    return; // Изображения и другие файлы загружаются напрямую (быстрее!)
  }
  
  event.respondWith(
    // Стратегия Network First - всегда пытаемся загрузить свежее
    fetch(event.request)
      .then((response) => {
        // Если получили ответ от сети, кэшируем в фоне (не тормозит!)
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          // Кэширование происходит асинхронно, не блокирует показ страницы
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Если сеть недоступна, берём из кэша (офлайн режим)
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Если в кэше нет, показываем offline страницу для HTML
            if (event.request.headers.get('accept').includes('text/html')) {
              return new Response(
                `<!DOCTYPE html>
                <html lang="ru">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Кербен - Офлайн</title>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      text-align: center;
                      padding: 20px;
                    }
                    h1 { font-size: 2.5em; margin-bottom: 20px; }
                    p { font-size: 1.2em; margin-bottom: 30px; }
                    button {
                      background: white;
                      color: #667eea;
                      border: none;
                      padding: 15px 30px;
                      font-size: 1.1em;
                      border-radius: 30px;
                      cursor: pointer;
                      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    }
                    button:hover { transform: scale(1.05); }
                  </style>
                </head>
                <body>
                  <h1>📱 Кербен</h1>
                  <p>⚠️ Нет подключения к интернету</p>
                  <p>Пожалуйста, проверьте соединение и попробуйте снова</p>
                  <button onclick="location.reload()">🔄 Обновить</button>
                </body>
                </html>`,
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
          });
      })
  );
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
