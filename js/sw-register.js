// ===================================================================
// КЕРБЕН B2B Market — Service Worker Registration & Auto-update
// ===================================================================

// Service Worker работает только на http/https, не на file://
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('✅ Service Worker зарегистрирован:', registration.scope);
        
        // Проверка обновлений каждые 30 минут (не влияет на производительность)
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);
        
        // Дополнительная проверка при возвращении на вкладку (без нагрузки)
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            registration.update();
          }
        });
        
        // Обработка обновлений
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Новая версия доступна - обновляем автоматически!
              console.log('🔄 Найдена новая версия - автоматическое обновление...');
              
              // Активируем новый Service Worker и перезагружаем
              newWorker.postMessage({ action: 'skipWaiting' });
              
              // Небольшая задержка для плавности
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ Ошибка регистрации Service Worker:', error);
      });
  });
  
  // Автоматическое обновление при активации нового SW (плавно и незаметно)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('✨ Приложение обновлено - перезагрузка...');
      // Обновление происходит плавно
      window.location.reload();
    }
  });
}
