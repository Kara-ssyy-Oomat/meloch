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
  // URL Cloud Function orderNotify — гарантированная доставка заказа
  // без Firebase Auth / App Check. См. functions/index.js.
  const ORDER_NOTIFY_URL =
    'https://us-central1-svoysayet.cloudfunctions.net/orderNotify';

  // Пытаемся дослать заказ через orderNotify HTTP endpoint.
  // Возвращает true если заказ дошёл (или уже был в БД), false при ошибке.
  async function _retryViaOrderNotify(orderId, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(ORDER_NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderId, payload: payload }),
        signal: controller.signal
      });
      if (!resp.ok) {
        console.warn('[PendingOrders] orderNotify HTTP', resp.status);
        return false;
      }
      const data = await resp.json().catch(() => ({}));
      // firestore.ok=true — заказ в БД (создан сейчас или уже был там).
      // Если БД упала, но Telegram прошёл — админ хотя бы узнает,
      // но backup оставляем для повторной попытки.
      if (data && data.firestore && data.firestore.ok === true) {
        console.log('[PendingOrders] orderNotify OK:', orderId, data);
        return true;
      }
      console.warn('[PendingOrders] orderNotify без БД:', data);
      return false;
    } catch (e) {
      console.warn('[PendingOrders] orderNotify network error:', e && e.message);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  global.retryPendingOrders = async function () {
    let list = _load();
    if (list.length === 0) return;

    console.log('[PendingOrders] найдено ' + list.length + ' зависших заказов, перепосылаем...');
    const hasFirestore = typeof firebase !== 'undefined' && firebase.firestore;
    const db = hasFirestore ? firebase.firestore() : null;

    // Ждём auth (с коротким таймаутом — на случай если сеть плохая).
    // Это важно только для fallback пути через .set() — orderNotify auth не требует.
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

      // ─── 1) Сначала проверим — может заказ уже в БД ────────
      // (Firestore persistence мог досинхронизировать в фоне.
      //  Или клиент .set() всё-таки прошёл. Не хотим создавать дубль.)
      if (db) {
        try {
          const existing = await db.collection('orders').doc(entry.orderId).get();
          if (existing.exists) {
            console.log('[PendingOrders] заказ уже на сервере, чищу backup:', entry.orderId);
            continue; // не добавляем в stillPending — backup удалён
          }
        } catch (e) {
          // permission-denied на .get() — auth проблема. Не блокирует
          // orderNotify — переходим к нему сразу.
          console.warn('[PendingOrders] .get() ошибка:', e && e.message);
        }
      }

      // ─── 2) Досылаем через orderNotify (ГЛАВНЫЙ ПУТЬ) ──────
      // Работает БЕЗ Firebase Auth / App Check — это то что нужно
      // для клиентов с 403 или App Check проблемами.
      const sentViaNotify = await _retryViaOrderNotify(entry.orderId, entry.payload);
      if (sentViaNotify) {
        console.log('[PendingOrders] ✅ доставлен через orderNotify:', entry.orderId);
        continue; // успешно — backup удалён
      }

      // ─── 3) Fallback — старый путь через Firestore SDK ────
      // Если orderNotify упал (Cloud Function ушла в offline и т.п.),
      // пробуем через клиентский .set(). Возможно у клиента как раз
      // auth ожил — тогда пройдёт.
      if (db) {
        try {
          const setP = db.collection('orders').doc(entry.orderId).set(entry.payload);
          const timeoutP = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('__RETRY_TIMEOUT__')), 10000)
          );
          await Promise.race([setP, timeoutP]);
          console.log('[PendingOrders] ✅ доставлен через .set():', entry.orderId);
          continue;
        } catch (e) {
          console.warn('[PendingOrders] .set() тоже не смог:', entry.orderId, e && e.message);
        }
      }

      // Оба пути провалились — оставляем в очереди на следующий раз
      stillPending.push(entry);
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
