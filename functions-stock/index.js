// Kerben — склад: гарантированное списание при заказе (отдельный codebase без secrets)
const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ===================================================================
//         СКЛАД: ГАРАНТИРОВАННОЕ СПИСАНИЕ ПРИ ЗАКАЗЕ
// -------------------------------------------------------------------
// Клиент пишет только заказ (быстро). Остатки списывает сервер:
//   • deductStockOnOrderCreate — сразу после создания заказа.
//     failurePolicy: true → Firebase АВТОМАТИЧЕСКИ ретраит с экспо-
//     ненциальным backoff до 30 минут (см. MAX_EVENT_AGE_MS ниже).
//     После 30 мин ретраи прекращаются, статус ставится 'failed'
//     с ошибкой 'retry_expired' — админ должен обработать вручную.
//
// Идемпотентность: claim через stockDeductionStatus = processing,
// повторный запуск не спишет дважды (stockDeducted / done / skipped).
// Транзакции по каждому товару — без lost-update по warehouseStock.
// ===================================================================

const STOCK_CLAIM_STALE_MS = 3 * 60 * 1000; // processing старше 3 мин = можно перехватить

function _isCancelledStatus(status) {
  return status === 'cancelled' || status === 'Отменён' || status === 'Отменен';
}

async function _loadWarehouseContext() {
  let warehousePaused = false;
  let primaryWarehouseId = '';
  const pausedWhIds = new Set();
  const warehouseNames = {}; // id -> name (для истории движений)
  try {
    const settingsSnap = await db.collection('settings').doc('warehouse').get();
    if (settingsSnap.exists) {
      const s = settingsSnap.data() || {};
      warehousePaused = s.paused === true;
      primaryWarehouseId = s.primaryWarehouseId || '';
    }
  } catch (e) {
    console.warn('[StockDeduct] settings/warehouse:', e.message);
  }
  try {
    const whSnap = await db.collection('warehouses').get();
    whSnap.forEach((d) => {
      const data = d.data() || {};
      if (data.paused === true) pausedWhIds.add(d.id);
      warehouseNames[d.id] = data.name || '';
    });
  } catch (e) {
    console.warn('[StockDeduct] warehouses:', e.message);
  }
  return { warehousePaused, primaryWarehouseId, pausedWhIds, warehouseNames };
}

/**
 * Claim заказа на списание. Возвращает:
 *   'proceed' | 'skip' | 'busy'
 */
async function _claimOrderForStockDeduction(orderRef) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return 'skip';
    const d = snap.data() || {};

    // Готово полностью — больше не трогаем.
    // ВАЖНО: stockDeducted===true сам по себе НЕ skip:
    // при частичном сбое флаг уже true, а часть товаров ещё не списана —
    // retry должен досписывать оставшиеся (по stockDeductionProcessedIds).
    if (d.stockDeductionStatus === 'done'
        || d.stockDeductionStatus === 'skipped'
        || d.stockDeductionStatus === 'skipped_cancelled'
        || d.stockDeductionStatus === 'skipped_unfulfilled') {
      return 'skip';
    }

    if (_isCancelledStatus(d.status)) {
      // Если уже что-то списали — не помечаем skipped здесь:
      // processOrderStockDeduction вернёт товар. Если ещё ничего —
      // можно сразу выйти.
      if (d.stockDeducted !== true
          && !(Array.isArray(d.stockDeductedProductIds) && d.stockDeductedProductIds.length)) {
        tx.update(orderRef, {
          stockDeductionStatus: 'skipped',
          stockDeductionFinishedAt: Date.now()
        });
        return 'skip';
      }
      // Есть частичное списание при отмене — proceed, чтобы вернуть остатки
    }

    if (d.stockDeductionStatus === 'processing') {
      const started = typeof d.stockDeductionStartedAt === 'number' ? d.stockDeductionStartedAt : 0;
      if (Date.now() - started < STOCK_CLAIM_STALE_MS) return 'busy';
    }

    tx.update(orderRef, {
      stockDeductionStatus: 'processing',
      stockDeductionStartedAt: Date.now(),
      stockDeductionError: admin.firestore.FieldValue.delete()
    });
    return 'proceed';
  });
}

