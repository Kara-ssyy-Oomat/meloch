// ===================================================================
// КЕРБЕН — Firebase App Check (reCAPTCHA v3)
// -------------------------------------------------------------------
// Нужно один раз:
//   1) Firebase Console → Build → App Check → зарегистрируйте Web-приложение
//      с провайдером reCAPTCHA v3 (Firebase покажет site key).
//   2) Firestore: документ settings/appCheck с полем recaptchaSiteKey = этот ключ.
//      (ключ публичный по своей природе; так проще менять без деплоя фронта.)
// Опционально: задайте ключ здесь в коде — см. APP_CHECK_RECAPTCHA_SITE_KEY ниже.
//
// Локально (localhost / 127.0.0.1): включается DEBUG-токен App Check.
// Первый запуск откройте консоль браузера → скопируйте «AppCheck debug token»
// → Firebase Console → App Check → ваше Web-приложение → Manage debug tokens.
// ===================================================================

(function (global) {
  /** Публичный site key reCAPTCHA v3 (тот же, что в Google reCAPTCHA Admin → Site key). */
  global.APP_CHECK_RECAPTCHA_SITE_KEY =
    global.APP_CHECK_RECAPTCHA_SITE_KEY || '6LcCmtosAAAAAJHucWPo1QR_FQ14FbzqNCKawf-h';

  var activated = false;
  global.__kerbenAppCheckInitPromise = null;

  global.kerbenFetchAppCheckSiteKeyFromFirestore = async function (db) {
    if (!db || typeof db.collection !== 'function') return;
    try {
      var snap = await db.collection('settings').doc('appCheck').get();
      if (snap.exists) {
        var d = snap.data();
        var v = (d && (d.recaptchaSiteKey || d.siteKey)) || '';
        if (v && String(v).trim().length >= 20) {
          global.APP_CHECK_RECAPTCHA_SITE_KEY = String(v).trim();
        }
      }
    } catch (e) {
      /* ignore */
    }
  };

  global.kerbenActivateAppCheck = function () {
    if (activated) return;
    if (typeof firebase === 'undefined' || typeof firebase.appCheck !== 'function') return;
    if (!firebase.apps.length) return;

    var key = global.APP_CHECK_RECAPTCHA_SITE_KEY;
    if (!key || String(key).length < 20) {
      console.warn(
        '[Kerben App Check] Нет site key. Добавьте Firestore settings/appCheck.recaptchaSiteKey ' +
        'или 6LcCmtosAAAAAJHucWPo1QR_FQ14FbzqNCKawf-h в js/app-check.js. Затем Firebase Console → App Check → Web.'
      );
      return;
    }

    try {
      if (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
        global.self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }

      var Provider = firebase.appCheck.ReCaptchaV3Provider;
      if (!Provider) {
        console.warn('[Kerben App Check] ReCaptchaV3Provider недоступен в SDK');
        return;
      }
      firebase.appCheck().activate(new Provider(key), true);
      activated = true;
      console.log('[Kerben App Check] активирован');
    } catch (e) {
      console.warn('[Kerben App Check] activate:', e.message);
    }
  };

  global.kerbenStartAppCheckSetup = function (db) {
    if (global.__kerbenAppCheckInitPromise) return global.__kerbenAppCheckInitPromise;
    global.__kerbenAppCheckInitPromise = (async function () {
      try {
        await global.kerbenFetchAppCheckSiteKeyFromFirestore(db);
        global.kerbenActivateAppCheck();
      } catch (e) {
        /* ignore */
      }
    })();
    return global.__kerbenAppCheckInitPromise;
  };

  global.kerbenAwaitAppCheck = async function (timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    if (!global.__kerbenAppCheckInitPromise) return;
    await Promise.race([
      global.__kerbenAppCheckInitPromise,
      new Promise(function (r) {
        setTimeout(r, timeoutMs);
      })
    ]);
  };
})(typeof window !== 'undefined' ? window : this);
