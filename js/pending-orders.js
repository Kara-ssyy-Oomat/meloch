// ============================================================================
//               PENDING ORDERS — гарантия доставки заказов
// ----------------------------------------------------------------------------
// Firebase Firestore offline-persistence обычно спасает — заказ ставится в
// очередь в IndexedDB и досинхронизируется когда появится сеть. Но у неё
// есть слабое место: incognito/приватный режим часто НЕ поддерживает
// IndexedDB persistence. В таком случае, если клиент в incognito с плохой
// сетью нажал «Оформить», увидел «принят», закрыл вкладку — заказ мог
// не уйти на сервер.
//
// Этот модуль — второй эшелон защиты:
//   1. Перед orderRef.set() сохраняем payload в localStorage
//   2. При успешном коммите — удаляем из localStorage
//   3. На загрузке ЛЮБОЙ страницы сайта (loaded from firebase-config.js) —
//      проверяем localStorage и перепосылаем «зависшие» заказы
//
// Результат: даже если Firestore persistence не сработал, при следующем
// открытии сайта заказ дойдёт. Единственный случай когда мы ничего не
// можем — если клиент вообще никогда не вернётся на сайт (например
// incognito+закрыл сессию навсегда) — но это единичные случаи.
// ============================================================================
(function (global) {
  'use strict';

  const LS_KEY = 'pendingOrdersBackup';
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней — старше не пытаемся

  function _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) { return []; }
  }

  function _save(list) {
    try {
      // Ограничиваем размер — не даём разжиреть если что-то пошло не так
      const trimmed = list.slice(-20);
      localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // localStorage может быть переполнен или заблокирован — не критично,
      // Firestore persistence всё равно попытается доставить
    }
  }

  // Сохранить заказ в localStorage перед попыткой отправки.
  // Вызывается ДО orderRef.set() чтобы если что-то пойдёт не так,
  // мы могли перепослать.
  global.savePendingOrderBackup = function (orderId, payload) {
    if (!orderId || !payload) return;
    try {
      const list = _load();
      // Не дублируем если уже есть
      if (list.some(x => x && x.orderId === orderId)) return;
      list.push({
        orderId: orderId,
        payload: payload,
        savedAt: Date.now()
      });
      _save(list);
      console.log('[PendingOrders] backup сохранён:', orderId);
    } catch (e) {
      console.warn('[PendingOrders] не смогли сохранить backup:', e);
    }
  };

  // Убрать заказ из backup — когда мы точно знаем что сервер его получил.
  global.removePendingOrderBackup = function (orderId) {
    if (!orderId) return;
    try {
      const list = _load();
      const filtered = list.filter(x => x && x.orderId !== orderId);
      if (filtered.length !== list.length) {
        _save(filtered);
        console.log('[PendingOrders] backup удалён:', orderId);
      }
    } catch (e) {}
  };

  // Проверить и перепослать зависшие заказы.
  // Вызывается на загрузке страницы (см. вызов внизу).
  global.retryPendingOrders = async function () {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;
    let list = _load();
    if (list.length === 0) return;

    console.log('[PendingOrders] найдено ' + list.length + ' зависших заказов, перепосылаем...');
    const db = firebase.firestore();

    // Ждём auth (с коротким таймаутом — на случай если сеть плохая)
    if (typeof global.kerbenWaitForAuth === 'function') {
      try { await global.kerbenWaitForAuth(2000); } catch (e) {}
    }

    const now = Date.now();
    const stillPending = [];

    for (const entry of list) {
      if (!entry || !entry.orderId || !entry.payload) continue;

      // Удаляем слишком старые (>7 дней) — уже неактуальны
      if (entry.savedAt && (now - entry.savedAt) > MAX_AGE_MS) {
        console.warn('[PendingOrders] удаляем старый backup:', entry.orderId);
        continue;
      }

      try {
        // Сначала проверим: может заказ уже на сервере (Firestore
        // persistence всё-таки досинхронизировал в фоне)? Если да —
        // просто удаляем backup, не перезаписываем.
        const existing = await db.collection('orders').doc(entry.orderId).get();
        if (existing.exists) {
          console.log('[PendingOrders] заказ уже на сервере, чищу backup:', entry.orderId);
          continue;
        }

        // Заказа нет на сервере — досылаем.
        // 10 сек таймаут — если снова не удалось, оставляем в backup
        // и попробуем при следующем открытии страницы.
        const setP = db.collection('orders').doc(entry.orderId).set(entry.payload);
        const timeoutP = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('__RETRY_TIMEOUT__')), 10000)
        );
        await Promise.race([setP, timeoutP]);
        console.log('[PendingOrders] заказ досослан:', entry.orderId);
        // Не добавляем в stillPending — успешно доставили
      } catch (e) {
        console.warn('[PendingOrders] не удалось переслать', entry.orderId, ':', e && e.message);
        // Оставляем в списке — попробуем в следующий раз
        stillPending.push(entry);
      }
    }

    _save(stillPending);
    if (stillPending.length > 0) {
      console.log('[PendingOrders] осталось ' + stillPending.length + ' зависших заказов, повторим при след. загрузке');
    } else {
      console.log('[PendingOrders] все зависшие заказы доставлены');
    }
  };

  // ────────────────────────────────────────────────────────────────
  // АВТО-ЗАПУСК retry в 3 сценариях:
  //   1) На загрузке страницы (800 мс задержка чтобы не мешать
  //      первому рендеру; раньше было 2000 мс — многовато).
  //   2) Когда пришёл сигнал 'online' (было offline → стало online).
  //   3) Когда вкладка становится видимой (пользователь вернулся из
  //      фона / переключил вкладку). Это критично: если клиент
  //      закрыл вкладку с невыполненным .set() и через 5 сек вернулся —
  //      мы не хотим ждать полной перезагрузки страницы.
  //
  // Защита от гонок: если retry уже идёт — не запускаем второй.
  // ────────────────────────────────────────────────────────────────
  let _isRunning = false;
  let _lastRun = 0;
  const MIN_INTERVAL_MS = 3000; // не запускаем чаще чем раз в 3 сек

  function _safeRun(source) {
    const now = Date.now();
    if (_isRunning) return;
    if (now - _lastRun < MIN_INTERVAL_MS) return;
    _lastRun = now;
    _isRunning = true;
    Promise.resolve()
      .then(() => global.retryPendingOrders())
      .catch((e) => { console.warn('[PendingOrders] retry (' + source + ') error:', e); })
      .then(() => { _isRunning = false; });
  }

  if (typeof window !== 'undefined') {
    // 1) На загрузке страницы
    if (document.readyState === 'complete') {
      setTimeout(function () { _safeRun('load'); }, 800);
    } else {
      window.addEventListener('load', function () {
        setTimeout(function () { _safeRun('load'); }, 800);
      });
    }

    // 2) При появлении сети
    window.addEventListener('online', function () {
      setTimeout(function () { _safeRun('online'); }, 500);
    });

    // 3) При возврате на вкладку (visibilitychange)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        setTimeout(function () { _safeRun('visibility'); }, 500);
      }
    });
  }
})(typeof window !== 'undefined' ? window : this);