/**
 * Списание одного товара (транзакция). Возвращает map warehouseId→qty или null
 * если товар без учёта остатка / склад на паузе.
 *
 * meta = { orderId, orderShortId, customerName, customerPhone, address, productTitle }
 * — используется для записи в warehouseMovements (история продаж).
 */
async function _deductOneProduct(productId, needQty, ctx, meta) {
  const need = Math.max(0, Math.floor(needQty || 0));
  if (!productId || need <= 0) return null;

  const productRef = db.collection('products').doc(productId);
  meta = meta || {};

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists) return null;
    const product = snap.data() || {};

    if (typeof product.stock !== 'number' || !isFinite(product.stock)) return null;

    const ws = product.warehouseStock;
    const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;

    // Защитная сеть: если товар распродан (stock<=0) и склад не разбит по
    // warehouseStock — пропускаем списание (не уходим в отрицательный сток).
    // На клиенте getEffectiveStock() теперь блокирует такие товары, но
    // на случай race-condition (два заказа одновременно на последнюю единицу)
    // или устаревшего кэша у клиента — тут финальный барьер.
    if (product.stock <= 0 && !hasWarehouseSetup) {
      console.warn('[StockDeduct] skip productId=' + productId +
        ' — stock уже 0 без warehouseStock (возможен oversell). need=' + need);
      return null;
    }

    // Глобальная или индивидуальная пауза — не списываем
    if (ctx.warehousePaused) return null;
    if (hasWarehouseSetup) {
      for (const whId of Object.keys(ws)) {
        if (ctx.pausedWhIds.has(whId)) return null;
      }
    }

    const title = product.title || meta.productTitle || '';

    if (!hasWarehouseSetup) {
      // Защита от ухода stock в минус: списываем только то что реально есть.
      // Если клиент заказал больше — логируем oversell, но stock не станет
      // отрицательным.
      const available = Math.max(0, Math.floor(product.stock));
      const actualDeduct = Math.min(available, need);
      if (actualDeduct < need) {
        console.warn('[StockDeduct] OVERSELL productId=' + productId +
          ' need=' + need + ' available=' + available +
          ' shortfall=' + (need - actualDeduct));
      }
      if (actualDeduct <= 0) {
        // Ничего не осталось для списания — просто выходим.
        return null;
      }
      tx.update(productRef, {
        stock: admin.firestore.FieldValue.increment(-actualDeduct)
      });
      // Одна запись движения без разбивки по складам.
      // ID детерминирован → повторный запуск не создаст дубль.
      if (meta.orderId) {
        const movRef = db.collection('warehouseMovements').doc(`sale_${meta.orderId}_${productId}`);
        tx.set(movRef, {
          type: 'sale',
          direction: 'out',
          productId,
          productTitle: title,
          warehouseId: '',
          warehouseName: '',
          qty: actualDeduct,
          orderId: meta.orderId,
          customerName: meta.customerName || '',
          customerPhone: meta.customerPhone || '',
          address: meta.address || '',
          note: `Продажа по заказу #${meta.orderShortId || meta.orderId.slice(-6)}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAtMs: Date.now()
        });
      }
      return {};
    }

    let remaining = need;
    const updatedWs = { ...ws };
    const itemDeductions = {};
    const primaryId = ctx.primaryWarehouseId;

    if (primaryId && (updatedWs[primaryId] || 0) > 0 && !ctx.pausedWhIds.has(primaryId)) {
      const deduct = Math.min(remaining, updatedWs[primaryId]);
      updatedWs[primaryId] -= deduct;
      remaining -= deduct;
      itemDeductions[primaryId] = deduct;
    }

    if (remaining > 0) {
      const otherWh = Object.entries(updatedWs)
        .filter(([whId, qty]) => qty > 0 && whId !== primaryId && !ctx.pausedWhIds.has(whId))
        .sort((a, b) => b[1] - a[1]);
      for (const [whId, whQty] of otherWh) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, whQty);
        updatedWs[whId] = whQty - deduct;
        remaining -= deduct;
        itemDeductions[whId] = (itemDeductions[whId] || 0) + deduct;
      }
    }

    // Если складов не хватило (oversell / гонка) — НЕ уводим ни один склад
    // в отрицательный остаток. Просто логируем, что реально списали меньше
    // чем заказано. itemDeductions уже содержит только то что реально ушло
    // со складов — правильно для возврата при отмене.
    if (remaining > 0) {
      console.warn('[StockDeduct] OVERSELL productId=' + productId +
        ' need=' + need + ' shortfall=' + remaining +
        ' (склады до списания: ' + JSON.stringify(ws) + ')');
      // remaining оставляем > 0 только для лога — списывать больше нечего.
    }

    const newTotal = Object.values(updatedWs).reduce((s, v) => s + (Number(v) || 0), 0);
    tx.update(productRef, {
      warehouseStock: updatedWs,
      stock: newTotal
    });

    // Запись истории — по одной строке на каждый склад.
    // Детерминированный ID = защита от дублей при retry.
    if (meta.orderId) {
      for (const [whId, qty] of Object.entries(itemDeductions)) {
        if (!qty) continue;
        const movRef = db.collection('warehouseMovements').doc(`sale_${meta.orderId}_${productId}_${whId}`);
        tx.set(movRef, {
          type: 'sale',
          direction: 'out',
          productId,
          productTitle: title,
          warehouseId: whId,
          warehouseName: (ctx.warehouseNames && ctx.warehouseNames[whId]) || '',
          qty,
          orderId: meta.orderId,
          customerName: meta.customerName || '',
          customerPhone: meta.customerPhone || '',
          address: meta.address || '',
          note: `Продажа по заказу #${meta.orderShortId || meta.orderId.slice(-6)}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAtMs: Date.now()
        });
      }
    }
    return itemDeductions;
  });
}

