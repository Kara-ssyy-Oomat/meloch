// ===================================================================
// КЕРБЕН B2B Market — Background Pause (ОПТИМИЗАЦИЯ COSTS)
// -------------------------------------------------------------------
// Когда вкладка уходит в фон (свернули браузер, переключились на другое
// приложение, экран телефона погас) — через GRACE_MS секунд мы рвём
// сетевое соединение Firestore через `db.disableNetwork()`. Это:
//   • моментально убивает ВСЕ активные onSnapshot-listeners,
//   • закрывает Active Connection в Firebase Console (падает до 0),
//   • прекращает любые фоновые Read Ops и обновления Rules-метрик.
//
// Когда пользователь возвращается на вкладку — вызываем `enableNetwork()`,
// Firestore автоматически переподключается, listeners оживают и догоняют
// пропущенные изменения через локальный IndexedDB-кэш.
//
// Зачем grace-period: чтобы кратковременное переключение (буквально
// «глянул в адресную строку») не дёргало сеть. По умолчанию 60 секунд.
//
// Кастомизация на конкретной странице (поставить ДО подключения скрипта):
//   <script>window.KERBEN_BACKGROUND = { graceMs: 300000 };</script>
//   // graceMs: 0  — отключать сразу при уходе в фон
//   // graceMs: N  — ждать N миллисекунд
//   // disabled: true — полностью выключить авто-паузу
// ===================================================================

(function () {
  'use strict';

  var cfg = window.KERBEN_BACKGROUND || {};
  if (cfg.disabled === true) return;

  var GRACE_MS = (typeof cfg.graceMs === 'number') ? cfg.graceMs : 60000;

  var disconnectTimer = null;
  var networkDisabled = false;
  var ready = false;

  function getDb() {
    try {
      if (typeof firebase === 'undefined') return null;
      if (!firebase.firestore) return null;
      if (firebase.apps && firebase.apps.length === 0) return null;
      return firebase.firestore();
    } catch (e) {
      return null;
    }
  }

  function disableNet() {
    var db = getDb();
    if (!db || networkDisabled) return;
    networkDisabled = true;
    try {
      db.disableNetwork()
        .then(function () {
          console.log('[BackgroundPause] Firestore выключен (вкладка в фоне)');
        })
        .catch(function (err) {
          networkDisabled = false;
          console.warn('[BackgroundPause] disableNetwork error:', err);
        });
    } catch (e) {
      networkDisabled = false;
    }
  }

  function enableNet() {
    var db = getDb();
    if (!db || !networkDisabled) return;
    var was = networkDisabled;
    networkDisabled = false;
    try {
      db.enableNetwork()
        .then(function () {
          console.log('[BackgroundPause] Firestore включён (вкладка активна)');
        })
        .catch(function (err) {
          networkDisabled = was;
          console.warn('[BackgroundPause] enableNetwork error:', err);
        });
    } catch (e) {
      networkDisabled = was;
    }
  }

  function scheduleDisable() {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    if (GRACE_MS <= 0) {
      disableNet();
    } else {
      disconnectTimer = setTimeout(function () {
        disconnectTimer = null;
        disableNet();
      }, GRACE_MS);
    }
  }

  function cancelDisableAndResume() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    enableNet();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      scheduleDisable();
    } else {
      cancelDisableAndResume();
    }
  }

  function onPageHide() {
    if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
    disableNet();
  }

  function onPageShow() {
    cancelDisableAndResume();
  }

  function init() {
    if (ready) return;
    if (!getDb()) return;
    ready = true;

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', cancelDisableAndResume);
    window.addEventListener('blur', function () {
      if (document.hidden) scheduleDisable();
    });

    if (document.hidden) scheduleDisable();

    var sec = Math.round(GRACE_MS / 1000);
    console.log('[BackgroundPause] активен (grace = ' + sec + ' сек). В фоне Firestore будет отключаться, экономия Read Ops.');
  }

  if (getDb()) {
    init();
  } else {
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      if (getDb()) { clearInterval(poll); init(); return; }
      if (tries > 150) { clearInterval(poll); }
    }, 200);
  }

  window.KerbenBackgroundPause = {
    isPaused: function () { return networkDisabled; },
    pauseNow: disableNet,
    resumeNow: cancelDisableAndResume,
    getGraceMs: function () { return GRACE_MS; }
  };
})();
