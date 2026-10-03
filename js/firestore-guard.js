// ===================================================================
// КЕРБЕН B2B Market — Firestore Guard (лечение упавшего клиента SDK)
// -------------------------------------------------------------------
// Клиент Firestore 9.x умеет падать с ошибкой
//   «FIRESTORE (9.22.2) INTERNAL ASSERTION FAILED: Unexpected state».
//
// Это не разовый сбой запроса. Внутри SDK все обращения к базе идут
// через одну очередь (AsyncQueue), и она устроена так:
//     this.tail = this.tail.then(() => operation());
// После падения `tail` остаётся rejected-промисом, поэтому КАЖДЫЙ
// следующий .get()/.onSnapshot() либо отваливается сразу, либо — если
// очередь успела уйти в shutdown — возвращает промис, который НИКОГДА
// не резолвится. Снаружи это выглядит как «иногда сайт открывается без
// товаров»: загрузка упирается в таймаут, повторы упираются в него же,
// витрина остаётся пустой до перезагрузки страницы.
//
// Починить сломанный клиент нечем — ни enableNetwork(), ни повторный
// запрос не помогают. Его можно только выбросить и поднять новый
// (kerbenRebuildFirestore в js/firebase-config.js).
//
// Этот модуль:
//   1) ловит падение по всем трём каналам, которыми оно до нас доходит —
//      console.error (SDK логирует перед тем, как бросить), window.onerror
//      и unhandledrejection;
//   2) глушит поток одинаковых сообщений — их бывает больше тысячи,
//      и сама печать такого количества стеков подвешивает вкладку;
//   3) пересоздаёт клиент и сообщает об этом событием
//      `kerben-firestore-rebuilt`, чтобы загрузчик товаров повторил
//      запрос уже на живом клиенте.
//
// Подключать СРАЗУ после firebase-config.js.
// ===================================================================

