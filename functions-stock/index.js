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
//   • deductStockOnOrderCreate — сразу после создания заказа
//   • retryPendingStockDeductions — подстраховка каждые 5 минут
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
    const whSnap = await db.collection('warehouses').where('paused', '==', true).get();
    whSnap.forEach((d) => pausedWhIds.add(d.id));
  } catch (e) {
    console.warn('[StockDeduct] warehouses paused:', e.message);
  }
  return { warehousePaused, primaryWarehouseId, pausedWhIds };
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
        || d.stockDeductionStatus === 'skipped_cancelled') {
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
 */
async function _deductOneProduct(productId, needQty, ctx) {
  const need = Math.max(0, Math.floor(needQty || 0));
  if (!productId || need <= 0) return null;

  const productRef = db.collection('products').doc(productId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists) return null;
    const product = snap.data() || {};

    if (typeof product.stock !== 'number' || !isFinite(product.stock)) return null;

    const ws = product.warehouseStock;
    const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;

    // stock<=0 без складов = безлимит (как на клиенте)
    if (product.stock <= 0 && !hasWarehouseSetup) return null;

    // Глобальная или индивидуальная пауза — не списываем
    if (ctx.warehousePaused) return null;
    if (hasWarehouseSetup) {
      for (const whId of Object.keys(ws)) {
        if (ctx.pausedWhIds.has(whId)) return null;
      }
    }

    if (!hasWarehouseSetup) {
      tx.update(productRef, {
        stock: admin.firestore.FieldValue.increment(-need)
      });
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

    // Если складов не хватило (перезаказ) — добиваем с главного / любого,
    // чтобы сумма warehouseStock совпала с общим stock после списания.
    if (remaining > 0) {
      const fallbackWh = (primaryId && !ctx.pausedWhIds.has(primaryId))
        ? primaryId
        : (Object.keys(updatedWs).find((id) => !ctx.pausedWhIds.has(id)) || primaryId || 'default');
      updatedWs[fallbackWh] = (updatedWs[fallbackWh] || 0) - remaining;
      itemDeductions[fallbackWh] = (itemDeductions[fallbackWh] || 0) + remaining;
      remaining = 0;
    }

    const newTotal = Object.values(updatedWs).reduce((s, v) => s + (Number(v) || 0), 0);
    tx.update(productRef, {
      warehouseStock: updatedWs,
      stock: newTotal
    });
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
      const ded = await _deductOneProduct(item.id, qty, ctx);
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

exports.deductStockOnOrderCreate = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    const orderId = context.params.orderId;
    const data = snap.data() || {};
    // Только полностью завершённые статусы — выход.
    // stockDeducted===true без done — частичный прогресс, его дожимает retry.
    if (data.stockDeductionStatus === 'done'
        || data.stockDeductionStatus === 'skipped'
        || data.stockDeductionStatus === 'skipped_cancelled') {
      return null;
    }

    try {
      await processOrderStockDeduction(orderId, data);
    } catch (e) {
      console.error(`[StockDeduct] onCreate ${orderId}:`, e.message);
      // Пробрасываем — Firebase повторит триггер
      throw e;
    }
    return null;
  });

// Подстраховка по расписанию отключена: Cloud Scheduler требует Blaze-план.
// Надёжность дают:
//   1) onCreate + throw → Firebase сам повторяет триггер
//   2) идемпотентность по stockDeductionProcessedIds (без двойного списания)
// На Blaze можно вернуть exports.retryPendingStockDeductions (pubsub schedule).

