// ===================================================================
// КЕРБЕН B2B Market — Auto Invalidate Firestore Cache
// -------------------------------------------------------------------
// Раньше при каждом визите сайт читал ВСЕ товары/заказы из Firestore —
// это съедало основную долю Read Ops. Чтобы это сократить, мы храним:
//   • Товары — в localStorage (`cachedProducts`, 1 час).
//   • Заказы — в localStorage (`profitOrdersCache`, `agentsOrdersCache`,
//     30 минут) для админ-страниц прибыли/агентов.
//
// Но возникал риск: админ добавил/изменил товар/заказ → другие
// админ-вкладки и клиенты видят старые данные до 30-60 минут.
//
// Этот модуль решает проблему: он перехватывает ВСЕ записи в коллекции
// `products` и `orders` (через add/set/update/delete/batch/transaction)
// и сразу сбрасывает соответствующий кэш на текущей вкладке + во всех
// других вкладках (через BroadcastChannel и `storage`-event).
// Результат:
//   • Админ видит свои изменения мгновенно на любой странице.
//   • Админ B видит заказы, оформленные клиентом, мгновенно.
//   • Клиент при следующей загрузке index.html получит свежие данные.
//   • Расход Firestore не растёт — мы просто помечаем кэш протухшим.
// ===================================================================

