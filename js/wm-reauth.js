// =====================================================================
// КЕРБЕН — сессия управляющего складом (как admin-reauth.js у админа)
// =====================================================================
// После первой подачи заявки / входа пароль сохраняется в localStorage
// (обфусцированный, TTL 30 дней). При следующем открытии
// warehouse-manager.html сессия восстанавливается тихо — без формы входа.
//
// ВАЖНО: восстанавливать Firebase Auth (wm_...@kerben-warehouse.local)
// можно ТОЛЬКО на warehouse-manager.html. На витрине магазина нужна
// анонимная/клиентская сессия, иначе каталог сломается.
// =====================================================================

(function (global) {
  if (global.__kerbenWmReauthLoaded) return;
  global.__kerbenWmReauthLoaded = true;

  var WM_SESSION_KEY = 'kerbenWmSession_v1';
  var WM_CREDS_KEY = 'kerbenWmCreds_v1';
  var WM_CREDS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var OBFUSC_KEY = 'kerben_wm_local_obfusc_2026';

  // ------------------------------------------------------------------
  // Отдельный экземпляр Firebase для склада.
  // Firebase Auth держит ОДНУ сессию на экземпляр приложения и делит её
  // между всеми вкладками домена. Из-за этого вход под wm_… выбивал
  // admin@kerben.local в соседней вкладке админки, admin-reauth.js возвращал
  // админа обратно, склад снова забирал сессию — вкладки отбирали её по кругу,
  // и Firestore отклонял запись у той, что проиграла последней.
  // Именованное приложение хранит сессию под своим ключом, поэтому склад
  // и админка больше не пересекаются.
  // ------------------------------------------------------------------
  var WM_APP_NAME = 'kerben-wm';

  function getWmApp() {
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp !== 'function') return null;
    try {
      for (var i = 0; i < firebase.apps.length; i++) {
        if (firebase.apps[i] && firebase.apps[i].name === WM_APP_NAME) return firebase.apps[i];
      }
    } catch (e) {}
    var base = null;
    try { base = firebase.apps[0] || null; } catch (e) {}
    if (!base || !base.options) return null;
    try {
      return firebase.initializeApp(base.options, WM_APP_NAME);
    } catch (e) {
      return null;
    }
  }

  // Возвращают auth/firestore склада. null — если Firebase не поднялся;
  // вызывающий код в этом случае откатывается на приложение по умолчанию.
  function wmAuth() {
    var app = getWmApp();
    try { return app ? app.auth() : null; } catch (e) { return null; }
  }

  function wmDb() {
    var app = getWmApp();
    try { return app ? app.firestore() : null; } catch (e) { return null; }
  }

  function obfuscate(text) {
    var x = '';
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      x += String.fromCharCode(s.charCodeAt(i) ^ OBFUSC_KEY.charCodeAt(i % OBFUSC_KEY.length));
    }
    try { return btoa(unescape(encodeURIComponent(x))); } catch (e) { return ''; }
  }

  function deobfuscate(b64) {
    try {
      var text = decodeURIComponent(escape(atob(b64)));
      var out = '';
      for (var i = 0; i < text.length; i++) {
        out += String.fromCharCode(text.charCodeAt(i) ^ OBFUSC_KEY.charCodeAt(i % OBFUSC_KEY.length));
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(WM_SESSION_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.email) return null;
      return data;
    } catch (e) { return null; }
  }

  function saveSession(patch) {
    try {
      var prev = getSession() || {};
      var next = {
        email: patch.email || prev.email || '',
        phone: patch.phone || prev.phone || '',
        name: patch.name != null ? patch.name : (prev.name || ''),
        status: patch.status != null ? patch.status : (prev.status || 'pending'),
        uid: patch.uid || prev.uid || '',
        ts: Date.now()
      };
      localStorage.setItem(WM_SESSION_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function saveCreds(email, password, phone) {
    if (!email || !password) return;
    try {
      localStorage.setItem(WM_CREDS_KEY, JSON.stringify({
        e: email,
        p: obfuscate(password),
        ph: phone || '',
        ts: Date.now()
      }));
    } catch (e) {}
  }

  function getStoredPassword() {
    try {
      var raw = localStorage.getItem(WM_CREDS_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.p || !data.ts) return null;
      if (Date.now() - data.ts > WM_CREDS_TTL_MS) {
        localStorage.removeItem(WM_CREDS_KEY);
        return null;
      }
      return { email: data.e, password: deobfuscate(data.p), phone: data.ph || '' };
    } catch (e) { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(WM_SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(WM_CREDS_KEY); } catch (e) {}
  }

  function isWmUser(user) {
    return !!(user && user.email && /^wm_.*@kerben-warehouse[.]local$/i.test(user.email));
  }

  var _restorePromise = null;

  function tryRestoreWmSession() {
    if (_restorePromise) return _restorePromise;

    _restorePromise = new Promise(function (resolve) {
      function finish(ok) {
        _restorePromise = null;
        resolve(!!ok);
      }

      if (typeof firebase === 'undefined' || !firebase.auth) return finish(false);

      var auth = wmAuth();
      if (!auth) return finish(false);

      try {
        if (isWmUser(auth.currentUser)) return finish(true);
      } catch (e) {}

      var creds = getStoredPassword();
      if (!creds || !creds.email || !creds.password) return finish(false);

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        finish(false);
      }, 8000);

      auth.signInWithEmailAndPassword(creds.email, creds.password)
        .then(function (res) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          saveSession({
            email: creds.email,
            phone: creds.phone,
            uid: res && res.user ? res.user.uid : ''
          });
          finish(true);
        })
        .catch(function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          var code = err && err.code ? err.code : '';
          if (code === 'auth/wrong-password' ||
              code === 'auth/invalid-credential' ||
              code === 'auth/invalid-login-credentials' ||
              code === 'auth/user-not-found' ||
              code === 'auth/user-disabled') {
            clearSession();
          }
          finish(false);
        });
    });

    return _restorePromise;
  }

  function openWarehouseManagerPage() {
    var url = 'warehouse-manager.html';
    try {
      if (window.parent && window.parent !== window) {
        window.top.location.href = url;
        return;
      }
    } catch (e) {}
    window.location.href = url;
  }

  global.kerbenWmAuth = wmAuth;
  global.kerbenWmDb = wmDb;
  global.kerbenGetWmSession = getSession;
  global.kerbenSaveWmSession = saveSession;
  global.kerbenSaveWmCreds = saveCreds;
  global.kerbenClearWmSession = clearSession;
  global.kerbenRestoreWmSession = tryRestoreWmSession;
  global.kerbenOpenWarehouseManager = openWarehouseManagerPage;
})(typeof window !== 'undefined' ? window : this);
