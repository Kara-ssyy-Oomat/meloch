// ===================================================================
// КЕРБЕН — Оформление заказа агентом на index.html
// ===================================================================
// Что делает:
//   • Если пользователь — агент (localStorage.currentAgent),
//     переключает форму на главной странице в «режим клиента»:
//       — сверху появляется оранжевый баннер «Заказ от агента: X»
//       — плейсхолдеры полей меняются на «Имя клиента», «Телефон клиента», «Адрес клиента»
//       — данные АГЕНТА не подставляются автоматически
//       — под полями появляются автоподсказки из ранее сохранённых клиентов
//   • Работает единообразно с cart.html — данные клиентов хранятся в
//     localStorage.agentClients и подтягиваются из облака при необходимости
//     (customers.registeredByAgentId + clientAgents.agentId).
//
// Экспортирует в window.KerbenAgent:
//   isAgentUser(), getAgentInfo(),
//   getAgentClients(), saveAgentClient(data),
//   restoreAgentClientsFromCloud(),
//   searchAgentClients(query, limit)
// ===================================================================

(function (global) {
  'use strict';

  // ---------- Утилиты ----------
  function _normalizePhoneKey(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function _escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function _searchNorm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function _subseqMatch(query, target) {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  // ---------- Идентификация агента ----------
  function isAgentUser() {
    try {
      const raw = localStorage.getItem('currentAgent');
      if (!raw) return false;
      const a = JSON.parse(raw);
      return !!(a && a.name && (a.id || a.phone));
    } catch (e) { return false; }
  }

  function getAgentInfo() {
    try {
      const raw = localStorage.getItem('currentAgent');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // ---------- Хранилище клиентов агента ----------
  function getAgentClients() {
    try {
      const raw = localStorage.getItem('agentClients');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {}
    try {
      const last = JSON.parse(localStorage.getItem('agentLastClient') || 'null');
      if (last && last.name && last.phone) {
        return [{ name: last.name, phone: last.phone, address: last.address || '', updatedAt: Date.now() }];
      }
    } catch (e) {}
    return [];
  }

  function saveAgentClient(data) {
    try {
      if (!data || !data.name || !data.phone) return;
      const list = getAgentClients();
      const phoneKey = _normalizePhoneKey(data.phone);
      if (!phoneKey) return;
      const idx = list.findIndex(function (c) { return _normalizePhoneKey(c.phone) === phoneKey; });
      const record = {
        name: String(data.name).trim(),
        phone: String(data.phone).trim(),
        address: String(data.address || '').trim(),
        updatedAt: Date.now()
      };
      if (idx >= 0) list[idx] = Object.assign({}, list[idx], record);
      else list.push(record);
      list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      if (list.length > 500) list.length = 500;
      localStorage.setItem('agentClients', JSON.stringify(list));
      localStorage.setItem('agentLastClient', JSON.stringify(record));
    } catch (e) {}
  }

  // ---------- Восстановление из облака ----------
  let _restorePromise = null;
  function restoreAgentClientsFromCloud() {
    if (_restorePromise) return _restorePromise;
    _restorePromise = (async function () {
      try {
        if (!isAgentUser()) return 0;
        let agentInfo = getAgentInfo();
        if (!agentInfo) return 0;
        if (typeof db === 'undefined' || !db) return 0;

        if (typeof kerbenWaitForAuth === 'function') {
          try { await kerbenWaitForAuth(8000); } catch (e) {}
        }

        // Если нет id — ищем агента по phone
        if (!agentInfo.id && agentInfo.phone) {
          try {
            const phone = String(agentInfo.phone).trim();
            const variants = [phone];
            let n = phone.replace(/[^\d+]/g, '');
            if (n.startsWith('0')) n = '+996' + n.substring(1);
            else if (!n.startsWith('+')) n = (n.startsWith('996') ? '+' : '+996') + n;
            if (!variants.includes(n)) variants.push(n);
            if (n.startsWith('+996')) {
              variants.push('0' + n.substring(4));
              variants.push(n.substring(1));
            }
            for (const v of variants) {
              const s = await db.collection('agents').where('phone', '==', v).limit(1).get();
              if (!s.empty) {
                agentInfo = {
                  id: s.docs[0].id,
                  name: s.docs[0].data().name || agentInfo.name || '',
                  phone: s.docs[0].data().phone || phone
                };
                try { localStorage.setItem('currentAgent', JSON.stringify(agentInfo)); } catch (e) {}
                break;
              }
            }
          } catch (e) { console.warn('[Agent] поиск agentId по phone:', e && e.message); }
        }
        if (!agentInfo.id) return 0;

        const _tsToMs = function (t) {
          if (!t) return 0;
          if (typeof t === 'number') return t;
          if (typeof t.toMillis === 'function') { try { return t.toMillis(); } catch (e) {} }
          if (typeof t.seconds === 'number') return t.seconds * 1000;
          return 0;
        };

        const [customersSnap, clientAgentsSnap] = await Promise.all([
          db.collection('customers')
            .where('registeredByAgentId', '==', agentInfo.id)
            .limit(500).get()
            .catch(function (err) { console.warn('[Agent] customers query:', err && err.message); return null; }),
          db.collection('clientAgents')
            .where('agentId', '==', agentInfo.id)
            .limit(500).get()
            .catch(function (err) { console.warn('[Agent] clientAgents query:', err && err.message); return null; })
        ]);

        const restored = new Map();

        if (customersSnap) {
          customersSnap.forEach(function (doc) {
            const d = doc.data() || {};
            const phone = d.phone || doc.id;
            const key = _normalizePhoneKey(phone);
            if (!key || !d.name) return;
            restored.set(key, {
              name: d.name,
              phone: phone,
              address: d.address || '',
              updatedAt: _tsToMs(d.createdAt) || _tsToMs(d.updatedAt) || 0
            });
          });
        }

        if (clientAgentsSnap && clientAgentsSnap.size > 0) {
          const joins = [];
          clientAgentsSnap.forEach(function (doc) {
            const d = doc.data() || {};
            const phone = d.phone || doc.id;
            const key = _normalizePhoneKey(phone);
            if (!key || restored.has(key)) return;
            joins.push((async function () {
              let address = '';
              let name = d.clientName || '';
              try {
                const cDoc = await db.collection('customers').doc(phone).get();
                if (cDoc && cDoc.exists) {
                  const cd = cDoc.data() || {};
                  address = cd.address || '';
                  if (!name) name = cd.name || '';
                }
              } catch (e) {}
              if (!name) name = 'Клиент';
              restored.set(key, {
                name: name,
                phone: phone,
                address: address,
                updatedAt: _tsToMs(d.updatedAt) || 0
              });
            })());
          });
          await Promise.all(joins);
        }

        if (restored.size === 0) return 0;

        const existing = getAgentClients();
        const merged = new Map();
        for (const c of existing) {
          const k = _normalizePhoneKey(c.phone);
          if (k) merged.set(k, c);
        }
        for (const [k, c] of restored.entries()) {
          const cur = merged.get(k);
          if (!cur || (c.updatedAt || 0) > (cur.updatedAt || 0)) merged.set(k, c);
        }
        const list = Array.from(merged.values())
          .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
          .slice(0, 500);
        try { localStorage.setItem('agentClients', JSON.stringify(list)); } catch (e) {}
        try { localStorage.setItem('agentLastClient', JSON.stringify(list[0])); } catch (e) {}
        return list.length;
      } catch (e) {
        console.warn('[Agent] restoreAgentClientsFromCloud:', e && e.message);
        _restorePromise = null;
        return 0;
      }
    })();
    return _restorePromise;
  }

  // ---------- Поиск клиентов ----------
  function searchAgentClients(query, limit) {
    const q = _searchNorm(query);
    if (!q) return [];
    const list = getAgentClients();
    const qDigits = q.replace(/\D/g, '');
    const scored = [];
    for (const c of list) {
      const nameN = _searchNorm(c.name);
      const addressN = _searchNorm(c.address);
      const phoneDigits = _normalizePhoneKey(c.phone);
      let score = 0;
      if (nameN.startsWith(q)) score = 100;
      else if (nameN.includes(q)) score = 80;
      else if (qDigits && phoneDigits.includes(qDigits)) score = 70;
      else if (addressN.includes(q)) score = 50;
      else if (_subseqMatch(q, nameN)) score = 30;
      if (score > 0) scored.push({ client: c, score: score });
    }
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.client.updatedAt || 0) - (a.client.updatedAt || 0);
    });
    return scored.slice(0, limit || 8).map(function (x) { return x.client; });
  }

  // ---------- UI на index.html ----------
  function initIndexOrderForm() {
    const nameInput = document.getElementById('name');
    const phoneInput = document.getElementById('phone');
    const addressInput = document.getElementById('address');
    const formContainer = nameInput && nameInput.closest('.order-form');
    if (!nameInput || !phoneInput || !addressInput || !formContainer) return;
    if (!isAgentUser()) return; // Не агент — стандартный режим, ничего не трогаем

    const agentInfo = getAgentInfo();
    if (!agentInfo) return;

    // Меняем плейсхолдеры и лейблы
    nameInput.placeholder = 'Имя клиента';
    phoneInput.placeholder = 'Телефон клиента (+996...)';
    addressInput.placeholder = 'Адрес клиента';

    // Очищаем поля, если там данные АГЕНТА (fillOrderFormWithCustomerData
    // мог их подставить до того как этот скрипт запустился)
    try {
      const cd = JSON.parse(localStorage.getItem('customerData') || '{}');
      // Если поля совпадают с собственными данными агента — очищаем
      const agentPhoneDigits = _normalizePhoneKey(agentInfo.phone);
      if (nameInput.value && (nameInput.value === agentInfo.name || nameInput.value === cd.name)) nameInput.value = '';
      if (phoneInput.value && _normalizePhoneKey(phoneInput.value) === agentPhoneDigits) phoneInput.value = '';
      if (addressInput.value && addressInput.value === cd.address) addressInput.value = '';
    } catch (e) {}

    // Баннер сверху формы
    if (!document.getElementById('agentOrderBanner')) {
      const heading = formContainer.querySelector('h2');
      const banner = document.createElement('div');
      banner.id = 'agentOrderBanner';
      banner.style.cssText = 'background:linear-gradient(135deg,#fff3e0,#ffe0b2); border:2px solid #ff9800; padding:12px; border-radius:10px; margin-bottom:14px; text-align:left;';
      banner.innerHTML =
        '<div style="font-size:14px; font-weight:700; color:#e65100; margin-bottom:4px;">' +
          '👤 Заказ от агента: ' + _escapeHtml(agentInfo.name) +
        '</div>' +
        '<div style="font-size:12px; color:#bf360c;">Введите данные <b>КЛИЕНТА</b>, для которого оформляете заказ.</div>' +
        '<div id="agentOrderHint" style="margin-top:6px; font-size:11px; color:#795548;">' +
          (getAgentClients().length > 0
            ? '💡 Сохранено клиентов: <b>' + getAgentClients().length + '</b>. Начните вводить имя или телефон — появятся подсказки.'
            : '⏳ Загружаем ваших клиентов из облака...') +
        '</div>';
      if (heading && heading.parentNode === formContainer) {
        heading.insertAdjacentElement('afterend', banner);
      } else {
        formContainer.insertBefore(banner, formContainer.firstChild);
      }
    }

    // Suggest-box (один для всех трёх полей, position:absolute — перемещаем по DOM)
    let suggestBox = document.getElementById('agentOrderSuggest');
    if (!suggestBox) {
      suggestBox = document.createElement('div');
      suggestBox.id = 'agentOrderSuggest';
      suggestBox.style.cssText = 'position:absolute; left:0; right:0; top:100%; background:#fff; border:1px solid #ddd; border-radius:8px; max-height:240px; overflow-y:auto; z-index:9999; display:none; box-shadow:0 6px 20px rgba(0,0,0,0.15); margin-top:4px;';
      // Оборачиваем каждый input в div с position:relative, чтобы suggestBox
      // позиционировался прямо под ним.
      [nameInput, phoneInput, addressInput].forEach(function (inp) {
        if (inp.parentElement && getComputedStyle(inp.parentElement).position !== 'static'
            && inp.parentElement.className === 'agent-input-wrap') return;
        const wrap = document.createElement('div');
        wrap.className = 'agent-input-wrap';
        wrap.style.cssText = 'position:relative;';
        inp.parentNode.insertBefore(wrap, inp);
        wrap.appendChild(inp);
      });
      // Первоначально кладём suggestBox в контейнер name-поля
      nameInput.parentElement.appendChild(suggestBox);
    }

    // Автоподсказки
    const allInputs = [nameInput, phoneInput, addressInput];
    let currentMatches = [];

    function updateHint(count) {
      const hint = document.getElementById('agentOrderHint');
      if (!hint) return;
      hint.innerHTML = count > 0
        ? '💡 Сохранено клиентов: <b>' + count + '</b>. Начните вводить имя или телефон — появятся подсказки.'
        : 'ℹ️ У вас пока нет сохранённых клиентов. Первый заказ добавит клиента в список автоподсказок.';
    }

    function hide() { suggestBox.style.display = 'none'; }

    function moveTo(input) {
      const parent = input.parentElement;
      if (parent && suggestBox.parentElement !== parent) parent.appendChild(suggestBox);
    }

    function renderFor(input, query) {
      moveTo(input);
      currentMatches = searchAgentClients(query, 8);
      if (currentMatches.length === 0) { hide(); return; }
      suggestBox.innerHTML = currentMatches.map(function (c, i) {
        return '<div class="kaof-item" data-idx="' + i + '" style="padding:10px 12px; cursor:pointer; border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-weight:600; font-size:14px; color:#333;">' + _escapeHtml(c.name) + '</div>' +
          '<div style="font-size:12px; color:#666; margin-top:2px;">📞 ' + _escapeHtml(c.phone) + '</div>' +
          (c.address ? '<div style="font-size:11px; color:#888; margin-top:2px;">📍 ' + _escapeHtml(c.address) + '</div>' : '') +
          '</div>';
      }).join('');
      suggestBox.style.display = 'block';
      suggestBox.querySelectorAll('.kaof-item').forEach(function (el) {
        el.addEventListener('mousedown', function (e) {
          e.preventDefault();
          const idx = parseInt(el.dataset.idx, 10);
          const c = currentMatches[idx];
          if (!c) return;
          nameInput.value = c.name || '';
          phoneInput.value = c.phone || '';
          addressInput.value = c.address || '';
          hide();
        });
        el.addEventListener('mouseenter', function () { el.style.background = '#f5f5f5'; });
        el.addEventListener('mouseleave', function () { el.style.background = '#fff'; });
      });
    }

    function renderForAnyFilled() {
      const active = document.activeElement;
      if (active && allInputs.includes(active) && active.value) {
        renderFor(active, active.value);
        return;
      }
      for (const inp of allInputs) {
        if (inp.value && inp.value.trim()) { renderFor(inp, inp.value); return; }
      }
    }

    allInputs.forEach(function (inp) {
      inp.addEventListener('input', function () { renderFor(inp, inp.value); });
      inp.addEventListener('focus', function () { renderFor(inp, inp.value); });
    });

    document.addEventListener('mousedown', function (e) {
      if (suggestBox.contains(e.target)) return;
      if (allInputs.includes(e.target)) return;
      hide();
    });

    // Загружаем клиентов из облака (тихо в фоне)
    Promise.resolve(restoreAgentClientsFromCloud()).then(function (count) {
      updateHint(count);
      if (count > 0) renderForAnyFilled();
    }).catch(function () {});
  }

  // ---------- Экспорт ----------
  global.KerbenAgent = {
    isAgentUser: isAgentUser,
    getAgentInfo: getAgentInfo,
    getAgentClients: getAgentClients,
    saveAgentClient: saveAgentClient,
    restoreAgentClientsFromCloud: restoreAgentClientsFromCloud,
    searchAgentClients: searchAgentClients
  };

  // ---------- Инициализация ----------
  // На index.html — сразу перестраиваем форму под агента.
  // Задержка чтобы customer-auth.js успел подставить свои значения — мы их сотрём.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(initIndexOrderForm, 300);
    });
  } else {
    setTimeout(initIndexOrderForm, 300);
  }
})(window);
