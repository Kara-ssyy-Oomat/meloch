// ===================================================================
// КЕРБЕН — объявление списания остатков по заказу.
// -------------------------------------------------------------------
// Остатки по заказу списывает Cloud Function deductStockOnOrderCreate,
// а не браузер. Об этом никто не объявлял, и другие устройства узнавали
// о списании только когда у них протухал 15-минутный кэш товаров:
// покупатель видел на витрине товар, которого на складе уже не было.
//
// Объявляем сами — но ТОЛЬКО после того, как функция отметила заказ
// обработанным. Объявить раньше значит заставить остальных перечитать
// товары с ещё не списанными цифрами и остаться с теми же старыми.
//
// Цена: одна запись в settings/productsRevision плюс несколько чтений
// своего же заказа. Остальные вкладки дочитают по одному документу на
// изменённый товар, а не всю коллекцию (см. _refreshProductsByIds).
//
// Файл отдельный, потому что заказ оформляется и с главной (order-submit.js
// рядом с product-loader.js), и из корзины, где product-loader.js нет.
// ===================================================================
(function () {
  'use strict';

  // Дольше ждать нет смысла: Cloud Function ретраит до 30 минут, но к тому
  // моменту у всех и так истечёт обычная проверка свежести кэша.
  var WAIT_MS = 60000;

  // Больше 20 товаров settings/productsRevision всё равно не перечисляет —
  // остальные вкладки в таком случае перезагружают каталог целиком. Для
  // крупных заказов это дороже, чем дождаться обычной проверки свежести.
  var MAX_IDS = 20;

  function getDb() {
    // db объявлена через let в firebase-config.js / внутри cart.html, и до
    // выполнения того скрипта обращение к ней бросает ReferenceError.
    try { if (typeof db !== 'undefined' && db) return db; } catch (e) {}
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) return firebase.firestore();
    } catch (e) {}
    return null;
  }

  function publish(ids) {
    // На главной есть product-loader.js: отдаём объявление ему, чтобы он
    // пометил ревизию своей (_ownRevisionTs) и не перечитывал товары,
    // которые эта же вкладка уже поправила у себя на экране.
    try {
      if (typeof bumpProductsRevision === 'function') {
        bumpProductsRevision({ ids: ids, by: 'заказ', changedCount: ids.length });
        return;
      }
    } catch (e) {}
    var d = getDb();
    if (!d) return;
    try {
      d.collection('settings').doc('productsRevision').set({
        updatedAt: Date.now(),
        by: 'заказ',
        changedCount: ids.length,
        changedIds: ids
      }, { merge: true }).catch(function (e) {
        console.warn('[Stock] не удалось объявить списание по заказу ' +
          '(другие устройства обновятся через 15 мин):', e && (e.code || e.message));
      });
    } catch (e) {}
  }

  function announceOrderStockChange(orderId, productIds) {
    var ids;
    try {
      ids = (Array.isArray(productIds) ? productIds : []).filter(Boolean);
    } catch (e) { return; }
    if (!orderId || ids.length === 0 || ids.length > MAX_IDS) return;

    var d = getDb();
    if (!d) return;

    var unsub = null;
    var settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      try { if (unsub) unsub(); } catch (e) {}
      if (ok) publish(ids);
    }
    // Если статус так и не придёт (функция упала, пропала сеть) — снимаем
    // слушатель, чтобы он не висел на странице до закрытия вкладки.
    setTimeout(function () { finish(false); }, WAIT_MS);

    try {
      unsub = d.collection('orders').doc(orderId).onSnapshot(function (snap) {
        if (!snap || !snap.exists) return;
        var data = snap.data() || {};
        var status = String(data.stockDeductionStatus || '');
        if (status === 'done' || status === 'done_with_shortage' || status === 'shortage') {
          finish(true);
        } else if (status === 'failed' || status.indexOf('skipped') === 0) {
          finish(false); // остатки не трогали — объявлять нечего
        }
        // 'pending' / 'processing' — функция ещё в работе, ждём.
      }, function () { finish(false); });
    } catch (e) { finish(false); }
  }

  window.announceOrderStockChange = announceOrderStockChange;
})();
