// ===================================================================
// КЕРБЕН B2B Market — PWA Install Prompt
// ===================================================================

let deferredPrompt;
const installPwaContainer = document.getElementById('installPwaContainer');
const installPwaBtn = document.getElementById('installPwaBtn');

// СНАЧАЛА проверяем, запущено ли приложение в standalone режиме (уже установлено)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                     window.navigator.standalone === true ||
                     document.referrer.includes('android-app://') ||
                     window.matchMedia('(display-mode: fullscreen)').matches ||
                     window.matchMedia('(display-mode: minimal-ui)').matches;

if (isStandalone) {
  console.log('📱 Приложение уже установлено и запущено в standalone режиме');
  // Скрываем контейнер установки навсегда
  if (installPwaContainer) {
    installPwaContainer.style.display = 'none';
    installPwaContainer.remove(); // Полностью удаляем из DOM
  }
} else {
  // Ловим событие beforeinstallprompt только если НЕ в standalone режиме
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('💡 Доступна установка PWA');
    // Предотвращаем автоматический промпт браузера
    e.preventDefault();
    // Сохраняем событие для использования позже
    deferredPrompt = e;
    // Показываем кнопку установки
    if (installPwaContainer) {
      installPwaContainer.style.display = 'block';
    }
  });
}

// Обработчик клика на кнопку установки
if (installPwaBtn) {
  installPwaBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      console.log('❌ Промпт установки недоступен');
      return;
    }
    
    // Показываем стандартный промпт браузера
    deferredPrompt.prompt();
    
    // Ждём ответа пользователя
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`👤 Пользователь ${outcome === 'accepted' ? 'установил' : 'отклонил'} установку`);
    
    if (outcome === 'accepted') {
      // Показываем успешное сообщение
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: '🎉 Успешно!',
          text: 'Приложение Кербен установлено',
          timer: 2000,
          showConfirmButton: false
        });
      }
    }
    
    // Очищаем сохранённый промпт
    deferredPrompt = null;
    // Скрываем кнопку
    installPwaContainer.style.display = 'none';
  });
}

// ==================== iOS: Ручная установка PWA ====================
// iOS не поддерживает beforeinstallprompt, показываем инструкцию вручную
(function() {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
  const isInStandaloneMode = window.navigator.standalone === true || 
    window.matchMedia('(display-mode: standalone)').matches;

  if (isIOS && !isInStandaloneMode) {
    // Проверяем — не закрыл ли уже пользователь баннер
    const dismissed = localStorage.getItem('iosInstallDismissed');
    if (dismissed && (Date.now() - parseInt(dismissed)) < 7 * 24 * 3600 * 1000) return;

    // Показываем iOS-баннер через 3 секунды
    setTimeout(function() {
      var existing = document.getElementById('iosInstallBanner');
      if (existing) existing.style.display = 'block';
    }, 3000);
  }
})();

// Скрываем кнопку если приложение уже установлено
window.addEventListener('appinstalled', () => {
  console.log('✅ PWA приложение установлено');
  if (installPwaContainer) {
    installPwaContainer.style.display = 'none';
  }
  deferredPrompt = null;
  
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: '🎉 Готово!',
      text: 'Приложение Кербен добавлено на главный экран',
      timer: 2500,
      showConfirmButton: false
    });
  }
});