/**
 * Вернуть товар на склад (если заказ отменили пока шло списание).
 */
async function _returnDeductions(warehouseDeductions) {
  if (!warehouseDeductions || typeof warehouseDeductions !== 'object') return;
  const entries = Object.entries(warehouseDeductions);
  for (const [productId, byWh] of entries) {
    if (!byWh || typeof byWh !== 'object') continue;
    const productRef = db.collection('products').doc(productId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists) return;
      const product = snap.data() || {};
      const ws = { ...(product.warehouseStock || {}) };
      let returned = 0;
      for (const [whId, qty] of Object.entries(byWh)) {
        const q = Math.max(0, Math.floor(qty || 0));
        if (q <= 0) continue;
        ws[whId] = (ws[whId] || 0) + q;
        returned += q;
      }
      if (returned <= 0) return;
      if (product.warehouseStock && typeof product.warehouseStock === 'object'
          && Object.keys(product.warehouseStock).length > 0) {
        const newTotal = Object.values(ws).reduce((s, v) => s + (Number(v) || 0), 0);
        tx.update(productRef, { warehouseStock: ws, stock: newTotal });
      } else {
        tx.update(productRef, {
          stock: admin.firestore.FieldValue.increment(returned)
        });
      }
    });
  }
}

/**
 * Основная обработка списания для одного заказа.
 * Бросает ошибку при сбое — Firebase / scheduler повторит.
 * Идемпотентна по товарам: уже списанные позиции не трогаем повторно.
 */
