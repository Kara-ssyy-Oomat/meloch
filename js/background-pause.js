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

  // Внутри iframe этот модуль не работает. profile.html / cart.html /
  // chat.html открываются как iframe поверх index.html, и каждый из них
  // поднимает свой клиент Firestore на общем IndexedDB. Если такой клиент
  // получал pagehide (навигация внутри iframe) — он звал disableNetwork(),
  // а при multi-tab persistence это роняло сеть и для главной страницы:
  // запрос товаров вставал и витрина оставалась пустой. Сетью управляет
  // только top-level документ.
  try {
    if (window.parent !== window && cfg.allowInIframe !== true) {
      window.KerbenBackgroundPause = {
        isPaused: function () { return false; },
        pauseNow: function () {},
        resumeNow: function () {},
        getGraceMs: function () { return 0; }
      };
      return;
    }
  } catch (e) {}

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

  // Переключения сети нельзя запускать внахлёст. Быстрая череда
  // visibilitychange/focus/blur (переключили вкладку туда-обратно) давала
  // одновременные disableNetwork() и enableNetwork(), а встречные вызовы —
  // известный способ уронить очередь внутри SDK с «INTERNAL ASSERTION
  // FAILED». Поэтому выстраиваем их в одну цепочку, по одному за раз.
  //
  // Каждый вызов ещё и ограничен по времени: у развалившегося клиента
  // enableNetwork() не завершается никогда и запер бы цепочку навсегда.
  var netChain = Promise.resolve();
  var NET_CALL_TIMEOUT_MS = 5000;

  function queueNet(run) {
    netChain = netChain.then(function () {
      return new Promise(function (resolve) {
        var done = false;
        var finish = function () { if (!done) { done = true; resolve(); } };
        setTimeout(finish, NET_CALL_TIMEOUT_MS);
        try {
          var p = run();
          if (p && typeof p.then === 'function') p.then(finish, finish);
          else finish();
        } catch (e) {
          finish();
        }
      });
    });
    return netChain;
  }

  function disableNet() {
    if (!getDb() || networkDisabled) return;
    networkDisabled = true;
    queueNet(function () {
      // Клиент берём в момент выполнения, а не постановки в очередь:
      // пока вызов ждал своей очереди, сторож мог заменить экземпляр.
      var db = getDb();
      if (!db) { networkDisabled = false; return; }
      return db.disableNetwork()
        .then(function () {
          console.log('[BackgroundPause] Firestore выключен (вкладка в фоне)');
        })
        .catch(function (err) {
          networkDisabled = false;
          console.warn('[BackgroundPause] disableNetwork error:', err);
        });
    });
  }

  function enableNet() {
    if (!getDb() || !networkDisabled) return;
    networkDisabled = false;
    queueNet(function () {
      var db = getDb();
      if (!db) { networkDisabled = true; return; }
      return db.enableNetwork()
        .then(function () {
          console.log('[BackgroundPause] Firestore включён (вкладка активна)');
        })
        .catch(function (err) {
          // Сеть так и осталась выключенной — возвращаем флаг, иначе
          // следующий enableNet() решит, что всё уже поднято, и не повторит.
          networkDisabled = true;
          console.warn('[BackgroundPause] enableNetwork error:', err);
        });
    });
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

  // Новый клиент Firestore (js/firestore-guard.js) всегда поднимается
  // с включённой сетью. Без сброса флага мы считали бы её выключенной и
  // при уходе вкладки в фон не стали бы разрывать соединение.
  window.addEventListener('kerben-firestore-rebuilt', function () {
    networkDisabled = false;
    if (document.hidden) scheduleDisable();
  });

  window.KerbenBackgroundPause = {
    isPaused: function () { return networkDisabled; },
    pauseNow: disableNet,
    resumeNow: cancelDisableAndResume,
    getGraceMs: function () { return GRACE_MS; }
  };
})();
