// ===================================================================
// КЕРБЕН B2B Market — Service Worker Registration & Auto-update
// ===================================================================

// Service Worker работает только на http/https, не на file://
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('✅ Service Worker зарегистрирован:', registration.scope);
        
        // Немедленная проверка обновлений при загрузке
        registration.update();
        
        // Проверка обновлений каждые 5 минут
        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);
        
        // Проверка при возвращении на вкладку
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
              console.log('🔄 Найдена новая версия - обновляем...');
              // Активируем новый Service Worker
              newWorker.postMessage('skipWaiting');
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ Ошибка регистрации Service Worker:', error);
      });
  });
  
  // При смене контроллера — перезагружаем страницу
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('✨ Приложение обновлено - перезагрузка...');
      window.location.reload();
    }
  });
}
