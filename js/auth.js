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

  // Флаг: уже предупредили про открытие с file://
  let _fileProtocolWarned = false;

  function _kerbenIsFileOrigin() {
    try {
      return typeof location !== 'undefined' && location.protocol === 'file:';
    } catch (e) {
      return false;
    }
  }

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
          // Открыли HTML как file:// — у запросов нет HTTP Referer, Firebase
          // отклоняет signUp/signIn с кодом requests-from-referer-null-are-blocked.
          // Анонимный вход не выполняем (не спамим 403 в консоли).
          if (_kerbenIsFileOrigin()) {
            if (!_fileProtocolWarned) {
              _fileProtocolWarned = true;
              console.warn('[Kerben Auth] Сайт открыт через file:// — анонимный Firebase Auth недоступен. ' +
                'Для проверки на компьютере запустите локальный сервер и откройте http://localhost:..., например: ' +
                'python3 -m http.server 8080');
            }
            _markAuthReady();
          } else {
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
        }
      });
    }

    return global.__kerbenAuthReady;
  };

  // Войти как админ через email/password.
  // ПОВЕДЕНИЕ:
  //   1) signInWithEmailAndPassword — обычный вход.
  //   2) Если user-not-found → createUserWithEmailAndPassword (само-инициация
  //      при первом входе админа: не нужно вручную создавать аккаунт
  //      в Firebase Console).
  //   3) Если wrong-password — кидаем понятную ошибку с подсказкой, что
  //      нужно удалить admin@kerben.local в Firebase Console и войти ещё раз
  //      (сайт пересоздаст с правильным паролем).
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
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
        console.log('[Kerben Auth] админ вошёл:', cred.user.email);
        return cred.user;
      } catch (err) {
        const code = err && err.code ? String(err.code) : '';
        // Юзера ещё нет — создаём (само-инициация при первом входе админа).
        if (code === 'auth/user-not-found') {
          try {
            const created = await firebase.auth().createUserWithEmailAndPassword(email, password);
            console.log('[Kerben Auth] админ создан и вошёл:', created.user.email);
            return created.user;
          } catch (createErr) {
            const cCode = createErr && createErr.code ? String(createErr.code) : '';
            // Email уже занят (гонка): пробуем войти ещё раз.
            if (cCode === 'auth/email-already-in-use') {
              const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
              return cred.user;
            }
            console.error('[Kerben Auth] не удалось создать админа:', createErr && createErr.message);
            throw createErr;
          }
        }
        // Wrong password — кидаем ошибку с понятной подсказкой
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential'
            || code === 'auth/invalid-login-credentials') {
          const e = new Error(
            'Пароль не совпадает с тем, что в Firebase Auth. '
            + 'Откройте Firebase Console → Authentication → Users, '
            + 'удалите admin@kerben.local и войдите на сайте ещё раз — '
            + 'аккаунт пересоздастся автоматически с правильным паролем.'
          );
          e.code = code;
          throw e;
        }
        console.error('[Kerben Auth] ошибка входа админа:', err && err.message);
        throw err;
      }
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

  // Ждать пока завершится анонимный/админский логин (в Firebase Auth
  // должен появиться currentUser). Используется ПЕРЕД запросами к
  // Firestore, чтобы избежать race condition: запросы не должны
  // уходить раньше чем `request.auth` появится у Firebase. Без этого
  // правила вида `request.auth != null` блокировали бы первый запрос
  // и сайт давал бы permission-denied при быстром открытии.
  //
  // Возвращает промис, который резолвится за <500мс (обычно 50-200мс).
  // Если SDK не загружен — резолвится сразу.
  global.kerbenWaitForAuth = function () {
    try {
      if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
        return Promise.resolve();
      }
      // Если уже есть user — мгновенно возвращаемся.
      const cur = firebase.auth().currentUser;
      if (cur) return Promise.resolve(cur);
      // Запускаем процесс входа (если ещё не запущен) и ждём.
      return (global.kerbenEnsureSignedIn ? global.kerbenEnsureSignedIn() : Promise.resolve())
        // Жёсткий таймаут 3 сек — если что-то пошло не так, не будем
        // зависать. Запрос пойдёт без auth (и упадёт с permission-denied,
        // но это лучше чем бесконечная загрузка).
        .then(function (u) { return u; })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve();
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

  // АВТО-СТАРТ: запускаем НЕМЕДЛЕННО (не дожидаясь DOMContentLoaded),
  // чтобы успеть запустить signInAnonymously() ДО первого Firestore-запроса
  // от другого кода. Так у Firebase SDK будет «в очереди» auth-токен,
  // и запросы уйдут уже авторизованными. Это критично когда rules
  // требуют `request.auth != null`.
  let _autoStartAttempts = 0;
  function _autoStart() {
    _autoStartAttempts++;
    try {
      if (typeof firebase !== 'undefined'
          && firebase.apps && firebase.apps.length > 0
          && typeof firebase.auth === 'function') {
        global.kerbenEnsureSignedIn();
        return;
      }
    } catch (e) {}
    // Первые 50 попыток — каждые 30мс (быстро). Дальше — реже.
    setTimeout(_autoStart, _autoStartAttempts < 50 ? 30 : 250);
  }
  // Запускаем СРАЗУ, не ждём DOMContentLoaded — auth должен стартовать
  // как можно раньше.
  _autoStart();
})(typeof window !== 'undefined' ? window : this);
