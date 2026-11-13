// Kerben — склад: гарантированное списание при заказе (отдельный codebase без secrets)
const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const CostLayers = require('./cost-layers');

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

// Варианты одного товара (цвет, размер) лежат в заказе отдельными строками
// с одним id. Результаты списания, warehouseDeductions и id записей истории
// ведутся по товару — без суммирования строки затирали друг друга, и при
// отмене возвращалась только последняя.
function _aggregateItems(items) {
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((i) => {
    if (!i || !i.id) return;
    const qty = Math.max(0, Math.floor(i.qty || 0));
    const cur = byId.get(i.id);
    if (cur) cur.qty += qty;
    else byId.set(i.id, { id: i.id, qty, title: i.title || '' });
  });
  return Array.from(byId.values());
}

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
    if ((d.stockDeductionStatus === 'done' || d.stockDeductionStatus === 'done_with_shortage')
        && d.orderKind === 'agent_purchase'
        && d.agentInventoryApplied !== true) {
      return 'credit_only';
    }

    if (d.stockDeductionStatus === 'done'
        || d.stockDeductionStatus === 'done_with_shortage'
        || d.stockDeductionStatus === 'shortage'
        || d.stockDeductionStatus === 'skipped'
        || d.stockDeductionStatus === 'skipped_cancelled'
        || d.stockDeductionStatus === 'skipped_unfulfilled'
        || d.stockDeductionStatus === 'skipped_agent_sale') {
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
  if (!productId || need <= 0) return { deductions: null, shortage: 0, productExists: !!productId };

  const productRef = db.collection('products').doc(productId);
  meta = meta || {};

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists) {
      return { deductions: null, shortage: need, productExists: false, reason: 'product_deleted' };
    }
    const product = snap.data() || {};

    if (typeof product.stock !== 'number' || !isFinite(product.stock)) {
      return { deductions: null, shortage: 0, productExists: true, reason: 'no_stock_tracking' };
    }

    const ws = product.warehouseStock;
    const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;

    // Защитная сеть: если товар распродан (stock<=0) и склад не разбит по
    // warehouseStock — пропускаем списание (не уходим в отрицательный сток).
    if (product.stock <= 0 && !hasWarehouseSetup) {
      console.warn('[StockDeduct] OVERSELL productId=' + productId +
        ' — stock уже 0 без warehouseStock. need=' + need);
      return { deductions: null, shortage: need, productExists: true, reason: 'out_of_stock' };
    }

    // Глобальная пауза всей системы складов → безлимит, не списываем.
    if (ctx.warehousePaused) {
      return { deductions: null, shortage: 0, productExists: true, reason: 'warehouse_paused' };
    }

    const title = product.title || meta.productTitle || '';

    if (!hasWarehouseSetup) {
      // Защита от ухода stock в минус: списываем только то что реально есть.
      const available = Math.max(0, Math.floor(product.stock));
      const actualDeduct = Math.min(available, need);
      const shortage = need - actualDeduct;
      if (shortage > 0) {
        console.warn('[StockDeduct] OVERSELL productId=' + productId +
          ' need=' + need + ' available=' + available + ' shortfall=' + shortage);
      }
      if (actualDeduct <= 0) {
        return { deductions: null, shortage: need, productExists: true, reason: 'out_of_stock' };
      }
      const appliedFlat = CostLayers.applyDelta(product, available, -actualDeduct, product.costPrice);
      const flatPatch = {
        stock: available - actualDeduct,
        costLayers: appliedFlat.layers
      };
      let releasedHold = null;
      if (flatPatch.stock === 0) {
        const released = CostLayers.releaseWaiting(Object.assign({}, product, flatPatch));
        if (released) {
          releasedHold = released.released;
          delete released.released;
          Object.assign(flatPatch, released);
        }
      }
      tx.update(productRef, flatPatch);
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
      return {
        deductions: {},
        shortage,
        productExists: true,
        reason: shortage > 0 ? 'partial_stock' : 'ok',
        actualDeduct,
        costTaken: appliedFlat.costTaken,
        costAvg: appliedFlat.avg,
        releasedHold: releasedHold
      };
    }

    let remaining = need;
    const updatedWs = { ...ws };
    const itemDeductions = {};
    const primaryId = ctx.primaryWarehouseId;
    const pausedSet = ctx.pausedWhIds || new Set();
    const primaryActive = !!(primaryId && !pausedSet.has(primaryId));

    if (primaryActive) {
      // Склады изолированы: продаём только с главного, чужой остаток не трогаем.
      const have = Math.max(0, Math.floor(updatedWs[primaryId] || 0));
      const deduct = Math.min(remaining, have);
      if (deduct > 0) {
        updatedWs[primaryId] = have - deduct;
        remaining -= deduct;
        itemDeductions[primaryId] = deduct;
      }
    } else {
      // Главный на паузе / не задан — списываем только с других АКТИВНЫХ складов.
      const otherWh = Object.entries(updatedWs)
        .filter(([whId, qty]) => qty > 0 && !pausedSet.has(whId))
        .sort((a, b) => b[1] - a[1]);
      for (const [whId, whQty] of otherWh) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, Math.max(0, Math.floor(whQty)));
        updatedWs[whId] = (updatedWs[whId] || 0) - deduct;
        remaining -= deduct;
        itemDeductions[whId] = (itemDeductions[whId] || 0) + deduct;
      }
    }

    // Если складов не хватило (oversell / гонка) — НЕ уводим ни один склад
    // в отрицательный остаток. Просто логируем, что реально списали меньше.
    const shortage = remaining > 0 ? remaining : 0;
    if (shortage > 0) {
      console.warn('[StockDeduct] OVERSELL productId=' + productId +
        ' need=' + need + ' shortfall=' + shortage +
        ' (склады до списания: ' + JSON.stringify(ws) + ')');
    }

    const newTotal = Object.values(updatedWs).reduce((s, v) => s + (Number(v) || 0), 0);
    const totalDeductedNow = Object.values(itemDeductions).reduce((s, v) => s + (Number(v) || 0), 0);
    const appliedWh = CostLayers.applyDelta(product, newTotal + totalDeductedNow, -totalDeductedNow, product.costPrice);
    const whPatch = {
      warehouseStock: updatedWs,
      stock: newTotal,
      costLayers: appliedWh.layers
    };
    let releasedHoldWh = null;
    const siteLeft = (primaryActive && primaryId)
      ? Math.max(0, Math.floor(Number(updatedWs[primaryId]) || 0))
      : newTotal;
    if (siteLeft === 0) {
      const released = CostLayers.releaseWaiting(Object.assign({}, product, whPatch), siteLeft);
      if (released) {
        releasedHoldWh = released.released;
        delete released.released;
        Object.assign(whPatch, released);
      }
    }
    tx.update(productRef, whPatch);

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
    const totalDeducted = Object.values(itemDeductions).reduce((s, v) => s + (Number(v) || 0), 0);
    return {
      deductions: itemDeductions,
      shortage,
      productExists: true,
      actualDeduct: totalDeducted,
      costTaken: appliedWh.costTaken,
      costAvg: appliedWh.avg,
      releasedHold: releasedHoldWh,
      reason: shortage > 0 ? (totalDeducted === 0 ? 'out_of_stock' : 'partial_stock') : 'ok'
    };
  });
}

