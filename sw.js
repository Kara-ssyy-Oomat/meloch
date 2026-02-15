// Service Worker для PWA приложения "Кербен"
// Обеспечивает кэширование и автоматическое обновление

const CACHE_VERSION = 'kerben-v3.5.0-spa-redirect'; // Фикс: редирект на SPA оболочку
const CACHE_NAME = `kerben-cache-${CACHE_VERSION}`;
const FIREBASE_CACHE = 'firebase-sdk-cache';
const IMAGE_CACHE = 'kerben-images-v1'; // Отдельный кэш для изображений
const IMAGE_CACHE_LIMIT = 200; // Максимум 200 изображений в кэше

// Firebase SDK для кэширования
const FIREBASE_URLS = [
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage-compat.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// Файлы для кэширования
const STATIC_CACHE_URLS = [
  './index.html',
  './profile.html',
  './cart.html',
  './chat.html',
  './admin-chat.html',
  './admin-orders.html',
  './admin-products.html',
  './admin-profit.html',
  './admin-sellers.html',
  './admin-categories.html',
  './admin-agents.html',
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
  './js/profit-report.js',
  './js/expenses.js',
  './js/agents.js',
  './js/bottom-nav.js'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Установка Service Worker...');
  
  event.waitUntil(
    Promise.all([
      // Кэшируем локальные файлы
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Кэширование файлов приложения');
        return cache.addAll([
          './index.html',
          './manifest.json',
          './css/styles.css',
          './js/bottom-nav.js',
          './js/advanced-search.js'
        ]);
      }),
      // Кэшируем Firebase SDK отдельно
      caches.open(FIREBASE_CACHE).then((cache) => {
        console.log('[SW] Кэширование Firebase SDK');
        return Promise.all(
          FIREBASE_URLS.map(url => 
            fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(err => console.log('[SW] Не удалось кэшировать:', url))
          )
        );
      })
    ])
    .then(() => {
      console.log('[SW] Service Worker установлен');
      return self.skipWaiting();
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
        // Удаляем старые кэши (кроме Firebase и изображений)
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== FIREBASE_CACHE && cacheName !== IMAGE_CACHE) {
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

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Firebase SDK и CDN - Cache First (из кэша, потом сеть)
  if (url.origin.includes('gstatic.com') || url.origin.includes('jsdelivr.net') || url.origin.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse; // Моментально из кэша!
        }
        return fetch(event.request).then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(FIREBASE_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // НОВОЕ: Кэширование изображений товаров (wsrv.nl, imgbb, cloudinary)
  if (url.origin.includes('wsrv.nl') || 
      url.origin.includes('i.ibb.co') || 
      url.origin.includes('images.weserv.nl') ||
      (url.origin.includes('cloudinary.com') && event.request.destination === 'image')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse; // Изображение из кэша — мгновенно!
          }
          return fetch(event.request).then(response => {
            if (response.ok) {
              cache.put(event.request, response.clone());
              // Ограничиваем размер кэша
              cache.keys().then(keys => {
                if (keys.length > IMAGE_CACHE_LIMIT) {
                  cache.delete(keys[0]); // Удаляем самое старое
                }
              });
            }
            return response;
          }).catch(() => {
            // Офлайн — показываем placeholder
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/><text fill="#999" font-family="Arial" font-size="14" x="100" y="100" text-anchor="middle">📷</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }
  
  // Firestore/Storage API - пропускаем без кэширования
  if (url.origin.includes('firebase') || 
      url.origin.includes('googleapis') ||
      url.origin.includes('telegram') ||
      url.origin.includes('cloudinary')) {
    return;
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
