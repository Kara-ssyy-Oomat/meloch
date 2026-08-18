// ===================================================================
// КЕРБЕН — проверка остатков перед заказом (без записи в Firestore).
// Списание делает только Cloud Function: deductStockOnOrderCreate.
// ===================================================================

function _sellableQtyFromWarehouseStock(ws) {
  if (!ws || typeof ws !== 'object') return 0;
  const paused = (typeof pausedWarehouseIds !== 'undefined' && pausedWarehouseIds)
    ? pausedWarehouseIds : new Set();
  const primary = (typeof primaryWarehouseId !== 'undefined') ? primaryWarehouseId : '';
  const isActive = function (id) { return id && !(paused.has && paused.has(id)); };
  if (primary && isActive(primary)) {
    return Math.max(0, Math.floor(Number(ws[primary]) || 0));
  }
  let sum = 0;
  Object.keys(ws).forEach(function (id) {
    if (isActive(id)) sum += Math.max(0, Math.floor(Number(ws[id]) || 0));
  });
  return sum;
}

function getEffectiveStock(product) {
  if (!product) return null;
  if (typeof warehousePaused !== 'undefined' && warehousePaused) return null;
  const ws = product.warehouseStock;
  if (ws && typeof ws === 'object' && Object.keys(ws).length > 0) {
    return _sellableQtyFromWarehouseStock(ws);
  }
  if (typeof product.stock !== 'number' || !isFinite(product.stock)) return 0;
  return Math.max(0, Math.floor(product.stock));
}

/**
 * Проверяет корзину по локальному кэшу products и готовит данные списания
 * (на клиенте используется только для валидации / UI).
 * @returns {{ stockUpdates: Array, warehouseDeductions: object, stockDeducted: boolean }}
 */
function prepareStockUpdatesFromCart(cartItems, productsList, opts) {
  opts = opts || {};
  const warehousePausedFlag = opts.warehousePaused === true
    || (typeof warehousePaused !== 'undefined' && warehousePaused === true);
  const pausedSet = opts.pausedWarehouseIds
    || (typeof pausedWarehouseIds !== 'undefined' ? pausedWarehouseIds : new Set());
  const primaryId = opts.primaryWarehouseId
    || (typeof primaryWarehouseId !== 'undefined' ? primaryWarehouseId : '');

  const stockUpdates = [];
  const warehouseDeductions = {};
  let stockDeducted = false;

  for (const item of cartItems) {
    const localProduct = (productsList || []).find(p => p.id === item.id);
    if (!localProduct) continue;

    if (warehousePausedFlag) continue;
    const effective = getEffectiveStock(localProduct);
    if (effective === null) continue;

    const ws = localProduct.warehouseStock;
    const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
    const localStock = effective;
    const need = Math.max(0, Math.floor(item.qty || 0));
    if (need <= 0) throw new Error('Некорректное количество: ' + (item.title || item.id));
    if (localStock < need) {
      const short = localStock <= 0
        ? 'Нет в наличии'
        : 'Доступно ' + localStock + ' шт';
      throw new Error('Недостаточно остатка: ' + (localProduct.title || item.title) + '. ' + short);
    }

    stockDeducted = true;
    const productRef = db.collection('products').doc(item.id);

    if (hasWarehouseSetup) {
      let remaining = need;
      const updatedWs = Object.assign({}, ws);
      const itemDeductions = {};
      const primaryActive = !!(primaryId && !(pausedSet.has && pausedSet.has(primaryId)));

      if (primaryActive) {
        const have = Math.max(0, Math.floor(updatedWs[primaryId] || 0));
        const deduct = Math.min(remaining, have);
        if (deduct > 0) {
          updatedWs[primaryId] = have - deduct;
          remaining -= deduct;
          itemDeductions[primaryId] = deduct;
        }
      } else {
        const otherWh = Object.entries(updatedWs)
          .filter(function (pair) {
            return pair[1] > 0 && !(pausedSet.has && pausedSet.has(pair[0]));
          })
          .sort(function (a, b) { return b[1] - a[1]; });
        for (var i = 0; i < otherWh.length; i++) {
          if (remaining <= 0) break;
          var whId = otherWh[i][0];
          var whQty = otherWh[i][1];
          var deduct2 = Math.min(remaining, whQty);
          updatedWs[whId] = whQty - deduct2;
          remaining -= deduct2;
          itemDeductions[whId] = (itemDeductions[whId] || 0) + deduct2;
        }
      }

      if (Object.keys(itemDeductions).length > 0) {
        warehouseDeductions[item.id] = itemDeductions;
      }
      var newTotal = Object.values(updatedWs).reduce(function (s, v) { return s + (v || 0); }, 0);
      stockUpdates.push([productRef, { stock: newTotal, warehouseStock: updatedWs }]);
    } else {
      stockUpdates.push([productRef, {
        stock: firebase.firestore.FieldValue.increment(-need)
      }]);
    }
  }

  return { stockUpdates: stockUpdates, warehouseDeductions: warehouseDeductions, stockDeducted: stockDeducted };
}

window.prepareStockUpdatesFromCart = prepareStockUpdatesFromCart;