/**
 * Вернуть товар на склад (если заказ отменили пока шло списание).
 */
async function _returnDeductions(warehouseDeductions, costAllocations) {
  if (!warehouseDeductions || typeof warehouseDeductions !== 'object') return;
  const allocs = (costAllocations && typeof costAllocations === 'object') ? costAllocations : {};
  const entries = Object.entries(warehouseDeductions);
  for (const [productId, byWh] of entries) {
    if (!byWh || typeof byWh !== 'object') continue;
    const productRef = db.collection('products').doc(productId);
    const taken = Array.isArray(allocs[productId]) ? allocs[productId] : [];
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
      const hasWarehouse = product.warehouseStock && typeof product.warehouseStock === 'object'
          && Object.keys(product.warehouseStock).length > 0;
      if (hasWarehouse) {
        const before = CostLayers.stockOf(product);
        const newTotal = Object.values(ws).reduce((s, v) => s + (Number(v) || 0), 0);
        tx.update(productRef, {
          warehouseStock: ws,
          stock: newTotal,
          costLayers: CostLayers.withRestore(product, before, newTotal, taken)
        });
      } else if (typeof product.stock === 'number') {
        const before = Math.max(0, Math.floor(product.stock));
        const next = before + returned;
        tx.update(productRef, {
          stock: next,
          costLayers: CostLayers.withRestore(product, before, next, taken)
        });
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
function _agentInventoryRef(agentId, productId) {
  return db.collection('agentInventory').doc(String(agentId)).collection('items').doc(String(productId));
}

// Покупка агента: в остаток попадает только то количество, которое реально
// списано со склада KERBEN. Повторный запуск не прибавляет второй раз.
async function creditAgentPurchase(orderId, orderData, items, deductedIds, shortages) {
  const agentId = String((orderData && (orderData.agentId || orderData.placedByAgentId)) || '');
  if (!agentId) return;
  const orderRef = db.collection('orders').doc(orderId);
  const shortageById = {};
  (Array.isArray(shortages) ? shortages : []).forEach((s) => {
    if (s && s.productId) shortageById[s.productId] = s;
  });
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || !item.id || !deductedIds || !deductedIds.has(item.id)) return;
    const id = String(item.id);
    const prev = byId.get(id) || {
      id, qty: 0, title: item.title || '', image: item.image || null, buyPrice: Number(item.price) || 0
    };
    if (!prev.title && item.title) prev.title = item.title;
    if (!prev.image && item.image) prev.image = item.image;
    if (!(prev.buyPrice > 0) && Number(item.price) > 0) prev.buyPrice = Number(item.price);
    byId.set(id, prev);
  });
  const credits = [];
  byId.forEach((row) => {
    const sh = shortageById[row.id];
    const requested = Math.max(0, Math.floor(Number(
      (Array.isArray(items) ? items : []).reduce((sum, item) => {
        return item && String(item.id) === row.id ? sum + (Number(item.qty) || 0) : sum;
      }, 0)
    )));
    const qty = sh
      ? Math.max(0, Math.floor(Number(sh.deducted) || 0))
      : requested;
    if (qty <= 0) return;
    row.qty = qty;
    credits.push(row);
  });
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) return;
    if (orderSnap.data().agentInventoryApplied === true) return;
    const refs = credits.map((c) => _agentInventoryRef(agentId, c.id));
    const productRefs = credits.map((c) => db.collection('products').doc(c.id));
    const snaps = [];
    const productSnaps = [];
    for (let i = 0; i < refs.length; i++) {
      snaps.push(await tx.get(refs[i]));
      productSnaps.push(await tx.get(productRefs[i]));
    }
    const creditMap = {};
    snaps.forEach((snap, i) => {
      const c = credits[i];
      const prev = snap.exists ? (snap.data() || {}) : {};
      const product = productSnaps[i].exists ? (productSnaps[i].data() || {}) : {};
      const live = Number(product.price);
      const buy = isFinite(live) && live >= 0 ? live : c.buyPrice;
      const prevQty = Math.max(0, Math.floor(Number(prev.qty) || 0));
      const prevBuy = Number(prev.buyPrice);
      const nextQty = prevQty + c.qty;
      const avg = nextQty > 0
        ? ((prevQty * (isFinite(prevBuy) ? prevBuy : buy)) + (c.qty * buy)) / nextQty
        : buy;
      creditMap[c.id] = c.qty;
      tx.set(refs[i], {
        productId: c.id,
        title: product.title || c.title || prev.title || '',
        image: product.image || c.image || prev.image || null,
        buyPrice: Math.round(avg * 100) / 100,
        qty: nextQty,
        markupPercent: (typeof prev.markupPercent === 'number') ? prev.markupPercent : 0,
        updatedAt: Date.now()
      }, { merge: true });
    });
    const orderNow = orderSnap.data() || {};
    const pricedOnce = {};
    const pricedItems = (Array.isArray(orderNow.items) ? orderNow.items : []).map((item) => {
      const id = item && item.id != null ? String(item.id) : '';
      if (!item || !creditMap[id] || pricedOnce[id]) return Object.assign({}, item, { qty: 0 });
      pricedOnce[id] = true;
      const product = productSnaps[credits.findIndex((c) => c.id === id)];
      const live = product && product.exists ? Number((product.data() || {}).price) : NaN;
      const price = isFinite(live) && live >= 0 ? live : item.price;
      return Object.assign({}, item, { price: price, qty: creditMap[id] });
    });
    const total = pricedItems.reduce((sum, item) => {
      return sum + (Number(item && item.qty) || 0) * (Number(item && item.price) || 0);
    }, 0);
    tx.set(orderRef, {
      agentInventoryApplied: true,
      agentInventoryCredit: creditMap,
      items: pricedItems,
      total: Math.round(total * 100) / 100
    }, { merge: true });
  });
}

