// =====================================================================
// КЕРБЕН — Block Protection
// Модуль блокировки клиентов админом.
//
// Что делает:
//   1. При загрузке страницы — проверяет, не заблокирован ли текущий
//      пользователь. Если да — показывает заглушку "Доступ заблокирован"
//      и останавливает работу сайта.
//   2. Предоставляет админу UI для блокировки/разблокировки клиентов.
//   3. Запись о блоке хранится в коллекции blockedClients
//      (несколько вариантов телефона как отдельные документы).
// =====================================================================

(function () {

  // Все возможные варианты записи телефона. Блокируем по каждому,
  // чтобы поймать заказ независимо от формата.
  function _phoneVariants(rawPhone) {
    const onlyDigits = String(rawPhone || '').replace(/[^\d]/g, '');
    if (!onlyDigits) return [];
    const set = new Set();

    set.add(onlyDigits);                      // 996559009860
    set.add('+' + onlyDigits);                // +996559009860

    if (onlyDigits.startsWith('996') && onlyDigits.length === 12) {
      set.add('0' + onlyDigits.substring(3)); // 0559009860
      set.add(onlyDigits.substring(3));       // 559009860
    }
    if (onlyDigits.length === 9) {
      set.add('996' + onlyDigits);
      set.add('+996' + onlyDigits);
      set.add('0' + onlyDigits);
    }
    if (onlyDigits.length === 10 && onlyDigits.startsWith('0')) {
      set.add('996' + onlyDigits.substring(1));
      set.add('+996' + onlyDigits.substring(1));
      set.add(onlyDigits.substring(1));
    }
    return [...set];
  }

  function _isAdmin() {
    return (typeof isAdmin !== 'undefined' && isAdmin) || window.isAdmin === true;
  }

  // ============== БЛОКИРОВКА КЛИЕНТА (админ) ==============
  async function blockClient(phone, reason) {
    if (!_isAdmin()) {
      Swal.fire('Ошибка', 'Только админ может блокировать клиентов', 'error');
      return false;
    }
    const variants = _phoneVariants(phone);
    if (variants.length === 0) {
      Swal.fire('Ошибка', 'Введите корректный номер телефона', 'warning');
      return false;
    }
    try {
      const blockedAt = Date.now();
      const blockedBy = (typeof currentCustomer !== 'undefined' && currentCustomer && currentCustomer.phone) || 'admin';
      const batch = db.batch();
      for (const v of variants) {
        const ref = db.collection('blockedClients').doc(v);
        batch.set(ref, {
          phone: v,
          rawPhone: phone,
          reason: reason || '',
          blockedAt,
          blockedBy
        });
      }
      await batch.commit();
      Swal.fire({
        icon: 'success',
        title: 'Клиент заблокирован',
        text: phone,
        timer: 1500,
        showConfirmButton: false
      });
      return true;
    } catch (e) {
      console.error('Block error:', e);
      Swal.fire('Ошибка', e && e.message ? e.message : String(e), 'error');
      return false;
    }
  }

  // ============== РАЗБЛОКИРОВКА КЛИЕНТА (админ) ==============
  async function unblockClient(phone) {
    if (!_isAdmin()) {
      Swal.fire('Ошибка', 'Только админ может разблокировать клиентов', 'error');
      return false;
    }
    const variants = _phoneVariants(phone);
    try {
      const batch = db.batch();
      for (const v of variants) {
        batch.delete(db.collection('blockedClients').doc(v));
      }
      await batch.commit();
      Swal.fire({
        icon: 'success',
        title: 'Клиент разблокирован',
        text: phone,
        timer: 1500,
        showConfirmButton: false
      });
      return true;
    } catch (e) {
      console.error('Unblock error:', e);
      Swal.fire('Ошибка', e && e.message ? e.message : String(e), 'error');
      return false;
    }
  }

  // ============== ПРОВЕРКА ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==============
  async function checkIfCurrentUserBlocked() {
    try {
      if (typeof db === 'undefined' || !db) return;

      // Собираем все возможные телефоны текущего пользователя
      const phones = [];
      try {
        const cust = JSON.parse(localStorage.getItem('customerData') || 'null');
        if (cust && cust.phone) phones.push(...(_phoneVariants(cust.phone) || []));
      } catch (e) {}
      try {
        const ud = JSON.parse(localStorage.getItem('userData') || 'null');
        if (ud && ud.phone) phones.push(...(_phoneVariants(ud.phone) || []));
      } catch (e) {}

      if (phones.length === 0) return;

      const ids = [...new Set(phones)].slice(0, 10);

      const checks = await Promise.all(ids.map(id =>
        db.collection('blockedClients').doc(id).get().catch(() => null)
      ));
      const blockedDoc = checks.find(d => d && d.exists);
      if (blockedDoc) {
        const data = blockedDoc.data() || {};
        showBlockScreen(data.reason || '');
      }
    } catch (e) {
      console.warn('Block check failed:', e);
    }
  }

  // Полноэкранная заглушка "Доступ заблокирован"
  function showBlockScreen(reason) {
    try {
      // Чистим хранилища, чтобы заблокированный не мог писать заказы
      // даже после перезагрузки (на случай если он что-то заполнил).
      const keep = ['app_version'];
      const all = Object.keys(localStorage);
      all.forEach(k => { if (!keep.includes(k)) localStorage.removeItem(k); });
    } catch (e) {}

    document.documentElement.innerHTML = `
      <html>
        <head>
          <title>Доступ заблокирован</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#dc3545,#a71d2a); font-family:Arial,sans-serif; color:#333;">
          <div style="text-align:center; background:white; padding:40px 30px; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.3); max-width:500px; margin:20px;">
            <div style="font-size:80px; margin-bottom:20px;">🚫</div>
            <h1 style="color:#dc3545; margin:0 0 16px; font-size:26px;">Доступ заблокирован</h1>
            <p style="color:#555; margin:0 0 12px; font-size:15px; line-height:1.5;">
              Ваш аккаунт был заблокирован администратором.
            </p>
            ${reason ? `<p style="color:#666; margin:16px 0; padding:12px; background:#f8f9fa; border-left:4px solid #dc3545; font-size:13px; text-align:left; border-radius:6px;"><b>Причина:</b> ${reason}</p>` : ''}
            <p style="color:#888; margin:16px 0 0; font-size:12px;">
              Для разблокировки свяжитесь с администратором.
            </p>
          </div>
        </body>
      </html>
    `;
    if (window.stop) try { window.stop(); } catch (e) {}
    throw new Error('Account blocked');
  }

  // ============== АДМИН-UI: МЕНЕДЖЕР БЛОКИРОВОК ==============
  async function openBlockedClientsManager() {
    if (!_isAdmin()) {
      Swal.fire('Ошибка', 'Доступ только для админа', 'error');
      return;
    }

    let blocked = [];
    try {
      const snap = await db.collection('blockedClients').get();
      const seen = new Set();
      snap.forEach(doc => {
        const d = doc.data() || {};
        const key = d.rawPhone || d.phone || doc.id;
        if (seen.has(key)) return;
        seen.add(key);
        blocked.push({ ...d, id: doc.id });
      });
    } catch (e) {
      Swal.fire('Ошибка', 'Не удалось загрузить список: ' + (e.message || e), 'error');
      return;
    }

    let listHtml = '';
    if (blocked.length === 0) {
      listHtml = '<p style="color:#888; text-align:center; padding:20px;">Нет заблокированных клиентов</p>';
    } else {
      listHtml = blocked.map(b => {
        const phoneEsc = (b.rawPhone || b.phone || '').replace(/'/g, "\\'");
        return `
          <div style="background:#fff5f5; border:1px solid #ffcdd2; border-radius:8px; padding:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="text-align:left; flex:1; min-width:0;">
              <div style="font-weight:600; color:#c62828;">📵 ${b.rawPhone || b.phone || b.id}</div>
              ${b.reason ? `<div style="color:#666; font-size:13px; margin-top:4px;">${b.reason}</div>` : ''}
              <div style="color:#999; font-size:11px; margin-top:4px;">${b.blockedAt ? new Date(b.blockedAt).toLocaleString() : ''}</div>
            </div>
            <button onclick="unblockClientFromUI('${phoneEsc}')" style="background:#28a745; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px;">Разблокировать</button>
          </div>
        `;
      }).join('');
    }

    Swal.fire({
      title: '🚫 Заблокированные клиенты',
      html: `
        <div style="text-align:left;">
          <button onclick="addBlockFromUI()" style="width:100%; background:linear-gradient(135deg,#dc3545,#c62828); color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-size:15px; font-weight:600; margin-bottom:15px;">
            ➕ Заблокировать новый номер
          </button>
          <div style="max-height:400px; overflow-y:auto;">
            ${listHtml}
          </div>
        </div>
      `,
      width: 500,
      showCloseButton: true,
      showConfirmButton: false
    });
  }

  async function addBlockFromUI() {
    const result = await Swal.fire({
      title: 'Заблокировать клиента',
      html: `
        <div style="text-align:left;">
          <label style="display:block; margin-bottom:5px; font-weight:600;">Номер телефона:</label>
          <input id="block-phone" type="tel" placeholder="0559009860" style="width:100%; padding:10px; border:2px solid #ddd; border-radius:6px; font-size:15px; box-sizing:border-box; margin-bottom:12px;">
          <label style="display:block; margin-bottom:5px; font-weight:600;">Причина (опционально):</label>
          <input id="block-reason" type="text" placeholder="Подозрительные заказы" style="width:100%; padding:10px; border:2px solid #ddd; border-radius:6px; font-size:15px; box-sizing:border-box;">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Заблокировать',
      cancelButtonText: 'Отмена',
      confirmButtonColor: '#dc3545',
      preConfirm: () => {
        const phone = document.getElementById('block-phone').value.trim();
        const reason = document.getElementById('block-reason').value.trim();
        if (!phone) {
          Swal.showValidationMessage('Введите номер');
          return false;
        }
        return { phone, reason };
      }
    });

    if (result.isConfirmed && result.value) {
      await blockClient(result.value.phone, result.value.reason);
      openBlockedClientsManager();
    }
  }

  async function unblockClientFromUI(phone) {
    const r = await Swal.fire({
      title: 'Разблокировать?',
      text: `Снять блокировку с ${phone}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Да, разблокировать',
      cancelButtonText: 'Отмена',
      confirmButtonColor: '#28a745'
    });
    if (r.isConfirmed) {
      await unblockClient(phone);
      openBlockedClientsManager();
    }
  }

  // Делаем нужные функции глобальными
  window.blockClient = blockClient;
  window.unblockClient = unblockClient;
  window.openBlockedClientsManager = openBlockedClientsManager;
  window.addBlockFromUI = addBlockFromUI;
  window.unblockClientFromUI = unblockClientFromUI;

  // Запуск проверки на загрузке (ждём готовности Firestore)
  function _runBlockCheck() {
    if (typeof db !== 'undefined' && db) {
      checkIfCurrentUserBlocked();
    } else {
      setTimeout(_runBlockCheck, 400);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _runBlockCheck);
  } else {
    _runBlockCheck();
  }

})();
