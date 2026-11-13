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
  var active = false;

  function db() {
    return firebase.firestore();
  }

  function money(n) {
    var x = Math.round((Number(n) || 0) * 100) / 100;
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
      + '<div id="tradeNote" style="color:#666;font-size:13px;line-height:1.45;margin-bottom:12px;"></div>'
      + '<div id="tradePanel"></div>'
      + '</div>';
  }

  function showTab(next) {
    tab = next === 'sell' ? 'sell' : 'buy';
    var note = document.getElementById('tradeNote');
    if (note) {
      note.textContent = tab === 'buy'
        ? 'Покупка для своего склада. Когда товары куплены, нажмите «Перейти на продажу».'
        : 'Страница продажи. Добавьте товар в заказ и примите его в форме ниже.';
    }
    paintBar();
    if (tab === 'buy') renderBuy();
    else renderSell();
  }

  function paintBar() {
    var buyBtn = document.getElementById('agentBarBuy');
    var sellBtn = document.getElementById('agentBarSell');
    if (buyBtn) {
      buyBtn.style.background = active && tab === 'buy' ? '#1565c0' : '#e3f2fd';
      buyBtn.style.color = active && tab === 'buy' ? '#fff' : '#1565c0';
    }
    if (sellBtn) {
      sellBtn.style.background = active && tab === 'sell' ? '#2e7d32' : '#e8f5e9';
      sellBtn.style.color = active && tab === 'sell' ? '#fff' : '#2e7d32';
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

  function readInventorySnap(snap) {
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

  async function loadInventory() {
    var snap = await db().collection('agentInventory').doc(agent.id).collection('items').get();
    readInventorySnap(snap);
  }

  var inventoryUnsub = null;
  function watchInventory(on) {
    if (inventoryUnsub) {
      inventoryUnsub();
      inventoryUnsub = null;
    }
    if (!on || !agent || !agent.id) return;
    inventoryUnsub = db().collection('agentInventory').doc(String(agent.id)).collection('items')
      .onSnapshot(function (snap) {
        readInventorySnap(snap);
        if (!(active && tab === 'sell')) return;
        var hasGoods = inventory.some(function (item) { return item.qty > 0; });
        showNote(hasGoods ? '' : 'В продаже пока ничего нет. Сначала купите товар в разделе «Покупка».');
        if (typeof renderProductsNow === 'function') renderProductsNow();
      }, function () {});
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
    });
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
      + '<button type="button" id="goSellPage" style="width:100%;margin-bottom:12px;border:none;background:#2e7d32;color:#fff;border-radius:12px;padding:14px;font-weight:800;font-size:16px;cursor:pointer;">Перейти на продажу</button>'
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
    var goSell = document.getElementById('goSellPage');
    if (goSell) goSell.onclick = function () { openMode('sell'); };
    var search = document.getElementById('tradeBuySearch');
    if (search) {
      search.oninput = function () { drawBuy(search.value); };
      if (query) {
        search.focus();
        var end = search.value.length;
        try { search.setSelectionRange(end, end); } catch (e) {}
      }
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

  var buyBusy = false;
  async function confirmBuy() {
    if (buyBusy) return;
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
    if (!agent.phone) {
      Swal.fire('Нет телефона', 'В профиле агента не указан телефон', 'warning');
      return;
    }
    buyBusy = true;
    try {
      if (typeof kerbenWaitForAuth === 'function') await kerbenWaitForAuth(8000);
      var ref = await db().collection('orders').add({
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
      var result = await waitOrder(ref.id);
      var credited = result.agentInventoryCredit || {};
      var got = Object.keys(credited).reduce(function (sum, id) { return sum + (Number(credited[id]) || 0); }, 0);
      buyCart = {};
      catalogLoaded = false;
      if (got > 0) {
        Swal.fire('Покупка прошла', 'Со склада KERBEN списано ' + got + ' шт. Они уже в вашем остатке.', 'success');
      } else {
        Swal.fire('Склад не списал товар', 'Остатка KERBEN не хватило, в ваш склад ничего не добавлено.', 'warning');
      }
      drawBuy('');
    } catch (e) {
      Swal.fire('Не удалось купить', (e && e.message) || 'Ошибка', 'error');
    }
    buyBusy = false;
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
    var orderRows = saleCartRows();
    panel.innerHTML = rows.map(function (item) {
      var price = salePrice(item.buyPrice, item.markupPercent);
      return '<div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">'
        + '<div style="font-weight:800;">' + esc(item.title) + '</div>'
        + '<div style="font-weight:800;color:#2e7d32;margin:4px 0;">' + price + ' сом</div>'
        + '<div style="color:#888;font-size:12px;margin-bottom:8px;">в наличии ' + item.qty + '</div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<input id="sellQty_' + esc(item.id) + '" type="number" min="1" max="' + item.qty + '" value="1" style="width:80px;padding:8px;border:1px solid #ddd;border-radius:8px;">'
        + '<button type="button" data-add="' + esc(item.id) + '" style="border:none;background:#2e7d32;color:#fff;border-radius:8px;padding:10px 12px;font-weight:800;cursor:pointer;">В заказ</button>'
        + '<button type="button" data-price="' + esc(item.id) + '" style="border:none;background:#f3e5f5;color:#6a1b9a;border-radius:8px;padding:10px 12px;font-weight:700;cursor:pointer;">Изменить цену</button>'
        + '</div></div>';
    }).join('')
      + '<div style="margin-top:12px;background:#f7f9fc;border-radius:12px;padding:12px;">'
      + '<div style="font-weight:700;margin-bottom:6px;">В заказе</div>'
      + (orderRows || '<div style="color:#888;">Пока пусто. Добавьте товар и примите заказ в форме ниже.</div>')
      + '</div>';
    panel.querySelectorAll('[data-price]').forEach(function (btn) {
      btn.onclick = function () { changePrice(btn.getAttribute('data-price')); };
    });
    panel.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.onclick = function () { addToOrder(btn.getAttribute('data-add')); };
    });
  }

  function saleCartRows() {
    if (typeof cart === 'undefined' || !cart) return '';
    return cart.filter(function (item) { return item && item.agentSale; }).map(function (item) {
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee;">'
        + '<span>' + esc(item.title) + ' × ' + item.qty + '</span>'
        + '<b>' + (Number(item.price) || 0) + ' сом</b></div>';
    }).join('');
  }

  async function changePrice(id) {
    var item = inventory.filter(function (row) { return row.id === id; })[0];
    if (!item) return;
    var ask = await Swal.fire({
      title: 'Цена для покупателя',
      input: 'number',
      inputValue: Number(item.markupPercent) || 0,
      inputAttributes: { min: 0, max: 500, step: 1 },
      html: 'Укажите процент к закупочной цене. На экране останется только итоговая цена.',
      showCancelButton: true,
      confirmButtonText: 'Сохранить',
      cancelButtonText: 'Отмена'
    });
    if (!ask.isConfirmed) return;
    var pct = Number(ask.value);
    if (!isFinite(pct) || pct < 0 || pct > 500) {
      Swal.fire('Процент', 'Укажите от 0 до 500', 'warning');
      return;
    }
    try {
      var saved = Math.round(pct * 100) / 100;
      await db().collection('agentInventory').doc(agent.id).collection('items').doc(id).update({
        markupPercent: saved,
        updatedAt: Date.now()
      });
      if (typeof cart !== 'undefined' && cart) {
        cart.forEach(function (row) {
          if (row && row.agentSale && row.id === id) {
            row.markupPercent = saved;
            row.basePrice = item.buyPrice;
            row.price = salePrice(item.buyPrice, saved);
          }
        });
        try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {}
      }
      await loadInventory();
      if (typeof renderProductsNow === 'function') renderProductsNow();
    } catch (e) {
      Swal.fire('Не сохранилось', (e && e.message) || 'Ошибка', 'error');
    }
  }

  function addToOrder(id) {
    var item = inventory.filter(function (row) { return row.id === id; })[0];
    if (!item || item.qty <= 0 || typeof cart === 'undefined') {
      Swal.fire('Нет остатка', 'Сначала купите этот товар в разделе «Покупка»', 'info');
      return;
    }
    var qty = Math.floor(Number((document.getElementById('sellQty_' + id) || {}).value) || 0);
    if (qty <= 0 || qty > item.qty) {
      Swal.fire('Количество', 'Можно добавить от 1 до ' + item.qty, 'warning');
      return;
    }
    var price = salePrice(item.buyPrice, item.markupPercent);
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i] && cart[i].id === id && cart[i].agentSale) existing = cart[i];
    }
    var nextQty = existing ? existing.qty + qty : qty;
    if (nextQty > item.qty) {
      Swal.fire('Количество', 'В заказе уже ' + (existing ? existing.qty : 0) + '. Доступно ' + item.qty, 'warning');
      return;
    }
    if (existing) {
      existing.qty = nextQty;
      existing.price = price;
      existing.agentStock = item.qty;
    } else {
      cart.push({
        id: item.id,
        title: item.title,
        price: price,
        basePrice: item.buyPrice,
        markupPercent: item.markupPercent,
        qty: qty,
        image: item.image || '',
        agentSale: true,
        agentStock: item.qty,
        costPrice: 0
      });
    }
    try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {}
    if (typeof updateCart === 'function') updateCart();
    renderSell();
    var form = document.querySelector('.order-form');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function waitOrder(id) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        unsub();
        reject(new Error('Сервер ещё не подтвердил остаток. Обновите раздел через несколько секунд.'));
      }, 25000);
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

  function saleLine(id) {
    var item = null;
    for (var i = 0; i < inventory.length; i++) {
      if (inventory[i] && inventory[i].id === id) item = inventory[i];
    }
    if (!item || item.qty <= 0) return null;
    var own = Number(item.markupPercent);
    var pct = (isFinite(own) && own > 0) ? own : profilePercent();
    return {
      title: item.title,
      image: item.image || '',
      buyPrice: item.buyPrice,
      qty: item.qty,
      percent: pct,
      salePrice: salePrice(item.buyPrice, pct)
    };
  }

  function profilePercent() {
    try {
      if (window.KerbenMarkup && typeof KerbenMarkup.savedPercent === 'function') {
        return KerbenMarkup.savedPercent() || 0;
      }
    } catch (e) {}
    return 0;
  }

  function setFormMode(mode) {
    var table = document.getElementById('productTable');
    var searchBox = document.querySelector('.search-container');
    var form = document.querySelector('.order-form');
    var title = document.getElementById('orderFormTitle');
    var submit = document.getElementById('submitOrder');
    var categories = document.querySelector('.category-tabs');
    if (table) table.style.display = '';
    if (searchBox) searchBox.style.display = '';
    if (categories) categories.style.display = '';
    if (form) form.style.display = '';
    document.body.style.paddingTop = '';
    if (title) {
      title.textContent = mode === 'sell' ? 'Принять заказ' : (mode === 'buy' ? 'Покупка у KERBEN' : 'Оформить заказ');
    }
    if (submit) {
      submit.textContent = mode === 'sell' ? 'Принять заказ' : (mode === 'buy' ? 'Подтвердить покупку' : 'Отправить заказ');
    }
    paintCheckout(mode);
  }

  function paintCheckout(mode) {
    var fieldIds = ['name', 'phone', 'address', 'driverName', 'driverPhone'];
    fieldIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var node = el.parentElement && el.parentElement.classList && el.parentElement.classList.contains('agent-input-wrap')
        ? el.parentElement
        : el;
      node.style.display = mode === 'buy' ? 'none' : '';
    });
    var referred = document.getElementById('referredBy');
    if (referred) {
      var first = referred.options && referred.options[0];
      if (mode === 'buy') {
        referred.style.display = '';
        if (first) first.textContent = 'Кто предлагал? (необязательно)';
      } else {
        referred.style.display = 'none';
        if (first && first.value === '') first.textContent = 'Кто вам порекомендовал? (необязательно)';
      }
    }
    var banner = document.getElementById('agentOrderBanner');
    if (banner) banner.style.display = mode === 'buy' ? 'none' : '';
    var note = document.getElementById('agentSelfBuyNote');
    if (!note && mode === 'buy') {
      var title = document.getElementById('orderFormTitle');
      note = document.createElement('div');
      note.id = 'agentSelfBuyNote';
      note.style.cssText = 'background:#e3f2fd;border-radius:10px;padding:12px;margin-bottom:10px;color:#1565c0;font-size:14px;';
      if (title) title.insertAdjacentElement('afterend', note);
    }
    if (note) {
      if (mode === 'buy' && agent) {
        note.style.display = 'block';
        note.textContent = 'Покупка для себя. Заказ уйдёт на ваши данные: ' + (agent.name || '') + (agent.phone ? ', ' + agent.phone : '');
      } else {
        note.style.display = 'none';
      }
    }
  }

  function showNote(text) {
    var el = box();
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = 'block';
    el.innerHTML = '<div style="background:#fff;border-radius:12px;padding:12px 14px;color:#555;font-size:14px;">' + text + '</div>';
  }

  function showBar() {
    var bar = document.getElementById('agentTradeBar');
    if (!bar || bar.dataset.ready) {
      if (bar) {
        bar.style.cssText = 'display:flex;gap:8px;margin:0 12px 12px;';
        document.body.style.paddingTop = '';
      }
      paintBar();
      return;
    }
    bar.dataset.ready = '1';
    bar.innerHTML = ''
      + '<button type="button" id="agentBarBuy" style="flex:1;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:16px;cursor:pointer;">Покупка</button>'
      + '<button type="button" id="agentBarSell" style="flex:1;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:16px;cursor:pointer;">Продажа</button>';
    document.getElementById('agentBarBuy').onclick = function () { openMode('buy'); };
    document.getElementById('agentBarSell').onclick = function () { openMode('sell'); };
    bar.style.cssText = 'display:flex;gap:8px;margin:0 12px 12px;';
    document.body.style.paddingTop = '';
    paintBar();
  }

  async function ensureCart(kind) {
    if (typeof cart === 'undefined' || !cart || !cart.length) return true;
    var saleOnly = cart.every(function (item) { return item && item.agentSale; });
    if (kind === 'sell' && saleOnly) return true;
    var ask = await Swal.fire({
      title: 'Очистить корзину?',
      text: 'Для этого раздела заказ собирается отдельно.',
      showCancelButton: true,
      confirmButtonText: 'Очистить',
      cancelButtonText: 'Отмена'
    });
    if (!ask.isConfirmed) return false;
    cart.length = 0;
    try { localStorage.removeItem('cart'); } catch (e) {}
    if (typeof updateCart === 'function') updateCart();
    return true;
  }

  async function openMode(next) {
    if (!agent) return;
    if (active && tab === next) return;
    if (!(await ensureCart(next))) return;
    active = true;
    hide();
    if (next === 'sell') {
      try { await loadInventory(); } catch (e) {}
      var hasGoods = inventory.some(function (item) { return item.qty > 0; });
      showNote(hasGoods ? '' : 'В продаже пока ничего нет. Сначала купите товар в разделе «Покупка».');
      watchInventory(true);
    } else {
      watchInventory(false);
      showNote('');
    }
    setFormMode(next);
    tab = next;
    try {
      sessionStorage.setItem('kerbenTradeMode', next);
      localStorage.setItem('kerbenTradeMode', next);
    } catch (e) {}
    paintBar();
    if (typeof renderProductsNow === 'function') renderProductsNow();
  }

  function close() {
    active = false;
    watchInventory(false);
    try {
      sessionStorage.removeItem('kerbenTradeMode');
      localStorage.removeItem('kerbenTradeMode');
    } catch (e) {}
    hide();
    showNote('');
    setFormMode('');
    paintBar();
    if (typeof renderProductsNow === 'function') renderProductsNow();
  }

  function currentAgent() {
    try { return JSON.parse(localStorage.getItem('currentAgent') || 'null'); } catch (e) { return null; }
  }

  async function boot() {
    if (!document.getElementById('agentTradeBar') || !document.getElementById('productTable')) return;
    var stored = currentAgent();
    if (!stored || !stored.id) return;
    try {
      if (typeof kerbenWaitForAuth === 'function') {
        try { await kerbenWaitForAuth(8000); } catch (e) {}
      }
      var snap = await db().collection('agents').doc(stored.id).get();
      var data = snap.exists ? (snap.data() || {}) : {};
      if (data.markupAllowed !== true) return;
      agent = {
        id: stored.id,
        name: stored.name || data.name || '',
        phone: stored.phone || data.phone || ''
      };
      showBar();
      try {
        var savedMode = localStorage.getItem('kerbenTradeMode') || sessionStorage.getItem('kerbenTradeMode');
        if (savedMode === 'buy' || savedMode === 'sell') openMode(savedMode);
      } catch (e) {}
      var table = document.getElementById('productTable');
      if (table && !table.dataset.salePrice) {
        table.dataset.salePrice = '1';
        table.addEventListener('click', function (e) {
          if (!active || tab !== 'sell') return;
          var priceEl = e.target.closest && e.target.closest('.card-price');
          if (!priceEl) return;
          var card = priceEl.closest('.product-card');
          var id = card && card.getAttribute('data-product-id');
          if (id) changePrice(id);
          e.preventDefault();
          e.stopPropagation();
        });
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.KerbenAgentTrade = {
    mount: mount,
    hide: hide,
    close: close,
    mode: function () { return active ? tab : ''; },
    agent: function () { return agent; },
    saleLine: saleLine,
    stockItems: function () {
      return inventory.filter(function (item) { return item && item.qty > 0; });
    },
    refreshSell: function () {
      if (!(active && tab === 'sell')) return;
      loadInventory().then(function () {
        if (typeof renderProductsNow === 'function') renderProductsNow();
      }).catch(function () {});
    }
  };
})(window);