// Продажа агента: списывается только его остаток. Склад KERBEN не читается на запись.
async function settleAgentSale(orderId, orderData) {
  const orderRef = db.collection('orders').doc(orderId);
  const agentId = String((orderData && (orderData.agentId || orderData.placedByAgentId)) || '');
  const rawItems = Array.isArray(orderData && orderData.items) ? orderData.items : [];
  const items = _aggregateItems(rawItems);
  if (!agentId || !items.length) {
    await orderRef.set({
      stockDeducted: false,
      stockDeductionStatus: 'skipped_agent_sale',
      stockDeductionError: 'agent_sale_without_agent',
      agentSaleRejected: true,
      status: 'cancelled',
      stockDeductionFinishedAt: Date.now()
    }, { merge: true });
    return;
  }
  try {
    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) return;
      const od = orderSnap.data() || {};
      if (od.agentInventoryApplied === true || od.agentSaleRejected === true) return;
      if (od.stockDeductionStatus === 'skipped_agent_sale') return;
      const refs = items.map((item) => _agentInventoryRef(agentId, item.id));
      const snaps = [];
      for (let i = 0; i < refs.length; i++) snaps.push(await tx.get(refs[i]));
      const next = [];
      let total = 0;
      const priced = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const snap = snaps[i];
        const prev = snap.exists ? (snap.data() || {}) : {};
        const have = Math.max(0, Math.floor(Number(prev.qty) || 0));
        const need = Math.max(0, Math.floor(Number(item.qty) || 0));
        if (need <= 0) continue;
        if (need > have) {
          const err = new Error('Недостаточно остатка агента: ' + (item.title || prev.title || item.id));
          err.agentStock = true;
          throw err;
        }
        const pct = Number(prev.markupPercent);
        const percent = isFinite(pct) && pct > 0 ? Math.min(pct, 500) : 0;
        const buy = Number(prev.buyPrice) || 0;
        const sale = Math.round(buy * (100 + percent) / 100);
        next.push({ ref: refs[i], qty: have - need });
        total += sale * need;
        priced.push({
          id: item.id,
          title: prev.title || item.title || '',
          image: prev.image || null,
          qty: need,
          price: sale,
          basePrice: buy,
          markupPercent: percent
        });
      }
      next.forEach((row) => {
        tx.update(row.ref, { qty: row.qty, updatedAt: Date.now() });
      });
      tx.set(orderRef, {
        items: priced,
        total: total,
        agentInventoryApplied: true,
        stockDeducted: false,
        stockDeductionStatus: 'skipped_agent_sale',
        stockDeductionFinishedAt: Date.now(),
        agentSaleRejected: false
      }, { merge: true });
    });
  } catch (e) {
    if (e && (e.agentStock || /Недостаточно остатка агента/.test(String(e.message || '')))) {
      await orderRef.set({
        status: 'cancelled',
        agentSaleRejected: true,
        stockDeducted: false,
        stockDeductionStatus: 'skipped_agent_sale',
        stockDeductionError: String(e.message || e).slice(0, 300),
        stockDeductionFinishedAt: Date.now()
      }, { merge: true });
      return;
    }
    throw e;
  }
}

