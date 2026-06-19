// =====================================================================
// КЕРБЕН — Автономное восстановление АДМИН-сессии Firebase Auth
// =====================================================================
// ПРОБЛЕМА: Safari/iOS (и иногда десктоп-браузеры) забывают сессию
// Firebase Auth через несколько часов. После этого Firestore Rules
// отклоняют админ-операции (permission-denied), и сайт ведёт себя так,
// будто пользователь больше не админ — приходится снова заходить через
// профиль с паролем.
//
// РЕШЕНИЕ: при входе админа js/customer-auth.js сохраняет пароль в
// localStorage в обфусцированном виде (ключ kerbenAdminCreds_v1, TTL 30 дней).
// Этот модуль ПРИ КАЖДОЙ ЗАГРУЗКЕ админ-страницы тихо проверяет:
//   1) Помечен ли пользователь админом локально (customerData.isAdmin)?
//   2) Активна ли сессия admin@kerben.local в Firebase Auth?
// Если (1)=да, (2)=нет — молча логинит обратно через сохранённый пароль.
// Если пользователь не админ — модуль вообще ничего не делает.
//
// Подключается одной строкой <script src="js/admin-reauth.js"></script>
// после firebase SDK и js/auth.js на каждой админ-странице.
// =====================================================================

(function (global) {
  // Чтобы не дублироваться, если файл подключён повторно
  if (global.__kerbenAdminReauthLoaded) return;
  global.__kerbenAdminReauthLoaded = true;

  // ----------- Константы и данные админа -----------
  // Должны совпадать с js/customer-auth.js и profile.html
  var ADMIN_PHONE = '0559009860';
  var ADMIN_PASSWORD_HASH =
    '974f80606b985a1f8428d58d3eb6df3ba98277734d7bed5263d00256ece33f93';
  var ADMIN_CREDS_KEY = 'kerbenAdminCreds_v1';
  var ADMIN_CREDS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
  var OBFUSC_KEY = 'kerben_admin_local_obfusc_2026';

  // ----------- Утилиты -----------
  function normalizePhone(phone) {
    if (!phone) return '';
    var n = String(phone).replace(/[^\d+]/g, '');
    if (n.indexOf('0') === 0) n = '+996' + n.substring(1);
    if (n.indexOf('+') !== 0) {
      n = (n.indexOf('996') === 0 ? '+' : '+996') + n;
    }
    return n;
  }

  function deobfuscate(b64) {
    try {
      var text = decodeURIComponent(escape(atob(b64)));
      var out = '';
      for (var i = 0; i < text.length; i++) {
        out += String.fromCharCode(
          text.charCodeAt(i) ^ OBFUSC_KEY.charCodeAt(i % OBFUSC_KEY.length)
        );
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  function getStoredAdminPassword() {
    try {
      var raw = localStorage.getItem(ADMIN_CREDS_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.p || !data.ts) return null;
      if (Date.now() - data.ts > ADMIN_CREDS_TTL_MS) {
        localStorage.removeItem(ADMIN_CREDS_KEY);
        return null;
      }
      return deobfuscate(data.p);
    } catch (e) {
      return null;
    }
  }

  function isAdminLocally() {
    try {
      var saved =
        localStorage.getItem('customerData') ||
        localStorage.getItem('currentCustomer'); // на случай старого ключа
      if (!saved) return false;
      var data = JSON.parse(saved);
      if (!data || !data.isAdmin) return false;
      return normalizePhone(data.phone || '') === normalizePhone(ADMIN_PHONE);
    } catch (e) {
      return false;
    }
  }

  function isFirebaseAdminAlready() {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) return false;
      var u = firebase.auth().currentUser;
      var adminEmail = (
        global.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local'
      ).toLowerCase();
      return !!(u && u.email && u.email.toLowerCase() === adminEmail);
    } catch (e) {
      return false;
    }
  }

  // Если в текущей загрузке страницы сохранённый пароль уже не подошёл —
  // больше не пытаемся (бессмысленно дёргать сеть с одним и тем же паролем).
  var _badPasswordThisSession = false;
  // Защита от гонки: если уже идёт попытка входа — следующие вызовы ждут её.
  var _restorePromise = null;

  // Очистить сохранённый пароль — например, если он больше не подходит
  // (Firebase Console пересоздали аккаунт админа с другим паролем).
  function clearStoredAdminCreds() {
    try { localStorage.removeItem(ADMIN_CREDS_KEY); } catch (e) {}
  }
  global.kerbenClearStoredAdminCreds =
    global.kerbenClearStoredAdminCreds || clearStoredAdminCreds;

  // Определить, что ошибка signIn — именно «не подходит пароль» (а не
  // временная сетевая проблема). В этом случае стоит очистить кэш пароля.
  function isWrongPasswordError(err) {
    if (!err) return false;
    var code = err.code || '';
    return (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials' ||
      code === 'auth/user-not-found' ||
      code === 'auth/user-disabled'
    );
  }

  // ----------- Основная функция: тихое восстановление -----------
  // Возвращает Promise<boolean>: true — админ-сессия активна, false — нет.
  function tryRestoreAdminSession() {
    // Если уже идёт восстановление — отдаём тот же промис, не запускаем
    // параллельно (иначе будет 2-3 ненужных запроса signIn).
    if (_restorePromise) return _restorePromise;

    _restorePromise = new Promise(function (resolve) {
      function finish(ok) {
        _restorePromise = null;
        resolve(ok);
      }

      // Firebase ещё не подгружен?
      if (typeof firebase === 'undefined' || !firebase.auth) {
        return finish(false);
      }

      // Пользователь не админ локально — ничего не делаем
      if (!isAdminLocally()) return finish(false);

      // Уже залогинен как админ — всё ок
      if (isFirebaseAdminAlready()) return finish(true);

      // В этой сессии страницы пароль уже оказался неподходящим —
      // не пытаемся снова до перезагрузки.
      if (_badPasswordThisSession) return finish(false);

      // Сессия в Firebase Auth ещё может догрузиться (asynchronously),
      // подождём её появления чуть-чуть.
      var waitMs = 0;
      var step = 100;
      var max = 2000;

      function check() {
        if (isFirebaseAdminAlready()) return finish(true);
        waitMs += step;
        if (waitMs >= max) return tryStoredPassword();
        setTimeout(check, step);
      }

      function onSignInError(err) {
        var wrong = isWrongPasswordError(err);
        console.warn(
          '[Admin Reauth] не удалось восстановить:',
          (err && err.message) || err
        );
        // Если пароль больше не подходит — очищаем кэш, чтобы не долбить
        // Firebase бессмысленными запросами. Админ войдёт заново вручную
        // в профиле, и кэш пересоздастся с актуальным паролем.
        if (wrong) {
          _badPasswordThisSession = true;
          clearStoredAdminCreds();
          console.warn(
            '[Admin Reauth] сохранённый пароль больше не подходит — кэш очищен'
          );
        }
        finish(false);
      }

      function tryStoredPassword() {
        var password = getStoredAdminPassword();
        if (!password) return finish(false);

        var adminEmail =
          global.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local';

        // Используем kerbenSignInAsAdmin (из js/auth.js) если доступна
        if (typeof global.kerbenSignInAsAdmin === 'function') {
          global
            .kerbenSignInAsAdmin(adminEmail, password)
            .then(function () {
              console.log('[Admin Reauth] сессия Firebase Auth восстановлена');
              finish(true);
            })
            .catch(onSignInError);
          return;
        }

        // Fallback: напрямую через firebase.auth()
        firebase
          .auth()
          .signInWithEmailAndPassword(adminEmail, password)
          .then(function () {
            console.log('[Admin Reauth] сессия Firebase Auth восстановлена (fallback)');
            finish(true);
          })
          .catch(onSignInError);
      }

      check();
    });

    return _restorePromise;
  }

  // ----------- Экспорт глобально -----------
  // Если customer-auth.js уже определил kerbenReAuthAdminIfNeeded — не
  // перезаписываем. Иначе ставим свою (более простую, без диалогов).
  if (typeof global.kerbenReAuthAdminIfNeeded !== 'function') {
    global.kerbenReAuthAdminIfNeeded = tryRestoreAdminSession;
  }
  // Отдельная функция, которую можно дёрнуть напрямую
  global.kerbenAdminSilentReauth = tryRestoreAdminSession;

  // ----------- Автозапуск -----------
  // 1) При загрузке страницы — пытаемся восстановить молча.
  // ВАЖНО: сначала ждём:
  //  (a) пока поднимется БАЗОВАЯ сессия Firebase Auth (kerbenWaitForAuth),
  //  (b) достаточно времени, чтобы основная загрузка страницы (товары,
  //      заказы) успела пройти на анонимной сессии.
  // Иначе наш signInAsAdmin разрушит анонимного юзера в самый неподходящий
  // момент — параллельные Firestore-запросы словят permission-denied.
  function runOnLoad() {
    function go() {
      tryRestoreAdminSession().catch(function () {});
    }
    function safeGo() {
      if (typeof global.kerbenWaitForAuth === 'function') {
        global.kerbenWaitForAuth().then(go, go);
      } else {
        go();
      }
    }
    // 5 секунд — этого хватает, чтобы loadProducts успел отработать на
    // анонимной сессии. После этого спокойно переключаемся на админа.
    setTimeout(safeGo, 5000);
    // Повтор через 15 сек — на случай если первая попытка была слишком ранней
    setTimeout(function () {
      if (!isFirebaseAdminAlready() && isAdminLocally()) {
        tryRestoreAdminSession().catch(function () {});
      }
    }, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runOnLoad);
  } else {
    runOnLoad();
  }

  // 2) Когда вкладка снова в фокусе (после блокировки телефона, переключения
  //    приложений) — проверяем не потерялась ли сессия.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (!isAdminLocally()) return;
    if (isFirebaseAdminAlready()) return;
    tryRestoreAdminSession().catch(function () {});
  });

  // 3) Каждые 30 минут — превентивно перепроверяем сессию (Safari может
  //    тихо обнулить токен между визитами в админку).
  setInterval(function () {
    if (!isAdminLocally()) return;
    if (isFirebaseAdminAlready()) return;
    tryRestoreAdminSession().catch(function () {});
  }, 30 * 60 * 1000);
})(typeof window !== 'undefined' ? window : this);
