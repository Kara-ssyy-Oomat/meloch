// Партии приходной цены.
// Старый остаток хранит свою цену, пока не продастся.
// Новый приход с другой ценой ложится отдельной партией и продаётся после старой.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CostLayers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function roundQty(n) {
    var x = Math.floor(Number(n) || 0);
    return x > 0 ? x : 0;
  }

  function clean(layers) {
    var out = [];
    (Array.isArray(layers) ? layers : []).forEach(function (l) {
      if (!l) return;
      var qty = roundQty(l.qty);
      var cost = round2(l.cost != null ? l.cost : l.costPrice);
      if (qty <= 0) return;
      var prev = out[out.length - 1];
      if (prev && prev.cost === cost) prev.qty += qty;
      else out.push({ qty: qty, cost: cost });
    });
    return out;
  }

  function totalQty(layers) {
    return clean(layers).reduce(function (s, l) { return s + l.qty; }, 0);
  }

  function stockOf(product) {
    if (!product) return 0;
    if (typeof product.stock === 'number' && isFinite(product.stock)) return roundQty(product.stock);
    var ws = product.warehouseStock;
    if (ws && typeof ws === 'object') {
      return Object.keys(ws).reduce(function (s, id) { return s + roundQty(ws[id]); }, 0);
    }
    return 0;
  }

  // Подгоняет партии под фактический остаток.
  // Не хватает — дописываем в конец по fallback-цене.
  // Лишнее — снимаем с самых старых партий (их уже продали).
  function align(layers, qty, fallbackCost) {
    var list = clean(layers);
    var have = list.reduce(function (s, l) { return s + l.qty; }, 0);
    var target = roundQty(qty);
    var cost = round2(fallbackCost);
    if (have < target) {
      var addQty = target - have;
      var prev = list[list.length - 1];
      if (prev && prev.cost === cost) prev.qty += addQty;
      else list.push({ qty: addQty, cost: cost });
    } else if (have > target) {
      var drop = have - target;
      for (var i = 0; i < list.length && drop > 0; i++) {
        var takeQty = Math.min(list[i].qty, drop);
        list[i].qty -= takeQty;
        drop -= takeQty;
      }
      list = clean(list);
    }
    return list;
  }

  function ensure(product) {
    return align(product && product.costLayers, stockOf(product), product && product.costPrice);
  }

  function add(layers, qty, cost, fallbackCost) {
    var q = roundQty(qty);
    if (q <= 0) return clean(layers);
    var list = clean(layers);
    var c = round2(cost != null ? cost : fallbackCost);
    var prev = list[list.length - 1];
    if (prev && prev.cost === c) prev.qty += q;
    else list.push({ qty: q, cost: c });
    return list;
  }

  function take(layers, qty) {
    var needStart = roundQty(qty);
    var list = clean(layers);
    var taken = [];
    var need = needStart;
    for (var i = 0; i < list.length && need > 0; i++) {
      var q = Math.min(list[i].qty, need);
      if (q > 0) {
        taken.push({ qty: q, cost: list[i].cost });
        list[i].qty -= q;
        need -= q;
      }
    }
    var used = needStart - need;
    var sum = 0;
    taken.forEach(function (t) { sum += t.qty * t.cost; });
    return {
      layers: clean(list),
      taken: clean(taken),
      used: used,
      avg: used > 0 ? round2(sum / used) : 0
    };
  }

  // Вернуть проданные партии в начало: они снова самые старые.
  function restore(layers, taken) {
    return clean(clean(taken).concat(clean(layers)));
  }

  // Убрать конкретную партию прихода (отмена). Сначала с конца, где она легла.
  function takeBack(layers, added) {
    var list = clean(layers);
    clean(added).forEach(function (t) {
      var left = t.qty;
      var i;
      for (i = list.length - 1; i >= 0 && left > 0; i--) {
        if (list[i].cost !== t.cost) continue;
        var q = Math.min(list[i].qty, left);
        list[i].qty -= q;
        left -= q;
      }
      for (i = list.length - 1; i >= 0 && left > 0; i--) {
        var q2 = Math.min(list[i].qty, left);
        list[i].qty -= q2;
        left -= q2;
      }
    });
    return clean(list);
  }

  function value(layers) {
    return round2(clean(layers).reduce(function (s, l) { return s + l.qty * l.cost; }, 0));
  }

  // Себестоимость qty штук. Если qty меньше всего остатка — доля средней цены партий.
  function valueOf(product, qty) {
    var total = stockOf(product);
    var q = qty == null ? total : roundQty(qty);
    if (q <= 0 || total <= 0) return 0;
    var all = value(align(product && product.costLayers, total, product && product.costPrice));
    if (q >= total) return all;
    return round2(all * q / total);
  }

  function weighted(layers) {
    var list = clean(layers);
    var q = list.reduce(function (s, l) { return s + l.qty; }, 0);
    if (!q) return 0;
    var sum = list.reduce(function (s, l) { return s + l.qty * l.cost; }, 0);
    return round2(sum / q);
  }

  function format(layers) {
    return clean(layers).map(function (l) { return l.qty + ' шт по ' + l.cost; }).join(', ');
  }

  // delta > 0 — новый приход по newCost, старые партии не трогаем.
  // delta < 0 — списываем самые старые партии.
  function applyDelta(product, stockBefore, delta, newCost) {
    var before = stockBefore == null ? stockOf(product) : roundQty(stockBefore);
    var d = Math.trunc(Number(delta) || 0);
    var layers = align(product && product.costLayers, before, product && product.costPrice);
    var costAdded = [];
    var costTaken = [];
    var avg = 0;
    if (d > 0) {
      var cost = round2(newCost != null ? newCost : (product && product.costPrice));
      layers = add(layers, d, cost, product && product.costPrice);
      costAdded = [{ qty: d, cost: cost }];
    } else if (d < 0) {
      var t = take(layers, -d);
      layers = t.layers;
      costTaken = t.taken;
      avg = t.avg;
    }
    return { layers: layers, costAdded: costAdded, costTaken: costTaken, avg: avg };
  }

  function withRestore(product, stockBefore, stockAfter, taken) {
    var layers = align(product && product.costLayers, stockBefore, product && product.costPrice);
    if (taken && taken.length) layers = restore(layers, taken);
    return align(layers, stockAfter, product && product.costPrice);
  }

  function reverseMovement(product, stockBefore, stockAfter, movement) {
    var layers = align(product && product.costLayers, stockBefore, product && product.costPrice);
    var dir = movement && movement.direction;
    if (dir === 'in' && movement.costAdded && movement.costAdded.length) {
      layers = takeBack(layers, movement.costAdded);
    } else if (dir === 'out' && movement.costTaken && movement.costTaken.length) {
      layers = restore(layers, movement.costTaken);
    }
    return align(layers, stockAfter, product && product.costPrice);
  }

  // Переоценить весь текущий остаток одной ценой.
  function repriceAll(product, newCost) {
    var qty = stockOf(product);
    var cost = round2(newCost);
    if (qty <= 0) return [];
    return [{ qty: qty, cost: cost }];
  }

  // Часть проданной партии возвращается на склад, остальное остаётся за заказом.
  function restorePartial(allocation, qty) {
    var list = clean(allocation);
    var need = roundQty(qty);
    var restored = [];
    for (var i = 0; i < list.length && need > 0; i++) {
      var q = Math.min(list[i].qty, need);
      if (q > 0) {
        restored.push({ qty: q, cost: list[i].cost });
        list[i].qty -= q;
        need -= q;
      }
    }
    return { restored: clean(restored), remaining: clean(list) };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Продажа двигается на ту же сумму, что и закупка: закупка +4 → продажа +4.
  function cleanHolds(holds) {
    var out = [];
    (Array.isArray(holds) ? holds : []).forEach(function (h) {
      if (!h) return;
      var qty = roundQty(h.qty);
      if (qty <= 0) return;
      out.push({
        qty: qty,
        cost: round2(h.cost),
        sale: round2(h.sale),
        opt: (h.opt == null || h.opt === '') ? null : round2(h.opt),
        warehouseId: String(h.warehouseId || '')
      });
    });
    return out;
  }

  // Сколько покупатель видит на сайте. При главном складе это только он.
  function siteQty(product, primaryId) {
    if (!product) return 0;
    var ws = product.warehouseStock;
    var has = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
    if (!has) return stockOf(product);
    if (primaryId) return roundQty(ws[primaryId]);
    return Object.keys(ws).reduce(function (s, id) { return s + roundQty(ws[id]); }, 0);
  }

  // Новая продажа другая, и на сайте ещё есть старый остаток — партия ждёт.
  function receiptWaits(visibleQty, oldSale, newSale) {
    return round2(oldSale) !== round2(newSale) && roundQty(visibleQty) > 0;
  }

  // На сайте уже 0: первая ожидающая партия выходит со своей ценой.
  // Остаток на других складах и его закупку не стираем.
  function releaseWaiting(product, visibleQty) {
    var holds = cleanHolds(product && product.saleHolds);
    var physical = stockOf(product);
    var visible = (visibleQty == null) ? physical : roundQty(visibleQty);
    if (!holds.length || visible > 0) return null;
    var h = holds[0];
    var rest = holds.slice(1);
    var ws = Object.assign({}, (product && product.warehouseStock) || {});
    var wh = h.warehouseId || '';
    var hasWs = Object.keys(ws).length > 0 || !!wh;
    if (hasWs) {
      var id = wh || Object.keys(ws)[0];
      ws[id] = roundQty(ws[id]) + h.qty;
    }
    var stock = hasWs
      ? Object.keys(ws).reduce(function (s, id) { return s + roundQty(ws[id]); }, 0)
      : physical + h.qty;
    var applied = applyDelta(product, physical, h.qty, h.cost);
    var patch = {
      stock: stock,
      costLayers: applied.layers,
      costPrice: h.cost,
      price: h.sale,
      saleHolds: rest,
      released: h
    };
    if (hasWs) patch.warehouseStock = ws;
    if (h.opt != null) patch.optPrice = h.opt;
    return patch;
  }

  function raisedSale(oldSale, oldCost, newCost) {
    var next = (Number(oldSale) || 0) + ((Number(newCost) || 0) - (Number(oldCost) || 0));
    return round2(next > 0 ? next : 0);
  }

  // rows: [{ id, title, addQty, oldQty, oldCost, salePrice, optPrice, layers }]
  // Возвращает { id: { cost, sale, opt } } или null, если отменили.
  function askReceiptPrices(rows) {
    if (!rows || !rows.length) return Promise.resolve({});
    if (typeof Swal === 'undefined') {
      var fallback = {};
      rows.forEach(function (r) {
        fallback[r.id] = {
          cost: round2(r.oldCost),
          sale: round2(r.salePrice),
          opt: round2(r.optPrice) > 0 ? round2(r.optPrice) : null
        };
      });
      return Promise.resolve(fallback);
    }
    var html = '<div style="text-align:left;font-size:13px;line-height:1.45;margin-bottom:12px;">Если цену продажи изменить, новая партия не попадёт на сайт, пока старый остаток не продастся по старой цене. Если цена продажи та же — остаток добавится сразу.</div>';
    html += '<div style="max-height:55vh;overflow:auto;text-align:left;">';
    rows.forEach(function (r, i) {
      var have = (r.layers && clean(r.layers).length)
        ? format(r.layers)
        : (roundQty(r.oldQty) + ' шт по ' + round2(r.oldCost));
      var sale = round2(r.salePrice);
      var opt = round2(r.optPrice);
      html += '<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eee;">' +
        '<b>' + esc(r.title || 'Товар') + '</b>' +
        '<div style="font-size:12px;color:#555;margin-top:2px;">Приход +' + roundQty(r.addQty) + ' шт</div>' +
        '<div style="font-size:12px;color:#e65100;margin-top:2px;">Сейчас на складе: ' + esc(have) + '</div>' +
        '<label style="display:block;font-size:12px;color:#666;margin-top:8px;">Новая приходная</label>' +
        '<input id="clp-' + i + '" data-old-cost="' + round2(r.oldCost) + '" data-old-sale="' + sale + '" data-old-opt="' + opt + '" type="number" min="0" step="0.01" value="' + round2(r.oldCost) + '" ' +
        'style="width:100%;margin-top:4px;padding:8px;font-size:16px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;">' +
        '<label style="display:block;font-size:12px;color:#666;margin-top:8px;">Новая цена продажи <span style="color:#999;">сейчас ' + sale + '</span></label>' +
        '<input id="cls-' + i + '" type="number" min="0" step="0.01" value="' + sale + '" ' +
        'style="width:100%;margin-top:4px;padding:8px;font-size:16px;border:1px solid #e53935;border-radius:8px;box-sizing:border-box;">';
      if (opt > 0) {
        html += '<label style="display:block;font-size:12px;color:#666;margin-top:8px;">Новая оптовая <span style="color:#999;">сейчас ' + opt + '</span></label>' +
          '<input id="clo-' + i + '" type="number" min="0" step="0.01" value="' + opt + '" ' +
          'style="width:100%;margin-top:4px;padding:8px;font-size:16px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;">';
      }
      html += '</div>';
    });
    html += '</div>';
    return Swal.fire({
      title: 'Цена нового прихода',
      html: html,
      showCancelButton: true,
      confirmButtonText: 'Принять',
      cancelButtonText: 'Отмена',
      confirmButtonColor: '#2e7d32',
      focusConfirm: false,
      didOpen: function () {
        rows.forEach(function (r, i) {
          var costEl = document.getElementById('clp-' + i);
          var saleEl = document.getElementById('cls-' + i);
          var optEl = document.getElementById('clo-' + i);
          if (saleEl) saleEl.addEventListener('input', function () { saleEl.dataset.touched = '1'; });
          if (optEl) optEl.addEventListener('input', function () { optEl.dataset.touched = '1'; });
          if (!costEl) return;
          costEl.addEventListener('input', function () {
            var nextCost = parseFloat(costEl.value);
            if (!isFinite(nextCost)) return;
            var oldCost = parseFloat(costEl.dataset.oldCost) || 0;
            if (saleEl && saleEl.dataset.touched !== '1') {
              saleEl.value = raisedSale(costEl.dataset.oldSale, oldCost, nextCost);
            }
            if (optEl && optEl.dataset.touched !== '1') {
              optEl.value = raisedSale(costEl.dataset.oldOpt, oldCost, nextCost);
            }
          });
        });
      },
      preConfirm: function () {
        var prices = {};
        for (var i = 0; i < rows.length; i++) {
          var costEl = document.getElementById('clp-' + i);
          var saleEl = document.getElementById('cls-' + i);
          var optEl = document.getElementById('clo-' + i);
          var cost = costEl ? parseFloat(costEl.value) : NaN;
          var sale = saleEl ? parseFloat(saleEl.value) : NaN;
          if (!isFinite(cost) || cost < 0 || !isFinite(sale) || sale < 0) {
            Swal.showValidationMessage('Введите приходную и цену продажи: 0 или больше');
            return false;
          }
          var opt = null;
          if (optEl) {
            opt = parseFloat(optEl.value);
            if (!isFinite(opt) || opt < 0) {
              Swal.showValidationMessage('Оптовая цена должна быть 0 или больше');
              return false;
            }
            opt = round2(opt);
          }
          prices[rows[i].id] = { cost: round2(cost), sale: round2(sale), opt: opt };
        }
        return prices;
      }
    }).then(function (res) {
      if (!res || !res.isConfirmed) return null;
      return res.value || {};
    });
  }

  return {
    round2: round2,
    roundQty: roundQty,
    clean: clean,
    totalQty: totalQty,
    stockOf: stockOf,
    align: align,
    ensure: ensure,
    add: add,
    take: take,
    restore: restore,
    takeBack: takeBack,
    value: value,
    valueOf: valueOf,
    weighted: weighted,
    format: format,
    applyDelta: applyDelta,
    withRestore: withRestore,
    reverseMovement: reverseMovement,
    repriceAll: repriceAll,
    restorePartial: restorePartial,
    raisedSale: raisedSale,
    cleanHolds: cleanHolds,
    siteQty: siteQty,
    receiptWaits: receiptWaits,
    releaseWaiting: releaseWaiting,
    askReceiptPrices: askReceiptPrices
  };
});