async function processOrderStockDeduction(orderId, orderDataHint) {
  const orderRef = db.collection('orders').doc(orderId);
  if (orderDataHint && orderDataHint.orderKind === 'agent_sale') {
    await settleAgentSale(orderId, orderDataHint);
    return;
  }
  const claim = await _claimOrderForStockDeduction(orderRef);
  if (claim === 'credit_only') {
    const fresh = await orderRef.get();
    const live = fresh.exists ? (fresh.data() || {}) : (orderDataHint || {});
    const deductedIds = new Set(Array.isArray(live.stockDeductedProductIds) ? live.stockDeductedProductIds : []);
    await creditAgentPurchase(
      orderId,
      live,
      Array.isArray(live.items) ? live.items : [],
      deductedIds,
      Array.isArray(live.stockDeductionShortages) ? live.stockDeductionShortages : []
    );
    return;
  }
  if (claim === 'skip' || claim === 'busy') {
    console.log(`[StockDeduct] ${orderId}: ${claim}`);
    return;
  }

  let orderData = orderDataHint;
  try {
    const fresh = await orderRef.get();
    if (fresh.exists) orderData = fresh.data();
  } catch (e) { /* используем hint */ }

  const items = _aggregateItems(orderData && orderData.items);
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

  // Собираем недосписания — админ увидит их в интерфейсе.
  // Если orderData уже имеет прошлые shortages (после retry) — сохраняем.
  const shortages = Array.isArray(orderData.stockDeductionShortages)
    ? orderData.stockDeductionShortages.slice() : [];
  const shortageIds = new Set(shortages.map(s => s && s.productId).filter(Boolean));

  // ═════════════════════════════════════════════════════════════════════════
  // ПАРАЛЛЕЛЬНАЯ обработка товаров с ограничением concurrency=5.
  // Раньше был sequential for-of → заказ из 10 позиций = 10 транзакций
  // подряд = 5-10 сек. Теперь идут по 5 одновременно = в разы быстрее.
  // Транзакция сама повторяется при конфликте по документу — параллель
  // безопасна.
  // ═════════════════════════════════════════════════════════════════════════
  const CONCURRENCY = 5;
  const queue = items.filter(i => i && i.id && !processedIds.has(i.id));
  const results = new Map(); // itemId -> { deductions, shortage, reason, productTitle }
  const costByProduct = {}; // id -> { avg, taken } партии, списанные этим заказом

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      const qty = Math.max(0, Math.floor(item.qty || 0));
      if (qty <= 0) {
        results.set(item.id, { deductions: null, shortage: 0, reason: 'zero_qty', productTitle: item.title || '' });
        continue;
      }
      try {
        const res = await _deductOneProduct(item.id, qty, ctx, Object.assign({}, meta, {
          productTitle: item.title || ''
        }));
        results.set(item.id, Object.assign({ productTitle: item.title || '', requested: qty }, res));
      } catch (e) {
        results.set(item.id, { error: e, productTitle: item.title || '', requested: qty });
      }
    }
  }
  let releasedSale = false;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));

  // Собираем batch-обновление, чтобы не делать N update() последовательно
  const batchUpdate = {};
  const newProcessed = [];
  const newDeducted = [];
  let anyError = null;

  for (const item of items) {
    if (!item || !item.id) continue;
    if (processedIds.has(item.id)) continue;
    const res = results.get(item.id);
    if (!res) continue;
    if (res.error) { anyError = res.error; continue; }

    newProcessed.push(item.id);
    processedIds.add(item.id);

    const { deductions, shortage, reason, productTitle, requested, actualDeduct } = res;
    if (res.releasedHold) releasedSale = true;

    // Что-то реально ушло со склада (в warehouseStock ИЛИ общий stock)?
    const deductedFromWarehouse = deductions && Object.keys(deductions).length > 0;
    const deductedFromCommon = deductions && Object.keys(deductions).length === 0
      && typeof actualDeduct === 'number' && actualDeduct > 0;
    const wasDeducted = deductedFromWarehouse || deductedFromCommon;

    if (deductedFromWarehouse) {
      warehouseDeductions[item.id] = deductions;
      batchUpdate[`warehouseDeductions.${item.id}`] = deductions;
    }
    if (wasDeducted) {
      anyDeducted = true;
      deductedIds.add(item.id);
      newDeducted.push(item.id);
      if (Array.isArray(res.costTaken) && res.costTaken.length) {
        costByProduct[item.id] = { avg: res.costAvg || 0, taken: res.costTaken };
        batchUpdate['costAllocations.' + item.id] = res.costTaken;
      }
    }

    if (shortage > 0 && !shortageIds.has(item.id)) {
      shortages.push({
        productId: item.id,
        productTitle: productTitle || '',
        requested: requested || 0,
        deducted: (requested || 0) - shortage,
        shortage,
        reason: reason || 'unknown'
      });
      shortageIds.add(item.id);
    }
  }

  // Прогресс сохраняем ДО выхода с ошибкой: иначе retry не знает, какие
  // товары уже списаны, и списывает их повторно. Без catch — если прогресс
  // не записался, retry обязан начаться заново, а не идти дальше.
  if (releasedSale) {
    try {
      await db.collection('settings').doc('productsRevision').set({
        updatedAt: Date.now(),
        by: 'склад: новая цена продажи',
        source: 'functions-stock'
      }, { merge: true });
    } catch (e) {}
  }

  if (newProcessed.length > 0 || newDeducted.length > 0 || Object.keys(batchUpdate).length > 0) {
    const upd = Object.assign({}, batchUpdate);
    if (newProcessed.length > 0) {
      upd.stockDeductionProcessedIds = admin.firestore.FieldValue.arrayUnion(...newProcessed);
    }
    if (newDeducted.length > 0) {
      upd.stockDeductedProductIds = admin.firestore.FieldValue.arrayUnion(...newDeducted);
      upd.stockDeducted = true;
    }
    if (Object.keys(costByProduct).length > 0) {
      try {
        const freshOrder = await orderRef.get();
        const prevItems = (freshOrder.exists && Array.isArray(freshOrder.data().items))
          ? freshOrder.data().items : [];
        upd.items = prevItems.map((item) => {
          if (!item || !costByProduct[item.id]) return item;
          const c = costByProduct[item.id];
          const next = Object.assign({}, item, { costBreakdown: c.taken });
          if (c.avg > 0) next.costPrice = c.avg;
          return next;
        });
      } catch (e) {
        console.warn('[StockDeduct] не записали партии в заказ:', e.message);
      }
    }
    await orderRef.update(upd);
  }

  if (anyError) {
    console.error(`[StockDeduct] товар ошибка:`, anyError.message);
    await orderRef.update({
      stockDeductionStatus: 'failed',
      stockDeductionError: String(anyError.message || anyError).slice(0, 500),
      stockDeductionFinishedAt: Date.now()
    }).catch(() => {});
    throw anyError;
  }

  // Финализация: если заказ уже отменили — вернём то, что списали
  let needReturn = false;
  const hasShortage = shortages.length > 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const d = snap.data() || {};
    if (d.stockDeductionStatus === 'done' || d.stockDeductionStatus === 'skipped'
        || d.stockDeductionStatus === 'skipped_cancelled') return;

    const finalDeductions = Object.keys(warehouseDeductions).length > 0 ? warehouseDeductions : null;

    // Финальный статус:
    //   'done'              — всё списано без проблем
    //   'done_with_shortage'— часть списана, но были OVERSELL — АДМИН ДОЛЖЕН ВИДЕТЬ!
    //   'shortage'          — вообще ничего не списали, все товары OVERSELL
    //   'skipped'           — списывать было нечего (без учёта склада)
    let finalStatus;
    if (_isCancelledStatus(d.status)) {
      finalStatus = anyDeducted ? 'done' : 'skipped';
    } else if (anyDeducted && hasShortage) {
      finalStatus = 'done_with_shortage';
    } else if (!anyDeducted && hasShortage) {
      finalStatus = 'shortage';
    } else {
      finalStatus = anyDeducted ? 'done' : 'skipped';
    }

    const upd = {
      stockDeducted: anyDeducted,
      stockDeductionStatus: finalStatus,
      warehouseDeductions: finalDeductions,
      stockDeductionFinishedAt: Date.now()
    };
    if (hasShortage) {
      upd.stockDeductionShortages = shortages;
      upd.stockDeductionHasShortage = true;
    }

    if (_isCancelledStatus(d.status)) {
      needReturn = anyDeducted;
    }
    tx.update(orderRef, upd);
  });

  if (needReturn) {
    console.log(`[StockDeduct] ${orderId}: заказ отменён во время списания — возвращаем`);
    const allocForReturn = Object.assign(
      {},
      (orderData && orderData.costAllocations && typeof orderData.costAllocations === 'object')
        ? orderData.costAllocations : {},
      Object.keys(costByProduct).reduce((m, id) => { m[id] = costByProduct[id].taken; return m; }, {})
    );
    await _returnDeductions(warehouseDeductions, allocForReturn);
    // Товары без warehouseDeductions (только общий stock)
    for (const item of items) {
      if (!item || !item.id || !deductedIds.has(item.id)) continue;
      if (warehouseDeductions[item.id]) continue;
      const qty = Math.max(0, Math.floor(item.qty || 0));
      if (qty <= 0) continue;
      try {
        const productRef = db.collection('products').doc(item.id);
        const taken = Array.isArray(allocForReturn[item.id]) ? allocForReturn[item.id] : [];
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(productRef);
          if (!snap.exists) return;
          const product = snap.data() || {};
          if (typeof product.stock !== 'number') return;
          const before = Math.max(0, Math.floor(product.stock));
          const next = before + qty;
          tx.update(productRef, {
            stock: next,
            costLayers: CostLayers.withRestore(product, before, next, taken)
          });
        });
      } catch (e) {
        console.warn(`[StockDeduct] return increment ${item.id}:`, e.message);
      }
    }
    await orderRef.update({
      warehouseDeductions: {},
      costAllocations: {},
      stockDeducted: false,
      stockDeductionStatus: 'skipped_cancelled'
    }).catch(() => {});
  }

  if (!needReturn && orderData && orderData.orderKind === 'agent_purchase') {
    const fresh = await orderRef.get();
    const freshItems = (fresh.exists && Array.isArray(fresh.data().items)) ? fresh.data().items : items;
    await creditAgentPurchase(orderId, orderData, freshItems, deductedIds, shortages);
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
        || data.stockDeductionStatus === 'done_with_shortage'
        || data.stockDeductionStatus === 'shortage'
        || data.stockDeductionStatus === 'skipped'
        || data.stockDeductionStatus === 'skipped_cancelled'
        || data.stockDeductionStatus === 'skipped_unfulfilled'
        || data.stockDeductionStatus === 'skipped_agent_sale') {
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

// ============================================================================
//         РУЧНОЕ СПИСАНИЕ ЗАКАЗА (callable из админ-панели)
// ----------------------------------------------------------------------------
// Админ вызывает эту функцию для заказа, у которого stockDeductionStatus =
// 'skipped' / 'skipped_unfulfilled' (заказ пришёл когда склад был на паузе,
// или все товары были распроданы и админ теперь их пополнил).
//
// Логика:
//   1) Проверяем что вызывает админ (Firebase Auth email == admin@kerben.local)
//   2) Сбрасываем stockDeductionStatus и oчищаем processedIds (оставляем
//      только реально списанные — deductedProductIds, чтобы не списать
//      дважды при частичном списании)
//   3) Вызываем processOrderStockDeduction — та же атомарная логика
//      что и авто-списание, но принудительно
//   4) Возвращаем результат админу
// ============================================================================
exports.manualDeductOrderStock = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth || !context.auth.token
        || context.auth.token.email !== 'admin@kerben.local') {
      throw new functions.https.HttpsError('permission-denied',
        'Требуются права админа');
    }

    const orderId = data && data.orderId;
    if (!orderId || typeof orderId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument',
        'orderId обязателен');
    }

    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Заказ не найден');
    }
    const order = snap.data() || {};

    if (order.orderKind === 'agent_sale') {
      throw new functions.https.HttpsError('failed-precondition',
        'Продажа агента списывается только с его остатка, не со склада KERBEN');
    }

    // Защита от списания отменённого заказа
    if (_isCancelledStatus(order.status)) {
      throw new functions.https.HttpsError('failed-precondition',
        'Заказ отменён — списание невозможно. Сначала верните статус.');
    }

    // Сбрасываем состояние чтобы processOrderStockDeduction не пропустил.
    // Ключевое: stockDeductionProcessedIds = stockDeductedProductIds —
    // так уже списанные товары не будут списаны повторно, а пропущенные
    // (из-за паузы склада) будут пересписаны.
    const alreadyDeducted = Array.isArray(order.stockDeductedProductIds)
      ? order.stockDeductedProductIds : [];
    const alreadyDeductedSet = new Set(alreadyDeducted);

    // СНАПШОТ ДО СПИСАНИЯ — нужен чтобы после узнать сколько реально
    // списалось (для товаров без warehouseStock warehouseDeductions
    // пустое, только stock уменьшается). Так админ увидит недостачу
    // если товар заказан во время паузы а сейчас на складе меньше.
    const items = _aggregateItems(order.items);
    const before = {};
    await Promise.all(items.map(async (item) => {
      if (!item || !item.id) return;
      if (alreadyDeductedSet.has(item.id)) return;
      const need = Math.max(0, Math.floor(item.qty || 0));
      if (need <= 0) return;
      try {
        const pSnap = await db.collection('products').doc(item.id).get();
        if (!pSnap.exists) {
          before[item.id] = { need, title: item.title || item.id,
            exists: false, stockBefore: 0, hasWarehouseSetup: false };
          return;
        }
        const p = pSnap.data() || {};
        const ws = p.warehouseStock;
        const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
        const stockBefore = (typeof p.stock === 'number' && isFinite(p.stock))
          ? Math.max(0, Math.floor(p.stock)) : null; // null = товар без учёта
        before[item.id] = {
          need,
          title: item.title || p.title || item.id,
          exists: true,
          stockBefore,
          hasWarehouseSetup
        };
      } catch (e) {
        console.warn(`[ManualDeduct] snapshot ${item.id}:`, e.message);
      }
    }));

    await orderRef.update({
      stockDeductionStatus: admin.firestore.FieldValue.delete(),
      stockDeductionError: admin.firestore.FieldValue.delete(),
      stockDeductionProcessedIds: alreadyDeducted
    });

    try {
      await processOrderStockDeduction(orderId);
    } catch (e) {
      console.error(`[ManualDeduct] ${orderId}:`, e.message);
      throw new functions.https.HttpsError('internal',
        'Ошибка списания: ' + e.message);
    }

    // Читаем финальное состояние чтобы вернуть клиенту
    const finalSnap = await orderRef.get();
    const finalData = finalSnap.data() || {};
    const warehouseDeductions = finalData.warehouseDeductions
      && typeof finalData.warehouseDeductions === 'object'
      ? finalData.warehouseDeductions : {};

    // Считаем сколько реально списалось по каждому товару, чтобы найти недостачи.
    // Для товаров с warehouseStock — сумма warehouseDeductions[itemId].
    // Для товаров без разбивки — читаем текущий stock и сравниваем со снапшотом.
    const perItem = [];
    let totalRequested = 0;
    let totalDeducted = 0;
    let anyShortage = false;

    for (const item of items) {
      if (!item || !item.id) continue;
      if (alreadyDeductedSet.has(item.id)) continue;
      const snap = before[item.id];
      if (!snap) continue;

      const need = snap.need;
      totalRequested += need;

      // Товар удалён из каталога
      if (!snap.exists) {
        perItem.push({ id: item.id, title: snap.title, requested: need,
          deducted: 0, shortage: need, reason: 'product_deleted' });
        anyShortage = true;
        continue;
      }
      // Товар без учёта склада (stock не число)
      if (snap.stockBefore === null) {
        perItem.push({ id: item.id, title: snap.title, requested: need,
          deducted: 0, shortage: 0, reason: 'no_stock_tracking' });
        continue;
      }

      let actualDeducted = 0;
      if (snap.hasWarehouseSetup) {
        const wd = warehouseDeductions[item.id];
        if (wd && typeof wd === 'object') {
          actualDeducted = Object.values(wd).reduce(
            (s, v) => s + (Number(v) || 0), 0);
        }
      } else {
        // Читаем текущий stock и вычисляем дельту
        try {
          const pNow = await db.collection('products').doc(item.id).get();
          if (pNow.exists) {
            const p = pNow.data() || {};
            const stockAfter = (typeof p.stock === 'number' && isFinite(p.stock))
              ? Math.max(0, Math.floor(p.stock)) : snap.stockBefore;
            actualDeducted = Math.max(0, snap.stockBefore - stockAfter);
          }
        } catch (e) { /* silent */ }
      }

      totalDeducted += actualDeducted;
      const shortage = Math.max(0, need - actualDeducted);
      if (shortage > 0) anyShortage = true;

      perItem.push({
        id: item.id,
        title: snap.title,
        requested: need,
        deducted: actualDeducted,
        shortage: shortage,
        stockBefore: snap.stockBefore,
        reason: shortage > 0
          ? (actualDeducted === 0 ? 'out_of_stock' : 'partial_stock')
          : 'ok'
      });
    }

    return {
      success: true,
      status: finalData.stockDeductionStatus || 'unknown',
      stockDeducted: finalData.stockDeducted === true,
      deductedProductIds: Array.isArray(finalData.stockDeductedProductIds)
        ? finalData.stockDeductedProductIds : [],
      warehouseDeductions: warehouseDeductions,
      // НОВОЕ: подробный отчёт для админа
      totalRequested,
      totalDeducted,
      anyShortage,
      perItem
    };
  });

