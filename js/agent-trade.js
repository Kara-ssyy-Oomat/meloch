// Покупка и продажа одобренного агента.
// Покупка списывает склад KERBEN и кладёт товар в остаток агента.
// Продажа списывает только остаток агента.
(function (global) {
  'use strict';

  var agent = null;
  var catalog = [];
  var inventory = [];
  var buyCart = {};
  var tab = 'buy';
  var catalogLoaded = false;

  function db() {
    return firebase.firestore();
  }

  function money(n) {
    var x = Math.round(Number(n) || 0);
    return isFinite(x) ? x : 0;
  }

  function salePrice(buy, percent) {
    var p = Number(percent);
    if (!isFinite(p) || p < 0) p = 0;
    if (p > 500) p = 500;
    return Math.round((Number(buy) || 0) * (100 + p) / 100);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function box() {
    return document.getElementById('agentTradeSection');
  }

  function hide() {
    var el = box();
    if (el) el.style.display = 'none';
  }

  function mount(nextAgent) {
    agent = nextAgent && nextAgent.id ? nextAgent : null;
    var el = box();
    if (!el || !agent) { hide(); return; }
    el.style.display = 'block';
    if (!el.dataset.ready) {
      el.dataset.ready = '1';
      el.innerHTML = shell();
    }
    showTab(tab);
  }

  function shell() {
    return ''
      + '<div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">'
      + '<div style="font-weight:800;font-size:18px;margin-bottom:6px;">Покупка и продажа</div>'
      + '<div style="color:#666;font-size:13px;line-height:1.45;margin-bottom:12px;">Покупка идёт по цене KERBEN и списывается с основного склада. Продажа идёт только из вашего остатка и склад KERBEN больше не трогает.</div>'
      + '<div style="display:flex;gap:8px;margin-bottom:12px;">'
      + '<button type="button" id="tradeTabBuy" style="flex:1;border:none;border-radius:10px;padding:12px;font-weight:700;cursor:pointer;">Покупка</button>'
      + '<button type="button" id="tradeTabSell" style="flex:1;border:none;border-radius:10px;padding:12px;font-weight:700;cursor:pointer;">Продажа</button>'
      + '</div>'
      + '<div id="tradePanel"></div>'
      + '</div>';
  }

  function showTab(next) {
    tab = next === 'sell' ? 'sell' : 'buy';
    var buyBtn = document.getElementById('tradeTabBuy');
    var sellBtn = document.getElementById('tradeTabSell');
    if (buyBtn) buyBtn.onclick = function () { showTab('buy'); };
    if (sellBtn) sellBtn.onclick = function () { showTab('sell'); };
    paintTabs();
    if (tab === 'buy') renderBuy();
    else renderSell();
  }

  function paintTabs() {
    var buyBtn = document.getElementById('tradeTabBuy');
    var sellBtn = document.getElementById('tradeTabSell');
    if (buyBtn) {
      buyBtn.style.background = tab === 'buy' ? '#1565c0' : '#e3f2fd';
      buyBtn.style.color = tab === 'buy' ? '#fff' : '#1565c0';
    }
    if (sellBtn) {
      sellBtn.style.background = tab === 'sell' ? '#2e7d32' : '#e8f5e9';
      sellBtn.style.color = tab === 'sell' ? '#fff' : '#2e7d32';
    }
  }

  async function loadCatalog() {
    if (catalogLoaded) return;
    var snap = await db().collection('products').limit(1000).get();
    catalog = [];
    snap.forEach(function (doc) {
      var data = doc.data() || {};
      catalog.push({
        id: doc.id,
        title: data.title || data.name || 'Товар',
        price: Number(data.price) || 0,
        image: data.image || '',
        stock: (typeof data.stock === 'number' && isFinite(data.stock)) ? Math.max(0, Math.floor(data.stock)) : null
      });
    });
    catalog.sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
    catalogLoaded = true;
  }

  async function loadInventory() {
    var snap = await db().collection('agentInventory').doc(agent.id).collection('items').get();
    inventory = [];
    snap.forEach(function (doc) {
      var data = doc.data() || {};
      inventory.push({
        id: doc.id,
        title: data.title || 'Товар',
        image: data.image || '',
        buyPrice: Number(data.buyPrice) || 0,
        qty: Math.max(0, Math.floor(Number(data.qty) || 0)),
        markupPercent: Number(data.markupPercent) || 0
      });
    });
    inventory.sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
  }

  async function renderBuy() {
    var panel = document.getElementById('tradePanel');
    if (!panel) return;
    panel.innerHTML = '<div style="color:#888;">Загрузка каталога KERBEN…</div>';
    try {
      if (typeof kerbenWaitForAuth === 'function') {
        try { await kerbenWaitForAuth(8000); } catch (e) {}
      }
      await loadCatalog();
    } catch (e) {
      panel.innerHTML = '<div style="color:#c62828;">Не удалось загрузить каталог.</div>';
      return;
    }
    var q = '';
    drawBuy(q);
  }

  function drawBuy(query) {
    var panel = document.getElementById('tradePanel');
    if (!panel) return;
    var text = String(query || '').toLowerCase();
    var list = catalog.filter(function (p) {
      return !text || p.title.toLowerCase().indexOf(text) !== -1;
    }).slice(0, 40);
    var cartRows = Object.keys(buyCart).map(function (id) {
      var p = catalog.filter(function (item) { return item.id === id; })[0];
      var qty = buyCart[id];
      if (!p || !qty) return '';
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">'
        + '<span>' + esc(p.title) + ' × ' + qty + '</span>'
        + '<b>' + money(p.price * qty) + ' сом</b></div>';
    }).join('');
    var total = Object.keys(buyCart).reduce(function (sum, id) {
      var p = catalog.filter(function (item) { return item.id === id; })[0];
      return sum + (p ? p.price * buyCart[id] : 0);
    }, 0);
    panel.innerHTML = ''
      + '<input id="tradeBuySearch" placeholder="Поиск товара KERBEN" value="' + esc(query) + '" style="width:100%;box-sizing:border-box;padding:12px;border:2px solid #e0e0e0;border-radius:10px;margin-bottom:10px;">'
      + '<div style="max-height:420px;overflow:auto;">' + list.map(function (p) {
        var stockText = p.stock === null ? 'без учёта склада' : ('на складе KERBEN: ' + p.stock);
        var disabled = p.stock === null || p.stock <= 0;
        return '<div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">'
          + '<div style="flex:1;min-width:0;"><div style="font-weight:700;">' + esc(p.title) + '</div>'
          + '<div style="color:#c62828;font-weight:800;">' + money(p.price) + ' сом</div>'
          + '<div style="color:#888;font-size:12px;">' + stockText + '</div></div>'
          + '<input id="buyQty_' + esc(p.id) + '" type="number" min="1" value="1" ' + (disabled ? 'disabled' : '') + ' style="width:70px;padding:8px;border:1px solid #ddd;border-radius:8px;">'
          + '<button type="button" data-buy="' + esc(p.id) + '" ' + (disabled ? 'disabled' : '') + ' style="border:none;background:#1565c0;color:#fff;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer;">В список</button>'
          + '</div>';
      }).join('') + '</div>'
      + '<div style="margin-top:12px;background:#f7f9fc;border-radius:12px;padding:12px;">'
      + '<div style="font-weight:700;margin-bottom:6px;">Покупка для своего склада</div>'
      + (cartRows || '<div style="color:#888;">Список пуст</div>')
      + '<div style="margin-top:8px;font-weight:800;">Итого: ' + money(total) + ' сом</div>'
      + '<button type="button" id="tradeBuyConfirm" style="margin-top:10px;width:100%;border:none;background:#1565c0;color:#fff;border-radius:10px;padding:12px;font-weight:800;cursor:pointer;">Подтвердить покупку</button>'
      + '</div>';
    var search = document.getElementById('tradeBuySearch');
    if (search) {
      search.oninput = function () { drawBuy(search.value); };
    }
    panel.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-buy');
        var input = document.getElementById('buyQty_' + id);
        var qty = Math.max(1, Math.floor(Number(input && input.value) || 1));
        var product = catalog.filter(function (item) { return item.id === id; })[0];
        if (!product || product.stock === null) return;
        var next = (buyCart[id] || 0) + qty;
        if (next > product.stock) next = product.stock;
        if (next <= 0) return;
        buyCart[id] = next;
        drawBuy(search ? search.value : '');
      };
    });
    var confirmBtn = document.getElementById('tradeBuyConfirm');
    if (confirmBtn) confirmBtn.onclick = confirmBuy;
  }

  async function confirmBuy() {
    var ids = Object.keys(buyCart).filter(function (id) { return buyCart[id] > 0; });
    if (!ids.length) {
      Swal.fire('Список пуст', 'Добавьте товары из каталога KERBEN', 'info');
      return;
    }
    var lines = ids.map(function (id) {
      var p = catalog.filter(function (item) { return item.id === id; })[0];
      return { product: p, qty: buyCart[id] };
    }).filter(function (row) { return row.product && row.product.stock !== null && row.qty > 0 && row.qty <= row.product.stock; });
    if (!lines.length) {
      Swal.fire('Нечего покупать', 'Эти товары сейчас нельзя списать со склада KERBEN', 'warning');
      return;
    }
    var total = lines.reduce(function (sum, row) { return sum + row.product.price * row.qty; }, 0);
    var ask = await Swal.fire({
      title: 'Купить у KERBEN?',
      html: 'Со склада KERBEN спишется товар на <b>' + money(total) + ' сом</b> по обычным ценам. Он появится в вашем остатке.',
      showCancelButton: true,
      confirmButtonText: 'Купить',
      cancelButtonText: 'Отмена'
    });
    if (!ask.isConfirmed) return;
    try {
      if (typeof kerbenWaitForAuth === 'function') await kerbenWaitForAuth(8000);
      await db().collection('orders').add({
        name: agent.name || 'Агент',
        phone: agent.phone || '',
        address: 'Склад агента',
        items: lines.map(function (row) {
          return {
            id: row.product.id,
            title: row.product.title,
            qty: row.qty,
            price: row.product.price,
            image: row.product.image || null
          };
        }),
        total: total,
        timestamp: Date.now(),
        time: new Date().toLocaleString('ru-RU'),
        status: 'pending',
        stockDeducted: false,
        stockDeductionStatus: 'pending',
        orderKind: 'agent_purchase',
        agentId: agent.id,
        placedByAgentId: agent.id,
        placedByAgentName: agent.name || '',
        excludedFromAgent: true
      });
      buyCart = {};
      catalogLoaded = false;
      Swal.fire('Покупка принята', 'Склад KERBEN списывается, товар переходит в ваш остаток.', 'success');
      drawBuy('');
    } catch (e) {
      Swal.fire('Не удалось купить', (e && e.message) || 'Ошибка', 'error');
    }
  }

  async function renderSell() {
    var panel = document.getElementById('tradePanel');
    if (!panel) return;
    panel.innerHTML = '<div style="color:#888;">Загрузка вашего остатка…</div>';
    try {
      if (typeof kerbenWaitForAuth === 'function') {
        try { await kerbenWaitForAuth(8000); } catch (e) {}
      }
      await loadInventory();
    } catch (e) {
      panel.innerHTML = '<div style="color:#c62828;">Не удалось загрузить остаток.</div>';
      return;
    }
    var rows = inventory.filter(function (item) { return item.qty > 0; });
    if (!rows.length) {
      panel.innerHTML = '<div style="background:#fff8e1;border-radius:12px;padding:14px;color:#8d6e00;">В продаже пока ничего нет. Сначала купите товар у KERBEN в разделе «Покупка».</div>';
      return;
    }
    panel.innerHTML = rows.map(function (item) {
      var price = salePrice(item.buyPrice, item.markupPercent);
      return '<div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">'
        + '<div style="font-weight:800;">' + esc(item.title) + '</div>'
        + '<div style="color:#666;font-size:13px;margin:4px 0;">Куплено по ' + money(item.buyPrice) + ' сом · ваш остаток: <b>' + item.qty + '</b></div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<input id="sellPct_' + esc(item.id) + '" type="number" min="0" max="500" step="1" value="' + money(item.markupPercent) + '" style="width:90px;padding:8px;border:1px solid #ddd;border-radius:8px;">'
        + '<span>%</span>'
        + '<button type="button" data-save="' + esc(item.id) + '" style="border:none;background:#6a1b9a;color:#fff;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer;">Сохранить %</button>'
        + '<span style="font-weight:800;color:#2e7d32;">покупатель видит ' + price + ' сом</span>'
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">'
        + '<input id="sellQty_' + esc(item.id) + '" type="number" min="1" max="' + item.qty + '" value="1" style="width:80px;padding:8px;border:1px solid #ddd;border-radius:8px;">'
        + '<input id="sellName_' + esc(item.id) + '" placeholder="Имя покупателя" style="flex:1;min-width:140px;padding:8px;border:1px solid #ddd;border-radius:8px;">'
        + '<input id="sellPhone_' + esc(item.id) + '" placeholder="Телефон" style="width:140px;padding:8px;border:1px solid #ddd;border-radius:8px;">'
        + '<button type="button" data-sell="' + esc(item.id) + '" style="border:none;background:#2e7d32;color:#fff;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;">Продать</button>'
        + '</div></div>';
    }).join('');
    panel.querySelectorAll('[data-save]').forEach(function (btn) {
      btn.onclick = function () { saveMarkup(btn.getAttribute('data-save')); };
    });
    panel.querySelectorAll('[data-sell]').forEach(function (btn) {
      btn.onclick = function () { sellItem(btn.getAttribute('data-sell')); };
    });
  }

  async function saveMarkup(id) {
    var input = document.getElementById('sellPct_' + id);
    var pct = Number(input && input.value);
    if (!isFinite(pct) || pct < 0 || pct > 500) {
      Swal.fire('Процент', 'Укажите от 0 до 500', 'warning');
      return;
    }
    try {
      await db().collection('agentInventory').doc(agent.id).collection('items').doc(id).update({
        markupPercent: Math.round(pct * 100) / 100,
        updatedAt: Date.now()
      });
      await renderSell();
    } catch (e) {
      Swal.fire('Не сохранилось', (e && e.message) || 'Ошибка', 'error');
    }
  }

  async function sellItem(id) {
    var item = inventory.filter(function (row) { return row.id === id; })[0];
    if (!item || item.qty <= 0) {
      Swal.fire('Нет остатка', 'Сначала купите этот товар у KERBEN', 'info');
      return;
    }
    var qty = Math.floor(Number((document.getElementById('sellQty_' + id) || {}).value) || 0);
    var name = String((document.getElementById('sellName_' + id) || {}).value || '').trim();
    var phone = String((document.getElementById('sellPhone_' + id) || {}).value || '').trim();
    if (qty <= 0 || qty > item.qty) {
      Swal.fire('Количество', 'Можно продать от 1 до ' + item.qty, 'warning');
      return;
    }
    if (!name || !phone) {
      Swal.fire('Покупатель', 'Укажите имя и телефон', 'warning');
      return;
    }
    var price = salePrice(item.buyPrice, item.markupPercent);
    try {
      if (typeof kerbenWaitForAuth === 'function') await kerbenWaitForAuth(8000);
      var ref = await db().collection('orders').add({
        name: name,
        phone: phone,
        address: 'Продажа агента',
        items: [{
          id: item.id,
          title: item.title,
          qty: qty,
          price: price,
          basePrice: item.buyPrice,
          markupPercent: item.markupPercent,
          image: item.image || null
        }],
        total: price * qty,
        timestamp: Date.now(),
        time: new Date().toLocaleString('ru-RU'),
        status: 'pending',
        stockDeducted: false,
        stockDeductionStatus: 'pending',
        orderKind: 'agent_sale',
        agentId: agent.id,
        placedByAgentId: agent.id,
        placedByAgentName: agent.name || '',
        excludedFromAgent: true
      });
      var result = await waitOrder(ref.id);
      if (result.agentSaleRejected) {
        Swal.fire('Продажа не прошла', result.stockDeductionError || 'Не хватило вашего остатка', 'warning');
      } else {
        Swal.fire('Продано', qty + ' шт. списаны с вашего остатка. Склад KERBEN не изменился.', 'success');
      }
      renderSell();
    } catch (e) {
      Swal.fire('Не удалось продать', (e && e.message) || 'Ошибка', 'error');
    }
  }

  function waitOrder(id) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        unsub();
        reject(new Error('Сервер ещё не подтвердил остаток. Обновите раздел через несколько секунд.'));
      }, 15000);
      var unsub = db().collection('orders').doc(id).onSnapshot(function (snap) {
        var data = snap.data() || {};
        if (data.agentInventoryApplied === true || data.agentSaleRejected === true) {
          clearTimeout(timer);
          unsub();
          resolve(data);
        }
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  global.KerbenAgentTrade = { mount: mount, hide: hide };
})(window);