async function processOrderStockDeduction(orderId, orderDataHint) {
  const orderRef = db.collection('orders').doc(orderId);
  const claim = await _claimOrderForStockDeduction(orderRef);
  if (claim === 'skip' || claim === 'busy') {
    console.log(`[StockDeduct] ${orderId}: ${claim}`);
    return;
  }

  let orderData = orderDataHint;
  try {
    const fresh = await orderRef.get();
    if (fresh.exists) orderData = fresh.data();
  } catch (e) { /* используем hint */ }

  const items = (orderData && Array.isArray(orderData.items)) ? orderData.items : [];
  if (!items.length) {
    await orderRef.update({
      stockDeducted: false,
      stockDeductionStatus: 'skipped',
      stockDeductionFinishedAt: Date.now(),
      warehouseDeductions: null
    });
    return;
  }

  const ctx = await _loadWarehouseContext();
  const warehouseDeductions = Object.assign(
    {},
    (orderData.warehouseDeductions && typeof orderData.warehouseDeductions === 'object')
      ? orderData.warehouseDeductions
      : {}
  );
  // processed = уже прошли (в т.ч. безлимит); deducted = реально списали
  const processedIds = new Set(
    Array.isArray(orderData.stockDeductionProcessedIds)
      ? orderData.stockDeductionProcessedIds
      : (Array.isArray(orderData.stockDeductedProductIds) ? orderData.stockDeductedProductIds : [])
  );
  const deductedIds = new Set(
    Array.isArray(orderData.stockDeductedProductIds)
      ? orderData.stockDeductedProductIds
      : Object.keys(warehouseDeductions)
  );
  let anyDeducted = orderData.stockDeducted === true || deductedIds.size > 0;

  // Мета для записи истории продаж (warehouseMovements).
  const meta = {
    orderId,
    orderShortId: orderId.slice(-6),
    customerName: orderData.name || '',
    customerPhone: orderData.phone || '',
    address: orderData.address || ''
  };

  // Последовательно — транзакции Firestore; надёжнее параллели при лимитах
  for (const item of items) {
    if (!item || !item.id) continue;
    if (processedIds.has(item.id)) continue;
    const qty = Math.max(0, Math.floor(item.qty || 0));
    if (qty <= 0) {
      processedIds.add(item.id);
      await orderRef.update({
        stockDeductionProcessedIds: admin.firestore.FieldValue.arrayUnion(item.id)
      }).catch(() => {});
      continue;
    }
    try {
      const ded = await _deductOneProduct(item.id, qty, ctx, Object.assign({}, meta, {
        productTitle: item.title || ''
      }));
      processedIds.add(item.id);
      if (ded === null) {
        // Товар без учёта / пауза — только прогресс, без списания
        await orderRef.update({
          stockDeductionProcessedIds: admin.firestore.FieldValue.arrayUnion(item.id)
        });
        continue;
      }
      anyDeducted = true;
      deductedIds.add(item.id);
      if (ded && Object.keys(ded).length > 0) {
        warehouseDeductions[item.id] = ded;
        await orderRef.update({
          stockDeductionProcessedIds: admin.firestore.FieldValue.arrayUnion(item.id),
          stockDeductedProductIds: admin.firestore.FieldValue.arrayUnion(item.id),
          [`warehouseDeductions.${item.id}`]: ded,
          stockDeducted: true
        });
      } else {
        // Списали только общий stock без разбивки по складам
        await orderRef.update({
          stockDeductionProcessedIds: admin.firestore.FieldValue.arrayUnion(item.id),
          stockDeductedProductIds: admin.firestore.FieldValue.arrayUnion(item.id),
          stockDeducted: true
        });
      }
    } catch (e) {
      console.error(`[StockDeduct] товар ${item.id}:`, e.message);
      await orderRef.update({
        stockDeductionStatus: 'failed',
        stockDeductionError: String(e.message || e).slice(0, 500),
        stockDeductionFinishedAt: Date.now(),
        warehouseDeductions: Object.keys(warehouseDeductions).length > 0 ? warehouseDeductions : null
      }).catch(() => {});
      throw e;
    }
  }

  // Финализация: если заказ уже отменили — вернём то, что списали
  let needReturn = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const d = snap.data() || {};
    if (d.stockDeductionStatus === 'done' || d.stockDeductionStatus === 'skipped'
        || d.stockDeductionStatus === 'skipped_cancelled') return;

    const finalDeductions = Object.keys(warehouseDeductions).length > 0 ? warehouseDeductions : null;

    if (_isCancelledStatus(d.status)) {
      tx.update(orderRef, {
        stockDeducted: anyDeducted,
        stockDeductionStatus: anyDeducted ? 'done' : 'skipped',
        warehouseDeductions: finalDeductions,
        stockDeductionFinishedAt: Date.now()
      });
      needReturn = anyDeducted;
      return;
    }

    tx.update(orderRef, {
      stockDeducted: anyDeducted,
      stockDeductionStatus: anyDeducted ? 'done' : 'skipped',
      warehouseDeductions: finalDeductions,
      stockDeductionFinishedAt: Date.now()
    });
  });

  if (needReturn) {
    console.log(`[StockDeduct] ${orderId}: заказ отменён во время списания — возвращаем`);
    await _returnDeductions(warehouseDeductions);
    // Товары без warehouseDeductions (только increment stock)
    for (const item of items) {
      if (!item || !item.id || !deductedIds.has(item.id)) continue;
      if (warehouseDeductions[item.id]) continue;
      const qty = Math.max(0, Math.floor(item.qty || 0));
      if (qty <= 0) continue;
      try {
        await db.collection('products').doc(item.id).update({
          stock: admin.firestore.FieldValue.increment(qty)
        });
      } catch (e) {
        console.warn(`[StockDeduct] return increment ${item.id}:`, e.message);
      }
    }
    await orderRef.update({
      warehouseDeductions: {},
      stockDeducted: false,
      stockDeductionStatus: 'skipped_cancelled'
    }).catch(() => {});
  }

  console.log(`[StockDeduct] ${orderId}: ${anyDeducted ? 'done' : 'skipped'} (${items.length} позиций)`);
}