// ============================================================================
//     ИСТОРИЯ ОСТАТКОВ ДЛЯ УПРАВЛЯЮЩЕГО СКЛАДОМ
// ----------------------------------------------------------------------------
// Управляющий видит, как менялся остаток: приход, списание, продажа,
// возврат, перемещение. Имена клиентов, телефоны, адреса и номера
// заказов в ответ не попадают — правила склада это закрывают, а
// коллекцию warehouseMovements он читать напрямую не может.
// ============================================================================
function _movementAt(data) {
  if (data && typeof data.createdAtMs === 'number' && isFinite(data.createdAtMs)) {
    return data.createdAtMs;
  }
  if (data && data.createdAt && typeof data.createdAt.toMillis === 'function') {
    return data.createdAt.toMillis();
  }
  return 0;
}

function _stockHistoryNote(data) {
  const type = data && data.type;
  if (data && data.held === true) return 'Ждёт, пока старый остаток не кончится';
  if (type === 'sale') return 'Продажа';
  if (type === 'return') return 'Возврат на склад';
  if (type === 'transfer') return '';
  const raw = String((data && data.note) || '');
  if (/заказ|клиент|телефон|адрес|\+?\d{9,}/i.test(raw)) {
    if (type === 'receipt') return 'Приход';
    if (type === 'adjustment') return data.direction === 'out' ? 'Списание' : 'Приход';
    return '';
  }
  return raw.slice(0, 160);
}