(function () {
  'use strict';

  // ----- Конфигурация коллекций с кэшем -----
  // Каждая коллекция — это пара (имя, список localStorage-ключей которые
  // надо очистить при любой записи в неё). Расширяемо.
  var CACHES = {
    products: {
      keys: ['cachedProducts', 'cachedProductsTime'],
      clearRam: function () {
        // RAM-кэш в js/product-loader.js
        try {
          if (typeof productsCache !== 'undefined') {
            productsCache = [];
            productsCacheTime = 0;
          }
        } catch (e) {}
      }
    },
    orders: {
      keys: [
        'profitOrdersCache', 'profitOrdersCacheTs',   // admin-profit.html
        'agentsOrdersCache', 'agentsOrdersCacheTs'    // admin-agents.html
      ],
      clearRam: function () {
        // RAM-кэши на админ-страницах
        try { if (typeof _profitPageCache !== 'undefined') { _profitPageCache.orders = null; _profitPageCache.ordersTs = 0; } } catch (e) {}
        try { if (typeof ordersManagementAllOrders !== 'undefined') { ordersManagementAllOrders = null; } } catch (e) {}
      }
    }
  };

  var BC_NAME = 'kerben-firestore-cache';
  var bc = null;
  try { bc = new BroadcastChannel(BC_NAME); } catch (e) {}

  // Очистка только localStorage (без RAM). Используется когда ТЕКУЩАЯ
  // вкладка сама делает запись — её собственный RAM-кэш страница уже
  // обновляет вручную сразу после await, и обнулять его извне НЕЛЬЗЯ
  // (иначе чекпоинт `if (Array.isArray(...))` после await упадёт и
  // локальное обновление будет потеряно — экран зависнет на «Загрузке»).
  function clearLSOnly(collection) {
    var cfg = CACHES[collection];
    if (!cfg) return;
    cfg.keys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
  }

  // Полная очистка: localStorage + RAM-кэш. Используется только для
  // СТОРОННИХ инвалидаций (broadcast от другой вкладки, storage event).
  function clearAll(collection) {
    clearLSOnly(collection);
    var cfg = CACHES[collection];
    if (!cfg) return;
    try { cfg.clearRam(); } catch (e) {}
  }

  function invalidate(collection, opts) {
    if (!CACHES[collection]) return;
    // ТЕКУЩАЯ вкладка: только localStorage. RAM не трогаем — страница сама.
    clearLSOnly(collection);
    if (!(opts && opts.silent) && bc) {
      try { bc.postMessage({ type: 'invalidate', collection: collection }); } catch (e) {}
    }
    if (window.console && console.log) {
      console.log('[FirestoreCache] кэш сброшен:', collection);
    }
  }

  // Получаем сообщение от ДРУГОЙ вкладки — сбрасываем у себя по полной
  if (bc) {
    bc.onmessage = function (e) {
      var d = e && e.data;
      if (d && d.type === 'invalidate' && CACHES[d.collection]) {
        clearAll(d.collection);
      }
    };
  }

  // Доп. канал: storage event (на случай если BroadcastChannel недоступен)
  window.addEventListener('storage', function (e) {
    if (!e.key) return;
    // Если ДРУГАЯ вкладка удалила timestamp-ключ — сбрасываем RAM у себя
    Object.keys(CACHES).forEach(function (collection) {
      var keys = CACHES[collection].keys;
      if (keys.indexOf(e.key) !== -1 && !e.newValue) {
        try { CACHES[collection].clearRam(); } catch (err) {}
      }
    });
  });

  // Публичный API
  window.KerbenProductsCache = {
    invalidate: function (opts) { invalidate('products', opts); }
  };
  window.KerbenOrdersCache = {
    invalidate: function (opts) { invalidate('orders', opts); }
  };
  window.KerbenCache = {
    invalidate: invalidate
  };

  // -----------------------------------------------------------------
  // Monkey-patch Firestore SDK: автоматически инвалидируем кэш при
  // ЛЮБОЙ записи в коллекции `products` и `orders`. Это работает
  // прозрачно для всего кода — не нужно вручную вставлять `invalidate()`
  // после каждого `update()`/`add()`/`delete()`.
  // -----------------------------------------------------------------
  // Определяем коллекцию по пути ref/coll. Возвращаем имя коллекции
  // (`products`, `orders`) или null если кэш не отслеживаем.
  function detectCollection(pathOrRef, isCollection) {
    var path = null;
    if (typeof pathOrRef === 'string') path = pathOrRef;
    else if (pathOrRef && typeof pathOrRef.path === 'string') path = pathOrRef.path;
    if (!path) return null;

    if (isCollection) {
      // CollectionReference: path = "products" или "orders"
      if (path === 'products') return 'products';
      if (path === 'orders') return 'orders';
      return null;
    }
    // DocumentReference: path = "products/abc" или "orders/xyz"
    if (path === 'products' || path.indexOf('products/') === 0) return 'products';
    if (path === 'orders' || path.indexOf('orders/') === 0) return 'orders';
    return null;
  }

  function patch() {
    if (typeof firebase === 'undefined' || !firebase.firestore) return false;
    if (!firebase.firestore.CollectionReference) return false;

    // CollectionReference.add — products / orders
    if (!firebase.firestore.CollectionReference.prototype.__kerbenPatched) {
      var origAdd = firebase.firestore.CollectionReference.prototype.add;
      firebase.firestore.CollectionReference.prototype.add = function (data) {
        var coll = detectCollection(this, true);
        var p = origAdd.apply(this, arguments);
        if (coll && p && typeof p.then === 'function') {
          p.then(function () { invalidate(coll); }).catch(function () {});
        }
        return p;
      };
      firebase.firestore.CollectionReference.prototype.__kerbenPatched = true;
    }

    // DocumentReference: update, set, delete
    if (!firebase.firestore.DocumentReference.prototype.__kerbenPatched) {
      ['update', 'set', 'delete'].forEach(function (method) {
        var orig = firebase.firestore.DocumentReference.prototype[method];
        firebase.firestore.DocumentReference.prototype[method] = function () {
          var coll = detectCollection(this, false);
          var p = orig.apply(this, arguments);
          if (coll && p && typeof p.then === 'function') {
            p.then(function () { invalidate(coll); }).catch(function () {});
          }
          return p;
        };
      });
      firebase.firestore.DocumentReference.prototype.__kerbenPatched = true;
    }

    // WriteBatch: накапливаем какие коллекции тронуты, инвалидируем при commit
    if (firebase.firestore.WriteBatch && !firebase.firestore.WriteBatch.prototype.__kerbenPatched) {
      ['update', 'set', 'delete'].forEach(function (method) {
        var orig = firebase.firestore.WriteBatch.prototype[method];
        firebase.firestore.WriteBatch.prototype[method] = function (ref) {
          var result = orig.apply(this, arguments);
          var coll = detectCollection(ref, false);
          if (coll) {
            if (!this.__kerbenTouches) this.__kerbenTouches = {};
            this.__kerbenTouches[coll] = true;
          }
          return result;
        };
      });
      var origCommit = firebase.firestore.WriteBatch.prototype.commit;
      firebase.firestore.WriteBatch.prototype.commit = function () {
        var touches = this.__kerbenTouches;
        var p = origCommit.apply(this, arguments);
        if (touches && p && typeof p.then === 'function') {
          p.then(function () {
            Object.keys(touches).forEach(function (c) { invalidate(c); });
          }).catch(function () {});
        }
        return p;
      };
      firebase.firestore.WriteBatch.prototype.__kerbenPatched = true;
    }

    // Transaction: инвалидируем после успешного выхода из коллбэка
    if (firebase.firestore.Transaction && !firebase.firestore.Transaction.prototype.__kerbenPatched) {
      ['update', 'set', 'delete'].forEach(function (method) {
        var orig = firebase.firestore.Transaction.prototype[method];
        firebase.firestore.Transaction.prototype[method] = function (ref) {
          var result = orig.apply(this, arguments);
          var coll = detectCollection(ref, false);
          if (coll) {
            // Защитный сброс по выходу из микротаска — транзакция сама
            // фиксирует все операции; если упадёт — следующий .get() просто
            // перечитает данные, никакой проблемы.
            Promise.resolve().then(function () { invalidate(coll); });
          }
          return result;
        };
      });
      firebase.firestore.Transaction.prototype.__kerbenPatched = true;
    }

    return true;
  }

  // Ждём загрузки Firebase SDK
  if (!patch()) {
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      if (patch()) { clearInterval(poll); return; }
      if (tries > 100) { clearInterval(poll); }
    }, 200);
  }
})();
