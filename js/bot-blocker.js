// ===================================================================
// КЕРБЕН B2B Market — Bot Blocker (защита Firestore от ботов)
// -------------------------------------------------------------------
// Главная причина спайков расхода — поисковые/SEO/AI боты, которые
// ходят по сайту и каждый раз грузят все 5000 товаров. Они не имеют
// localStorage-кэша, поэтому КАЖДЫЙ их визит = ~5000 reads.
//
// Этот модуль:
//   1. Определяет бота по user-agent.
//   2. Если бот — отключает Firestore-сеть навсегда (на этой странице).
//      Все вызовы .get()/.onSnapshot() уйдут в локальный кэш или
//      вернут пустые данные. Никаких Read Ops не будет.
//   3. Опционально показывает заглушку "Это статичная превью-версия".
//
// Подключать ОЧЕНЬ РАНО — сразу после firebase-config.js, до того
// как любой скрипт начнёт читать БД.
// -------------------------------------------------------------------

(function () {
  'use strict';

  // ---------- Список user-agent ботов ----------
  // Регексп: |-разделённый, регистронезависимый.
  // Источник: статистика популярных поисковых и SEO-сканеров.
  var BOT_REGEX = new RegExp([
    // Поисковики (Google, Bing, Yandex, Baidu, DuckDuckGo, Yahoo)
    'Googlebot', 'Google-InspectionTool', 'AdsBot-Google', 'Mediapartners-Google',
    'bingbot', 'BingPreview', 'msnbot',
    'YandexBot', 'YandexImages', 'YandexMobileBot', 'YandexAccessibilityBot',
    'Baiduspider', 'baidu\\.com',
    'DuckDuckBot', 'DuckDuckGo-Favicons-Bot',
    'Slurp', 'Yahoo! Slurp',

    // SEO/маркетинговые сканеры (самые «жадные»)
    'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'BLEXBot',
    'PetalBot', 'DataForSeoBot', 'SeznamBot', 'ZoominfoBot', 'serpstatbot',
    'rogerbot', 'exabot', 'sogou', 'screaming frog', 'sitebulb',
    'linkfluence', 'barkrowler', 'OnPageMainBot', 'Re-re Studio',

    // Соцсети — превью карточек
    'facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot',
    'Pinterestbot', 'WhatsApp', 'TelegramBot', 'Slackbot', 'vkShare',
    'Embedly', 'Discordbot', 'redditbot',

    // AI-краулеры (OpenAI, Anthropic, Perplexity, ByteDance, Apple)
    'GPTBot', 'ChatGPT-User', 'anthropic-ai', 'Claude-Web', 'ClaudeBot',
    'CCBot', 'PerplexityBot', 'Bytespider', 'Amazonbot', 'Applebot',
    'Diffbot', 'Omgilibot', 'cohere-ai', 'YouBot', 'AndiBot',

    // Мониторинг и uptime-сервисы (не должны жечь Firestore)
    'UptimeRobot', 'StatusCake', 'Pingdom', 'NewRelic', 'Site24x7',
    'BetterUptime', 'Better-Uptime',

    // Прочие сканеры/парсеры
    'bot/', 'crawler', 'spider', 'scraper', 'httrack', 'curl/', 'wget/',
    'python-requests', 'python-urllib', 'Go-http-client', 'okhttp',
    'Java/', 'PhantomJS', 'HeadlessChrome', 'Lighthouse',
    'PageSpeed', 'GTmetrix', 'WebPageTest'
  ].join('|'), 'i');

  var ua = (navigator.userAgent || '') + ' ' + (navigator.vendor || '');
  var isBot = BOT_REGEX.test(ua);

  // Дополнительная эвристика: webdriver, headless без user-agent, нет языка.
  // Только как доп. сигнал — не main-detection, чтобы не банить пользователей.
  if (!isBot) {
    try {
      if (navigator.webdriver === true) isBot = true;
    } catch (e) {}
  }

  // Глобальный флаг, чтобы другие скрипты могли проверить
  window.__KERBEN_IS_BOT = isBot;
  window.KerbenBotBlocker = {
    isBot: function () { return isBot; },
    userAgent: ua,
    matchedPattern: isBot ? (ua.match(BOT_REGEX) || [])[0] : null
  };

  if (!isBot) {
    // Обычный пользователь — ничего не делаем
    return;
  }

  // ---------- Это БОТ — блокируем Firestore полностью ----------
  console.log('[BotBlocker] Обнаружен бот:', (ua.match(BOT_REGEX) || [])[0], '— Firestore отключён');

  // 1. Метим страницу для других скриптов: они могут проверить
  //    window.__KERBEN_IS_BOT и не запускать тяжёлые операции.
  try {
    document.documentElement.setAttribute('data-bot', '1');
  } catch (e) {}

  // 2. Как только Firebase инициализируется — отключаем сеть Firestore.
  //    Все .get()/.onSnapshot() уйдут в IndexedDB-кэш и вернут пусто.
  //    Никаких Read Ops в Firestore не будет.
  function killFirestore() {
    try {
      if (typeof firebase === 'undefined') return false;
      if (!firebase.firestore) return false;
      if (firebase.apps && firebase.apps.length === 0) return false;
      var db = firebase.firestore();
      if (!db) return false;
      db.disableNetwork().then(function () {
        console.log('[BotBlocker] Firestore network отключён для бота');
      }).catch(function () {});
      // Параллельно сразу патчим .get() чтобы возвращал пустой snapshot,
      // даже если кто-то всё-таки попробует enableNetwork() обратно.
      try {
        var fakeSnap = {
          empty: true,
          size: 0,
          docs: [],
          forEach: function () {},
          metadata: { fromCache: true, hasPendingWrites: false }
        };
        if (firebase.firestore.Query && firebase.firestore.Query.prototype) {
          var origGet = firebase.firestore.Query.prototype.get;
          firebase.firestore.Query.prototype.get = function () {
            return Promise.resolve(fakeSnap);
          };
          firebase.firestore.Query.prototype.onSnapshot = function () {
            return function () {};
          };
        }
        if (firebase.firestore.DocumentReference && firebase.firestore.DocumentReference.prototype) {
          firebase.firestore.DocumentReference.prototype.get = function () {
            return Promise.resolve({
              exists: false,
              data: function () { return undefined; },
              metadata: { fromCache: true }
            });
          };
          firebase.firestore.DocumentReference.prototype.onSnapshot = function () {
            return function () {};
          };
        }
      } catch (patchErr) {
        console.warn('[BotBlocker] patch error:', patchErr);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // Пробуем сразу; если Firebase ещё не загружен — повторяем.
  if (!killFirestore()) {
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      if (killFirestore()) { clearInterval(poll); return; }
      if (tries > 100) { clearInterval(poll); }
    }, 100);
  }
})();