async function _assertStockHistoryReader(context) {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Нужен вход');
  }
  const email = (context.auth.token && context.auth.token.email) || '';
  if (email === 'admin@kerben.local') return;
  if (!/^wm_.*@kerben-warehouse\.local$/.test(email)) {
    throw new functions.https.HttpsError('permission-denied', 'Нет доступа');
  }
  const snap = await db.collection('warehouseManagers').doc(context.auth.uid).get();
  const status = snap.exists ? (snap.data() || {}).status : '';
  if (status !== 'approved') {
    throw new functions.https.HttpsError('permission-denied', 'Заявка не одобрена');
  }
}

exports.listWarehouseStockHistory = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (data, context) => {
    await _assertStockHistoryReader(context);
    const daysRaw = Number(data && data.days);
    const days = Math.min(90, Math.max(1, isFinite(daysRaw) ? daysRaw : 7));
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    const snap = await db.collection('warehouseMovements')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();
    const items = snap.docs.map((doc) => {
      const row = doc.data() || {};
      const type = ['sale', 'receipt', 'transfer', 'return', 'adjustment'].indexOf(row.type) >= 0
        ? row.type : 'adjustment';
      const direction = row.direction === 'in' ? 'in' : 'out';
      const actor = (type === 'adjustment' || type === 'receipt')
        ? String(row.createdByName || '').slice(0, 80) : '';
      return {
        id: doc.id,
        title: String(row.productTitle || '').slice(0, 200),
        type: type,
        direction: direction,
        qty: Math.max(0, Math.floor(Number(row.qty) || 0)),
        warehouse: String(row.warehouseName || '').slice(0, 80),
        fromWarehouse: String(row.fromWarehouseName || '').slice(0, 80),
        toWarehouse: String(row.toWarehouseName || '').slice(0, 80),
        note: _stockHistoryNote(row),
        actor: actor,
        held: row.held === true,
        cancelled: row.cancelled === true,
        at: _movementAt(row)
      };
    });
    return { items: items, days: days };
  });

