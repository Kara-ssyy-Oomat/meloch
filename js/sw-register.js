// ===================================================================
// КЕРБЕН B2B Market — Service Worker Registration & Auto-update
// ===================================================================
// Цель: клиент должен получать новую версию сайта МОМЕНТАЛЬНО, без
// «второго входа». Особенно важно для Android PWA (иконка на рабочем
// столе), где браузер может держать старый SW между сессиями.
//
// Ключевые механики:
//   1) updateViaCache: 'none' — заставляем браузер каждый раз тянуть
//      сам файл sw.js по сети (иначе Chrome может отдавать его из HTTP
//      кэша и обновление никогда не находит).
//   2) Периодическая проверка + при возврате на вкладку/фокусе окна.
//   3) На updatefound — просим новый SW перескочить waiting (postMessage
//      SKIP_WAITING). Новый SW при получении вызывает self.skipWaiting()
//      и сразу активируется.
//   4) На controllerchange — перезагружаем страницу, чтобы весь JS/CSS
//      был свежий. Показываем короткий тост, чтобы пользователь понимал
//      что происходит (иначе выглядит как случайное мигание).

if ('serviceWorker' in navigator && location.protocol !== 'file:') {

  // Небольшая утилита — показать зелёный тост «Обновляем…».
  // Если DOM ещё не готов или CSP запрещает — тихо игнорируем.
  function _showUpdateToast(text) {
    try {
      if (!document.body) return;
      // Не добавляем второй тост, если уже висит
      if (document.getElementById('__sw_update_toast')) return;
      const el = document.createElement('div');
      el.id = '__sw_update_toast';
      el.textContent = text || '🔄 Обновляем приложение...';
      el.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0',
        'padding:12px 16px',
        'background:linear-gradient(135deg,#4caf50,#2e7d32)',
        'color:#fff',
        'text-align:center',
        'font:600 14px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'z-index:2147483647',
        'box-shadow:0 2px 8px rgba(0,0,0,.2)'
      ].join(';');
      document.body.appendChild(el);
    } catch (e) {}
  }

  // ===============================================================
  // ЗАЩИТА ОТ ЦИКЛИЧНОЙ ПЕРЕЗАГРУЗКИ (reload-loop)
  // ---------------------------------------------------------------
  // На мобильном Chrome / Android PWA цепочка update() → skipWaiting
  // → clients.claim() → controllerchange → location.reload() на
  // некоторых устройствах срабатывает заново сразу после reload,
  // и сайт «вечно обновляется», не давая работать.
  //
  // Нам нужны ДВА предохранителя:
  //   1) throttle на registration.update(): не чаще, чем раз в
  //      UPDATE_MIN_INTERVAL_MS. visibilitychange/focus на телефоне
  //      могут срабатывать каждые пару секунд.
  //   2) rate-limit на controllerchange-reload: если мы ТОЛЬКО ЧТО
  //      перезагрузились по SW (меньше RELOAD_LOOP_WINDOW_MS назад),
  //      НЕ перезагружаемся ещё раз. Иначе уходим в бесконечный цикл.
  // ===============================================================
  const UPDATE_MIN_INTERVAL_MS = 60 * 1000;       // не чаще 1 раза в минуту
  const RELOAD_LOOP_WINDOW_MS  = 20 * 1000;       // окно обнаружения цикла
  const RELOAD_FLAG_KEY        = '__kerben_sw_last_reload';

  let _lastUpdateAt = 0;
  function throttledUpdate(registration) {
    const now = Date.now();
    if (now - _lastUpdateAt < UPDATE_MIN_INTERVAL_MS) return;
    _lastUpdateAt = now;
    try { registration.update().catch(() => {}); } catch (e) {}
  }

  function markReloadAttempt() {
    try { sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now())); } catch (e) {}
  }
  function hadRecentReload() {
    try {
      const v = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || 0);
      return v > 0 && (Date.now() - v) < RELOAD_LOOP_WINDOW_MS;
    } catch (e) { return false; }
  }

  window.addEventListener('load', () => {
    // updateViaCache: 'none' — САМ файл sw.js всегда тянется по сети,
    // а не из HTTP-кэша. Иначе браузер может кешировать sw.js и никогда
    // не заметить обновления. Особенно актуально для Android PWA.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        console.log('✅ Service Worker зарегистрирован:', registration.scope);

        // Немедленная проверка обновлений при загрузке
        throttledUpdate(registration);

        // Проверка обновлений каждые 5 минут
        setInterval(() => { throttledUpdate(registration); }, 5 * 60 * 1000);

        // Проверку при visibilitychange/focus УБРАЛИ: на мобильном Chrome
        // эти события срабатывают каждые несколько секунд (переключение
        // приложений, пуши, разблокировка экрана) и в связке с
        // SKIP_WAITING + clients.claim() + reload() создавали ощущение
        // «вечной перезагрузки» PWA. Для свежести достаточно проверки
        // при загрузке страницы + каждые 5 минут.

        // Если новый SW уже в waiting на момент регистрации — сразу просим
        // его активироваться. Это бывает если пользователь пришёл в
        // приложение уже после того, как новый SW был установлен и ждал.
        // НО: если буквально только что уже была SW-перезагрузка — не
        // трогаем, чтобы не поймать цикл.
        if (registration.waiting && navigator.serviceWorker.controller && !hadRecentReload()) {
          console.log('🔄 Новая версия уже ждёт активации — скипаем waiting');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Обработка обновлений
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (hadRecentReload()) {
                // Если минутой раньше уже перезагружались — пропускаем
                // скип и ждём, пока пользователь сам обновит страницу.
                console.warn('[SW] Недавняя SW-перезагрузка — не форсируем skipWaiting, чтобы не зациклиться');
                return;
              }
              console.log('🔄 Найдена новая версия — активируем...');
              // Просим новый SW перескочить waiting-стадию.
              // Совместимость: старый sw.js слушал строку 'skipWaiting',
              // новый — объект { type: 'SKIP_WAITING' }. Шлём оба.
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              newWorker.postMessage('skipWaiting');
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ Ошибка регистрации Service Worker:', error);
      });
  });

  // При смене контроллера — перезагружаем страницу, чтобы весь HTML/JS/CSS
  // подгрузился свежим. Показываем короткий тост, чтобы пользователь понимал
  // почему страница «мигает».
  //
  // ВАЖНО: если мы перезагружались по SW < 20 секунд назад — НЕ перезагружаемся
  // снова, чтобы не поймать бесконечный цикл (бывало на мобильном Chrome).
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    if (hadRecentReload()) {
      console.warn('[SW] controllerchange, но только что уже была перезагрузка — пропускаем, чтобы не зациклиться');
      return;
    }
    refreshing = true;
    markReloadAttempt();
    console.log('✨ Приложение обновлено — перезагрузка...');
    _showUpdateToast('🔄 Обновляем приложение...');
    // Небольшая задержка, чтобы тост успел показаться (200мс) и SW
    // успел клеймнуть страницу.
    setTimeout(() => { window.location.reload(); }, 200);
  });
}
