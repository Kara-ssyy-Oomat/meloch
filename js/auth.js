// =====================================================================
// КЕРБЕН — Firebase Authentication (анонимный + админ через email)
// =====================================================================
// ЦЕЛЬ:
//   1) Каждый посетитель сайта получает Firebase auth.uid (анонимно)
//      → можно закрыть Firestore Rules через `request.auth != null` и
//      резко уменьшить «утечку» чтений от внешних скриптов / ботов.
//   2) Админ дополнительно входит через email+password — в правилах
//      проверяем `request.auth.token.email`. Только админ сможет
//      читать чувствительные коллекции (expenses, customers, etc).
//
// ПЕРЕД ДЕПЛОЕМ нужно один раз сделать в Firebase Console:
//   • Authentication → Sign-in method → Anonymous → Enable
//   • Authentication → Sign-in method → Email/Password → Enable
//   • Authentication → Users → Add user → создать админа с email,
//     указанным в ADMIN_AUTH_EMAIL ниже.
// =====================================================================

(function (global) {
  // Email админа в Firebase Auth. Поменяйте при необходимости.
  // ВАЖНО: тот же email должен быть в firestore.rules (функция isAdminEmail).
  global.KERBEN_ADMIN_AUTH_EMAIL = 'admin@kerben.local';

  // Промис, который резолвится когда auth готов
  global.__kerbenAuthReady = null;
  let _authReadyResolve = null;

  function _markAuthReady() {
    if (_authReadyResolve) {
      _authReadyResolve(firebase.auth().currentUser);
      _authReadyResolve = null;
    }
  }

  // Гарантирует, что в Firebase auth есть какой-то пользователь.
  // Если уже залогинен — ничего не делает. Иначе — анонимный вход.
  global.kerbenEnsureSignedIn = function () {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
      console.warn('[Kerben Auth] firebase-auth SDK не загружен');
      return Promise.resolve(null);
    }

    if (!global.__kerbenAuthReady) {
      global.__kerbenAuthReady = new Promise(function (resolve) {
        _authReadyResolve = resolve;
      });

      // Подписываемся на изменения auth state — резолвим промис, как только
      // у нас появляется любой user (либо после signInAnonymously)
      firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
          console.log('[Kerben Auth] вошёл как', user.isAnonymous ? 'аноним' : user.email,
                      'uid:', user.uid.substring(0, 8) + '...');
          _markAuthReady();
        } else {
          // Нет user — пробуем анонимный вход
          firebase.auth().signInAnonymously()
            .then(function (cred) {
              console.log('[Kerben Auth] анонимный вход успешно');
              _markAuthReady();
            })
            .catch(function (err) {
              console.warn('[Kerben Auth] анонимный вход не удался:', err && err.message);
              // НЕ блокируем сайт — резолвим без user
              _markAuthReady();
            });
        }
      });
    }

    return global.__kerbenAuthReady;
  };

  // Войти как админ через email/password (поверх анонимного входа).
  // Перед вызовом — Firebase Console: Authentication → Add user (email).
  global.kerbenSignInAsAdmin = async function (email, password) {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
      throw new Error('Firebase Auth SDK не загружен');
    }
    try {
      // Сначала выходим из анонимного аккаунта, иначе SDK не даст переключиться
      const cur = firebase.auth().currentUser;
      if (cur && cur.isAnonymous) {
        try { await firebase.auth().signOut(); } catch (e) {}
      }
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      console.log('[Kerben Auth] админ вошёл:', cred.user.email);
      return cred.user;
    } catch (err) {
      console.error('[Kerben Auth] ошибка входа админа:', err && err.message);
      throw err;
    }
  };

  // Выход из Firebase Auth (например, после "Выйти" админа)
  global.kerbenSignOut = async function () {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return;
    try {
      await firebase.auth().signOut();
      // После выхода — восстанавливаем анонимный сеанс, чтобы клиент мог
      // дальше пользоваться сайтом (читать товары и т.п.)
      await firebase.auth().signInAnonymously();
    } catch (e) {
      console.warn('[Kerben Auth] signOut error:', e && e.message);
    }
  };

  // Проверить, что текущий user — это админ (по email из Firebase Auth)
  global.kerbenIsFirebaseAdmin = function () {
    try {
      const u = firebase.auth().currentUser;
      if (!u || !u.email) return false;
      return u.email.toLowerCase() === String(global.KERBEN_ADMIN_AUTH_EMAIL || '').toLowerCase();
    } catch (e) {
      return false;
    }
  };

  // АВТО-СТАРТ: как только Firebase инициализирован, запускаем анонимный вход.
  // Так на страницах без firebase-config.js (например, admin-rounding.html,
  // которая инициализирует Firebase прямо в HTML) логин тоже включается.
  function _autoStart() {
    try {
      if (typeof firebase !== 'undefined'
          && firebase.apps && firebase.apps.length > 0
          && typeof firebase.auth === 'function') {
        global.kerbenEnsureSignedIn();
        return;
      }
    } catch (e) {}
    setTimeout(_autoStart, 250);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _autoStart);
    } else {
      _autoStart();
    }
  }
})(typeof window !== 'undefined' ? window : this);
