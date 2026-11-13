// ===================================================================
// КЕРБЕН — наценка агента (%)
//
// Процент хранится только в документе agents/{id}:
//   markupAllowed  — администратор разрешил функцию
//   markupEnabled  — администратор включил применение
//   markupPercent  — процент наценки
//
// Цена продажи считается при показе каталога и при оформлении заказа.
// Поле products.price не читается для записи и не меняется.
// На главном сайте (покупатель не в сессии этого агента) цена прежняя.
// ===================================================================

(function (global) {
  'use strict';

  var state = {
    loaded: false,
    agentId: null,
    allowed: false,
    enabled: false,
    percent: 0
  };

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  // Сессия агента — вход в кабинет «Моя прибыль». Отдельный вход покупателя не нужен:
  // агент открывает каталог со своей страницы, и currentAgent уже записан.
  function readAgent() {
    try {
      var raw = localStorage.getItem('currentAgent');
      if (!raw) return null;
      var agent = JSON.parse(raw);
      if (!(agent && agent.name && (agent.id || agent.phone))) return null;
      return agent;
    } catch (e) {
      return null;
    }
  }

  // Только открытый редактор товара показывает цену KERBEN, чтобы она не сохранилась в базу.
  // Обычный просмотр каталога, даже если на телефоне есть вход продавца, остаётся с наценкой.
  function isStaffView() {
    try {
      if (typeof isEditorMode !== 'undefined' && isEditorMode) return true;
    } catch (e) {}
    return false;
  }

  function tradePage() {
    try {
      if (window.KerbenAgentTrade && typeof KerbenAgentTrade.mode === 'function') {
        return KerbenAgentTrade.mode() || '';
      }
    } catch (e) {}
    return '';
  }

  function isActive() {
    // На покупке и продаже процент каталога не прибавляется.
    // На продаже свою цену считает остаток агента.
    if (tradePage() === 'buy' || tradePage() === 'sell') return false;
    return !isStaffView()
      && state.loaded
      && state.allowed === true
      && state.enabled === true
      && state.percent > 0
      && !!readAgent();
  }

  function savedPercent() {
    if (!state.loaded || state.allowed !== true || state.enabled !== true) return 0;
    var pct = Number(state.percent);
    if (!isFinite(pct) || pct <= 0) return 0;
    if (pct > 500) return 500;
    return pct;
  }

  function price(n) {
    if (!isActive()) return n;
    var num = Number(n);
    if (!isFinite(num)) return n;
    // 45 сом + 10% = 49.50 → на экране и в заказе 50 сом.
    return Math.round(num * (100 + state.percent) / 100);
  }

  function display(n) {
    if (!isActive()) return n;
    var sale = price(n);
    if (typeof sale !== 'number' || !isFinite(sale)) return n;
    return sale;
  }

  // База для строки заказа: оптовая цена при достижении порога, иначе цена KERBEN.
  // Документ товара не изменяется.
  function baseUnit(product, item) {
    var qty = Number(item && item.qty) || 0;
    var base = Number(product && product.price);
    if (!isFinite(base)) base = 0;
    var optQty = Number(product && product.optQty);
    var optPrice = Number(product && product.optPrice);
    if (optQty > 0 && isFinite(optPrice) && qty >= optQty) return optPrice;
    return base;
  }

  // Подставляет цену продажи в строку корзины. product.price не трогает.
  function stamp(item, product) {
    if (!item || !product) return item;
    if (item.agentSale || item.agentPurchase) return item;
    var base = baseUnit(product, item);
    if (!isActive()) {
      // Пока документ агента не прочитан, цену в корзине не сбрасываем.
      if (state.loaded && item.markupPercent) {
        item.price = base;
        item.basePrice = round2(base);
        item.markupPercent = 0;
      }
      return item;
    }
    item.basePrice = round2(base);
    item.price = price(base);
    item.markupPercent = state.percent;
    return item;
  }

  function updateBanner() {
    // Процент и цена без наценки на экране не пишутся: клиент рядом с агентом видит только цену продажи.
    var ids = ['productTable', 'cartContent'];
    for (var i = 0; i < ids.length; i++) {
      var banner = document.getElementById('kerbenMarkupBanner-' + ids[i]);
      if (banner) banner.remove();
    }
  }

  function rerender() {
    updateBanner();
    try { if (typeof renderProducts === 'function') renderProducts(); } catch (e) {}
    try { if (typeof updateCart === 'function') updateCart(); } catch (e) {}
    try { if (typeof renderCart === 'function') renderCart(); } catch (e) {}
  }

  function snapshot() {
    return [state.agentId || '', state.allowed ? 1 : 0, state.enabled ? 1 : 0, state.percent, isActive() ? 1 : 0].join('|');
  }

  var loadAttempts = 0;

  async function refresh() {
    var before = snapshot();
    var agent = readAgent();
    if (!agent || !agent.id) {
      loadAttempts = 0;
      state = { loaded: true, agentId: null, allowed: false, enabled: false, percent: 0 };
      if (snapshot() !== before) rerender();
      else updateBanner();
      return state;
    }
    if (typeof db === 'undefined' || !db) {
      scheduleRefresh(800);
      return state;
    }
    try {
      if (typeof kerbenWaitForAuth === 'function') {
        try { await kerbenWaitForAuth(4000); } catch (e) {}
      }
      var snap = await db.collection('agents').doc(agent.id).get();
      var data = snap.exists ? (snap.data() || {}) : {};
      var pct = Number(data.markupPercent);
      if (!isFinite(pct) || pct < 0) pct = 0;
      if (pct > 500) pct = 500;
      state = {
        loaded: true,
        agentId: agent.id,
        allowed: data.markupAllowed === true,
        enabled: data.markupEnabled === true,
        percent: round2(pct)
      };
      loadAttempts = 0;
    } catch (e) {
      console.warn('[Markup] не удалось прочитать наценку агента:', e && e.message);
      loadAttempts += 1;
      if (loadAttempts < 8) scheduleRefresh(1200);
      return state;
    }
    if (snapshot() !== before) rerender();
    else updateBanner();
    return state;
  }

  async function prepareCartPrices(cartItems) {
    await refresh();
    var list = Array.isArray(cartItems) ? cartItems : [];
    var catalog = (typeof products !== 'undefined' && products) ? products : [];
    list.forEach(function (item) {
      if (!item || !item.id) return;
      var product = null;
      for (var i = 0; i < catalog.length; i++) {
        if (catalog[i] && catalog[i].id === item.id) { product = catalog[i]; break; }
      }
      if (product) stamp(item, product);
    });
    var active = isActive();
    return {
      active: active,
      percent: active ? state.percent : 0,
      agentId: active ? state.agentId : null
    };
  }

  var refreshTimer = null;
  function scheduleRefresh(delay) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { refresh(); }, delay == null ? 400 : delay);
  }

  function boot() {
    scheduleRefresh(400);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleRefresh(200);
    });
    window.addEventListener('pageshow', function () { scheduleRefresh(200); });
    var lastKey = '';
    setInterval(function () {
      var agent = readAgent();
      var key = agent ? String(agent.id || '') : '';
      var pending = !!(key && (!state.loaded || state.agentId !== key));
      if (key !== lastKey || pending) {
        lastKey = key;
        scheduleRefresh(pending ? 300 : 200);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.KerbenMarkup = {
    refresh: refresh,
    isActive: isActive,
    percent: function () { return isActive() ? state.percent : 0; },
    savedPercent: savedPercent,
    price: price,
    display: display,
    stamp: stamp,
    prepareCartPrices: prepareCartPrices
  };
})(typeof window !== 'undefined' ? window : this);