(function () {
  'use strict';

  var ASSERT_RE = /INTERNAL ASSERTION FAILED/;

  // Больше трёх раз подряд — это уже не разовый сбой SDK, а что-то
  // системное (битый IndexedDB, расширение браузера, обрезанный прокси).
  // Дальше пересоздавать клиент бессмысленно, пусть работает кэш.
  var MAX_REBUILDS = 3;
  var COOLDOWN_MS = 4000;
  var QUIET_AFTER_REBUILD_MS = 3000;

  // Сколько сообщений пропустить в консоль, прежде чем глушить остальные.
  var LOG_BUDGET = 3;

  var crashes = 0;
  var rebuilds = 0;
  var lastRebuildAt = 0;
  var pending = null;
  var muted = 0;

  var nativeError = (console && console.error)
    ? console.error.bind(console)
    : function () {};

  function textOf(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value.message === 'string') return value.message;
    try { return String(value); } catch (e) { return ''; }
  }

  function looksLikeAssertion(value) {
    return ASSERT_RE.test(textOf(value));
  }

  // ---------- 1. Консоль ----------
  // SDK печатает ошибку сам через console.error и только потом бросает её.
  // Это самый надёжный канал: когда запрос падает синхронно (а он падает
  // синхронно — проверка «очередь уже сломана» стоит в самом начале
  // enqueue), до window.onerror и unhandledrejection дело не доходит, их
  // перехватывает try/catch вызывающего кода. А console.error срабатывает
  // всегда.
  //
  // Заодно глушим поток: оставляем первые несколько сообщений, по ним
  // видно, что произошло, остальные сворачиваем в счётчик.
  if (console && typeof console.error === 'function') {
    console.error = function () {
      var hit = false;
      for (var i = 0; i < arguments.length; i++) {
        if (looksLikeAssertion(arguments[i])) { hit = true; break; }
      }
      if (!hit) return nativeError.apply(null, arguments);

      var quiet = crashes >= LOG_BUDGET;
      onCrash();
      if (quiet) { muted++; return; }
      return nativeError.apply(null, arguments);
    };
  }

  function flushMuted() {
    if (muted > 0) {
      nativeError('[FirestoreGuard] скрыто повторов той же ошибки: ' + muted);
      muted = 0;
    }
  }

  // ---------- 2. Перехват падения ----------
  window.addEventListener('unhandledrejection', function (event) {
    if (!looksLikeAssertion(event && event.reason)) return;
    // preventDefault убирает «Uncaught (in promise)» — иначе браузер
    // печатает каждое падение сам, в обход нашей обёртки над console.
    try { event.preventDefault(); } catch (e) {}
    onCrash();
  });

  window.addEventListener('error', function (event) {
    if (!event) return;
    if (!looksLikeAssertion(event.error) && !looksLikeAssertion(event.message)) return;
    try { event.preventDefault(); } catch (e) {}
    onCrash();
  });

  function onCrash() {
    crashes++;
    // Сразу после замены клиента ещё какое-то время сыплются ошибки от
    // старого: его внутренние таймеры успевают тикнуть по мёртвой очереди.
    // Если считать их падениями нового клиента, мы будем пересоздавать
    // вполне исправный и зря потратим попытки.
    if (lastRebuildAt && (Date.now() - lastRebuildAt) < QUIET_AFTER_REBUILD_MS) return;
    window.KERBEN_FIRESTORE_BROKEN = true;
    if (crashes === 1) {
      nativeError('[FirestoreGuard] клиент Firestore развалился ' +
        '(INTERNAL ASSERTION FAILED) — поднимаю новый');
    }
    recover();
  }

  // ---------- 3. Пересоздание клиента ----------
  // terminate() в compat-сборке сначала снимает сервис с приложения и только
  // потом гасит очередь, поэтому следующий firebase.firestore() отдаёт уже
  // чистый клиент. Приложение то же самое — значит анонимная или админская
  // сессия остаётся на месте и правила Firestore не начнут отвечать
  // permission-denied. Persistence на новом клиенте не поднимаем: IndexedDB —
  // главный источник таких падений.
  //
  // Страницы, которые держат клиент в своей переменной, либо подменяют эту
  // функцию (так делает js/firebase-config.js), либо подхватывают новый
  // экземпляр по событию `kerben-firestore-rebuilt`.
  function defaultRebuild() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      return Promise.resolve(false);
    }
    try {
      var old = firebase.firestore();
      if (old && typeof old.terminate === 'function') {
        var closing = old.terminate();
        if (closing && typeof closing.catch === 'function') closing.catch(function () {});
      }
    } catch (e) {
      // terminate() на сломанной очереди бросает синхронно — не важно,
      // сервис с приложения он снимает до этого.
    }
    try {
      firebase.firestore();
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function recover() {
    if (pending) return pending;
    if (!window.KERBEN_FIRESTORE_BROKEN) return Promise.resolve(true);
    if (rebuilds >= MAX_REBUILDS) {
      flushMuted();
      return Promise.resolve(false);
    }

    rebuilds++;
    var wait = Math.max(0, COOLDOWN_MS - (Date.now() - lastRebuildAt));

    var job = new Promise(function (resolve) { setTimeout(resolve, wait); })
      .then(function () {
        lastRebuildAt = Date.now();
        return (typeof window.kerbenRebuildFirestore === 'function')
          ? window.kerbenRebuildFirestore()
          : defaultRebuild();
      })
      .then(function (ok) {
        if (!ok) return false;
        window.KERBEN_FIRESTORE_BROKEN = false;
        flushMuted();
        try {
          window.dispatchEvent(new CustomEvent('kerben-firestore-rebuilt'));
        } catch (e) {
          // Старые браузеры без конструктора CustomEvent
          try {
            var ev = document.createEvent('Event');
            ev.initEvent('kerben-firestore-rebuilt', false, false);
            window.dispatchEvent(ev);
          } catch (e2) {}
        }
        return true;
      }, function () { return false; });

    var clear = function (result) { pending = null; return result; };
    job.then(clear, clear);

    pending = job;
    return job;
  }

  window.KerbenFirestoreGuard = {
    isBroken: function () { return !!window.KERBEN_FIRESTORE_BROKEN; },
    crashCount: function () { return crashes; },
    rebuildCount: function () { return rebuilds; },
    // Для кода, который поймал ошибку своим try/catch и узнал её по тексту.
    // Дублирует перехват через console.error — на случай, если очередная
    // версия SDK начнёт бросать молча.
    reportCrash: function (err) {
      if (looksLikeAssertion(err)) onCrash();
    },
    // Вызывать перед повторной попыткой запроса. Клиент жив — вернёт true
    // сразу; клиент упал — дождётся нового и вернёт true; чинить больше
    // нечем — вернёт false (вызывающий код должен уйти в кэш).
    ensureUsable: function () {
      if (!window.KERBEN_FIRESTORE_BROKEN) return Promise.resolve(true);
      return recover();
    }
  };
})();