// Максимальный возраст события, при котором CF ещё пытается повторить.
// Firebase v1 по умолчанию не ретраит — включён failurePolicy: true.
// Если событие старше — прекращаем повторы, чтобы не жечь деньги вечно.
const MAX_EVENT_AGE_MS = 30 * 60 * 1000; // 30 минут

exports.deductStockOnOrderCreate = functions
  .runWith({
    // ВКЛЮЧАЕМ ретрай: без него разовый сбой Firestore = склад не списан.
    // Идемпотентность защищена: claim + stockDeductionProcessedIds.
    failurePolicy: true,
    timeoutSeconds: 120,
    memory: '256MB'
  })
  .firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    const orderId = context.params.orderId;
    const data = snap.data() || {};

    // Если событие слишком старое — не повторяем (защита от бесконечных retry).
    // Заказ можно будет обработать вручную через админ-панель.
    try {
      const ts = context.timestamp ? Date.parse(context.timestamp) : Date.now();
      if (isFinite(ts) && (Date.now() - ts) > MAX_EVENT_AGE_MS) {
        console.warn(`[StockDeduct] ${orderId}: событие старше ${MAX_EVENT_AGE_MS}ms, пропускаем retry`);
        await db.collection('orders').doc(orderId).update({
          stockDeductionStatus: 'failed',
          stockDeductionError: 'retry_expired',
          stockDeductionFinishedAt: Date.now()
        }).catch(() => {});
        return null;
      }
    } catch (e) { /* если не смогли распарсить — продолжаем */ }

    // Только полностью завершённые статусы — выход.
    // stockDeducted===true без done — частичный прогресс, его дожимает retry.
    if (data.stockDeductionStatus === 'done'
        || data.stockDeductionStatus === 'skipped'
        || data.stockDeductionStatus === 'skipped_cancelled'
        || data.stockDeductionStatus === 'skipped_unfulfilled') {
      return null;
    }

    // Unfulfilled-заявка: клиент оформил заказ когда все товары были
    // распроданы. Склад трогать НЕ НАДО (списывать нечего). Помечаем,
    // что списание сознательно пропущено, чтобы retry больше не заходил.
    if (data.status === 'unfulfilled') {
      try {
        await db.collection('orders').doc(orderId).update({
          stockDeductionStatus: 'skipped_unfulfilled',
          stockDeductionFinishedAt: Date.now()
        });
      } catch (e) {
        console.warn('[StockDeduct] не смогли пометить unfulfilled:', e.message);
      }
      return null;
    }

    try {
      await processOrderStockDeduction(orderId, data);
    } catch (e) {
      console.error(`[StockDeduct] onCreate ${orderId}:`, e.message);
      // Пробрасываем — Firebase повторит триггер (failurePolicy=true)
      throw e;
    }
    return null;
  });

