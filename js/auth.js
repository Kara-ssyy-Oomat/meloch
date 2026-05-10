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
  // Флаг: идёт ли сейчас явный логин (админ через email/password).
  // Пока true — onAuthStateChanged НЕ должен делать signInAnonymously,
  // иначе создадутся «лишние» анонимные пользователи и в Firebase Auth
  // быстро накопится мусор.
  let _signInInProgress = false;
  // Флаг: уже логирован успешный вход (чтобы не спамить одинаковыми
  // строками при повторных onAuthStateChanged для того же user).
  let _lastLoggedUid = null;

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

      firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
          if (_lastLoggedUid !== user.uid) {
            console.log('[Kerben Auth] вошёл как',
                        user.isAnonymous ? 'аноним' : user.email,
                        'uid:', user.uid.substring(0, 8) + '...');
            _lastLoggedUid = user.uid;
          }
          _markAuthReady();
        } else if (!_signInInProgress) {
          // Нет user и сейчас не идёт другой логин → анонимный вход
          _signInInProgress = true;
          firebase.auth().signInAnonymously()
            .then(function () {
              console.log('[Kerben Auth] анонимный вход успешно');
            })
            .catch(function (err) {
              console.warn('[Kerben Auth] анонимный вход не удался:', err && err.message);
              _markAuthReady();
            })
            .finally(function () {
              _signInInProgress = false;
            });
        }
      });
    }

    return global.__kerbenAuthReady;
  };

  // Войти как админ через email/password.
  // Перед вызовом — Firebase Console: Authentication → Add user (email).
  global.kerbenSignInAsAdmin = async function (email, password) {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
      throw new Error('Firebase Auth SDK не загружен');
    }
    // Если уже вошли как этот же админ — не дёргаем сеть лишний раз.
    try {
      const cur = firebase.auth().currentUser;
      if (cur && !cur.isAnonymous && cur.email
          && cur.email.toLowerCase() === String(email).toLowerCase()) {
        return cur;
      }
    } catch (e) {}
    // Блокируем гонку: пока идёт админ-логин — onAuthStateChanged
    // НЕ должен запускать signInAnonymously() при промежуточном null.
    _signInInProgress = true;
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      console.log('[Kerben Auth] админ вошёл:', cred.user.email);
      return cred.user;
    } catch (err) {
      console.error('[Kerben Auth] ошибка входа админа:', err && err.message);
      throw err;
    } finally {
      _signInInProgress = false;
    }
  };

  // Выход из Firebase Auth (например, после "Выйти" админа)
  global.kerbenSignOut = async function () {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return;
    try {
      await firebase.auth().signOut();
      // НЕ делаем signInAnonymously явно — onAuthStateChanged сам
      // вызовет его (см. kerbenEnsureSignedIn).
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
