// ===================================================================
// КЕРБЕН — проверка остатков перед заказом (без записи в Firestore).
// Списание делает только Cloud Function: deductStockOnOrderCreate.
// ===================================================================

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

    // Определяем эффективный остаток. null = безлимит (склады на паузе),
    // число (включая 0) = остаток отслеживается.
    let effective = null;
    if (typeof getEffectiveStock === 'function') {
      effective = getEffectiveStock(localProduct);
      if (effective === null) continue; // безлимит → пропускаем списание
    } else {
      if (warehousePausedFlag) continue;
      // Фолбэк без getEffectiveStock: склад ВКЛЮЧЁН и у товара нет stock →
      // считаем «нет в наличии» (0), а не безлимит.
      effective = (typeof localProduct.stock === 'number' && isFinite(localProduct.stock))
        ? Math.max(0, Math.floor(localProduct.stock))
        : 0;
    }

    const ws = localProduct.warehouseStock;
    const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
    if (hasWarehouseSetup && Object.keys(ws).some(whId => pausedSet.has && pausedSet.has(whId))) continue;

    // Локальный остаток берём из product.stock, если он есть; если поля нет —
    // трактуем как 0 (склад включён → «нет в наличии»).
    const localStock = (typeof localProduct.stock === 'number' && isFinite(localProduct.stock))
      ? Math.max(0, Math.floor(localProduct.stock))
      : 0;

    const need = Math.max(0, Math.floor(item.qty || 0));
    if (need <= 0) throw new Error('Некорректное количество: ' + (item.title || item.id));
    // stock=0 (с warehouseStock или без) — всегда «нет в наличии».
    // Раньше здесь был скип для случая без warehouseStock — из-за него
    // распроданные товары можно было продолжать заказывать.
    if (localStock < need) {
      const short = localStock <= 0
        ? 'Нет в наличии'
        : 'Доступно ' + localStock + ' шт';
      throw new Error('Недостаточно остатка: ' + (localProduct.title || item.title) + '. ' + short);
    }

    stockDeducted = true;
    // Данные ниже — только для локальной проверки / совместимости; в Firestore
    // склад пишет Cloud Function.
    const productRef = db.collection('products').doc(item.id);

    if (hasWarehouseSetup) {
      let remaining = need;
      const updatedWs = Object.assign({}, ws);
      const itemDeductions = {};

      if (primaryId && (updatedWs[primaryId] || 0) > 0) {
        const deduct = Math.min(remaining, updatedWs[primaryId]);
        updatedWs[primaryId] -= deduct;
        remaining -= deduct;
        itemDeductions[primaryId] = deduct;
      }

      if (remaining > 0) {
        const otherWh = Object.entries(updatedWs)
          .filter(function (pair) {
            return pair[1] > 0 && pair[0] !== primaryId;
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

      if (remaining > 0) {
        var fallback = primaryId || Object.keys(updatedWs)[0] || 'default';
        updatedWs[fallback] = (updatedWs[fallback] || 0) - remaining;
        itemDeductions[fallback] = (itemDeductions[fallback] || 0) + remaining;
      }

      if (Object.keys(itemDeductions).length > 0) {
        warehouseDeductions[item.id] = itemDeductions;
      }
      var newTotal = Object.values(updatedWs).reduce(function (s, v) { return s + (v || 0); }, 0);
      stockUpdates.push([productRef, { stock: newTotal, warehouseStock: updatedWs }]);
    } else {
      stockUpdates.push([productRef, { stock: firebase.firestore.FieldValue.increment(-need) }]);
    }
  }

  return { stockUpdates: stockUpdates, warehouseDeductions: warehouseDeductions, stockDeducted: stockDeducted };
}

window.prepareStockUpdatesFromCart = prepareStockUpdatesFromCart;
