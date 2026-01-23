// ===== ORDERS MANAGEMENT MODULE =====
// Управление заказами (админ-панель): кеш, поиск, редактирование, объединение

// ====== Управление заказами: кеш + быстрый поиск (важно для iPhone) ======
let ordersManagementAllOrders = null;
let ordersManagementSearchDebounceTimer = null;
let _ordersSearchComposing = false;

function scheduleOrdersManagementSearch() {
  if (_ordersSearchComposing) return;
  clearTimeout(ordersManagementSearchDebounceTimer);
  ordersManagementSearchDebounceTimer = setTimeout(() => {
    renderOrdersManagementFromCache();
  }, _isIOS ? 350 : 200);
}

// Обработка комбинированного фильтра
function applyOrdersCombinedFilter() {
  const combo = document.getElementById('ordersFilterCombined');
  if (!combo) return;
  const [status, date] = combo.value.split('|');
  
  const statusEl = document.getElementById('ordersFilterStatus');
  const dateEl = document.getElementById('ordersFilterDate');
  if (statusEl) statusEl.value = status;
  if (dateEl) dateEl.value = date;
  
  updateOrdersManagementView();
}

// Обработка iOS composition для поиска заказов
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('ordersSearchClient');
  if (searchInput) {
    searchInput.addEventListener('compositionstart', () => { _ordersSearchComposing = true; });
    searchInput.addEventListener('compositionend', () => { _ordersSearchComposing = false; scheduleOrdersManagementSearch(); });
  }
});

function updateOrdersManagementView() {
  if (Array.isArray(ordersManagementAllOrders)) {
    renderOrdersManagementFromCache();
  } else {
    loadOrdersManagement(true);
  }
}

function renderOrdersManagementFromCache() {
  const listDiv = document.getElementById('ordersManagementList');
  if (!listDiv) return;

  if (!Array.isArray(ordersManagementAllOrders)) {
    listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">⏳ Загрузка заказов...</div>';
    return;
  }

  const dateFilterEl = document.getElementById('ordersFilterDate');
  const statusFilterEl = document.getElementById('ordersFilterStatus');
  const searchEl = document.getElementById('ordersSearchClient');

  const dateFilter = dateFilterEl ? dateFilterEl.value : 'all';
  const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
  const searchQuery = ((searchEl ? searchEl.value : '') || '').toLowerCase();

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  let orders = ordersManagementAllOrders.filter(order => {
    const timestamp = order.timestamp || Date.now();

    let dateMatch = true;
    if (dateFilter === 'today') {
      dateMatch = (now - timestamp) < oneDayMs;
    } else if (dateFilter === 'week') {
      dateMatch = (now - timestamp) < (7 * oneDayMs);
    } else if (dateFilter === 'month') {
      dateMatch = (now - timestamp) < (30 * oneDayMs);
    }

    const status = order.status || 'pending';
    const statusMatch = statusFilter === 'all' || status === statusFilter;

    const name = (order.name || '').toLowerCase();
    const phone = (order.phone || '').toLowerCase();
    const searchMatch = !searchQuery || name.includes(searchQuery) || phone.includes(searchQuery);

    return dateMatch && statusMatch && searchMatch;
  });

  orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (orders.length === 0) {
    listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:60px; font-size:16px;">🔍 Заказы не найдены</div>';
    return;
  }

  listDiv.innerHTML = '';
  orders.forEach((order, index) => {
    const orderCard = createOrderCard(order, index);
    listDiv.appendChild(orderCard);
  });
}

// Открыть окно управления заказами
function openOrdersManagementWindow() {
  const window = document.getElementById('ordersManagementWindow');
  if (window) {
    window.style.display = 'flex';
    lockPageScroll();
    loadOrdersManagement(true);
  }
}

// Закрыть окно управления заказами
function closeOrdersManagementWindow() {
  const window = document.getElementById('ordersManagementWindow');
  if (window) {
    window.style.display = 'none';
    unlockPageScroll();
  }
}

// Загрузить список заказов для управления (forceRefresh=true принудительно читает Firestore)
async function loadOrdersManagement(forceRefresh = false) {
  const listDiv = document.getElementById('ordersManagementList');
  if (!listDiv) return;

  // Если данные уже загружены и нас не просят обновить — просто перерисуем по текущим фильтрам
  if (!forceRefresh && Array.isArray(ordersManagementAllOrders)) {
    renderOrdersManagementFromCache();
    return;
  }

  listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">⏳ Загрузка заказов...</div>';

  try {
    const ordersSnapshot = await db.collection('orders').get();

    if (ordersSnapshot.empty) {
      ordersManagementAllOrders = [];
      listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:60px; font-size:16px;">📭 Заказов пока нет</div>';
      return;
    }

    const all = [];
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      const timestamp = data.timestamp || Date.now();
      all.push({ id: doc.id, ...data, timestamp });
    });

    ordersManagementAllOrders = all;
    renderOrdersManagementFromCache();
  } catch (error) {
    console.error('Ошибка загрузки заказов:', error);
    listDiv.innerHTML = '<div style="text-align:center; color:#dc3545; padding:40px;">❌ Ошибка загрузки заказов</div>';
  }
}

// Создать карточку заказа
function createOrderCard(order, index) {
  const card = document.createElement('div');
  card.className = 'order-card';
  card.style.cssText = 'background:#fff; border-radius:12px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,0.08); overflow:hidden;';
  
  const date = new Date(order.timestamp);
  const dateStr = date.toLocaleDateString('ru-RU', {day:'2-digit', month:'short'}) + ', ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
  
  const status = order.status || 'pending';
  const statusMap = {
    pending: { icon: '🕐', text: 'Новый', color: '#ff9800', bg: '#fff3e0' },
    preparing: { icon: '📦', text: 'Готовится', color: '#2196f3', bg: '#e3f2fd' },
    logistics: { icon: '🚚', text: 'Логистика', color: '#9c27b0', bg: '#f3e5f5' },
    driver: { icon: '🚗', text: 'Доставка', color: '#00bcd4', bg: '#e0f7fa' },
    completed: { icon: '✓', text: 'Готов', color: '#4caf50', bg: '#e8f5e9' },
    cancelled: { icon: '✕', text: 'Отменён', color: '#f44336', bg: '#ffebee' }
  };
  const st = statusMap[status] || statusMap.pending;
  
  const items = order.items || [];
  const total = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const itemsCount = items.reduce((sum, i) => sum + i.qty, 0);
  
  card.innerHTML = `
    <div style="display:flex; align-items:stretch;">
      <!-- Левая полоса статуса -->
      <div style="width:4px; background:${st.color};"></div>
      
      <!-- Основной контент -->
      <div style="flex:1; padding:14px;">
        <!-- Верхняя строка: клиент и статус -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <div style="flex:1;">
            <div style="font-size:15px; font-weight:600; color:#1a1a1a; margin-bottom:2px;">
              ${order.name || 'Без имени'}
            </div>
            <div style="font-size:13px; color:#666;">
              ${order.phone || ''} ${order.address ? '• ' + order.address.substring(0,30) + (order.address.length > 30 ? '...' : '') : ''}
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
            <div style="background:${st.bg}; color:${st.color}; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px;">
              ${st.icon} ${st.text}
            </div>
            <div style="font-size:11px; color:#999;">${dateStr}</div>
          </div>
        </div>
        
        <!-- Товары и сумма -->
        <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#f8f9fa; border-radius:8px; margin-bottom:10px;">
          <div style="flex:1;">
            <span style="font-size:13px; color:#555;">
              ${items.length > 0 ? items.slice(0,2).map(i => i.title).join(', ') + (items.length > 2 ? ' +' + (items.length - 2) : '') : 'Нет товаров'}
            </span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:15px; font-weight:700; color:#1a1a1a;">${total.toLocaleString()} с</div>
            <div style="font-size:11px; color:#888;">${itemsCount} шт</div>
          </div>
        </div>
        
        <!-- Действия -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <select onchange="updateOrderStatus('${order.id}', this.value); this.blur();" style="padding:8px 10px; border:1px solid #e0e0e0; border-radius:6px; font-size:12px; background:#fff; cursor:pointer; color:#333;">
            <option value="pending" ${status === 'pending' ? 'selected' : ''}>🕐 Новый</option>
            <option value="preparing" ${status === 'preparing' ? 'selected' : ''}>📦 Готовится</option>
            <option value="logistics" ${status === 'logistics' ? 'selected' : ''}>🚚 Логистика</option>
            <option value="driver" ${status === 'driver' ? 'selected' : ''}>🚗 Доставка</option>
            <option value="completed" ${status === 'completed' ? 'selected' : ''}>✓ Готов</option>
            <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>✕ Отменён</option>
          </select>
          <button onclick="openOrderItemsDetailModal('${order.id}', '${(order.name || '').replace(/'/g, "\\'")}', '${order.phone || ''}', '${dateStr}')" style="padding:8px 12px; background:#007bff; color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer;">📋 Товары</button>
          <button onclick="openEditOrderModal('${order.id}')" style="padding:8px 12px; background:#ff9800; color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer;">✏️ Редактировать</button>
          <div style="display:flex; gap:6px;">
            <button onclick="exportOrderToExcel('${order.id}', '${(order.name || '').replace(/'/g, "\\'")}', '${order.phone || ''}')" style="flex:1; padding:8px 12px; background:#25d366; color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer;">📤</button>
            <button onclick="deleteOrder('${order.id}')" style="flex:1; padding:8px 12px; background:#f44336; color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer;">🗑️</button>
          </div>
        </div>
        
        ${order.partner || order.referredBy ? `<div style="margin-top:8px;"><span style="font-size:11px; background:#e3f2fd; color:#1976d2; padding:3px 8px; border-radius:4px;">🤝 ${order.partner || order.referredBy}</span></div>` : ''}
      </div>
    </div>
  `;
  
  return card;
}

// ===== Редактирование заказа (контакты/адрес/водитель/рекомендация) =====
let currentEditOrderId = null;

async function openEditOrderModal(orderId) {
  currentEditOrderId = orderId;
  const modal = document.getElementById('editOrderModal');
  modal.style.display = 'flex';
  lockPageScroll();

  document.getElementById('editOrderModalInfo').textContent = '⏳ Загрузка...';
  document.getElementById('editOrderName').value = '';
  document.getElementById('editOrderPhone').value = '';
  document.getElementById('editOrderAddress').value = '';
  document.getElementById('editOrderDriverName').value = '';
  document.getElementById('editOrderDriverPhone').value = '';
  document.getElementById('editOrderReferredBy').value = '';

  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new Error('Заказ не найден');
    }
    const order = orderDoc.data() || {};
    const date = new Date(order.timestamp || Date.now());
    const dateStr = date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
    document.getElementById('editOrderModalInfo').textContent = `📅 ${dateStr}`;

    document.getElementById('editOrderName').value = order.name || '';
    document.getElementById('editOrderPhone').value = order.phone || '';
    document.getElementById('editOrderAddress').value = order.address || '';
    document.getElementById('editOrderDriverName').value = order.driverName || '';
    document.getElementById('editOrderDriverPhone').value = order.driverPhone || '';
    document.getElementById('editOrderReferredBy').value = order.referredBy || order.partner || '';
  } catch (error) {
    console.error('Ошибка загрузки заказа для редактирования:', error);
    Swal.fire('Ошибка', error && error.message ? error.message : 'Не удалось загрузить заказ', 'error');
    closeEditOrderModal();
  }
}

function closeEditOrderModal() {
  const modal = document.getElementById('editOrderModal');
  modal.style.display = 'none';
  unlockPageScroll();
  currentEditOrderId = null;
}

async function saveEditOrder() {
  if (!currentEditOrderId) return;

  const name = (document.getElementById('editOrderName').value || '').trim();
  const phone = (document.getElementById('editOrderPhone').value || '').trim();
  const address = (document.getElementById('editOrderAddress').value || '').trim();
  const driverName = (document.getElementById('editOrderDriverName').value || '').trim();
  const driverPhone = (document.getElementById('editOrderDriverPhone').value || '').trim();
  const referredBy = (document.getElementById('editOrderReferredBy').value || '').trim();

  try {
    await db.collection('orders').doc(currentEditOrderId).update({
      name,
      phone,
      address,
      driverName,
      driverPhone,
      referredBy
    });

    Swal.fire({
      icon: 'success',
      title: 'Заказ обновлен',
      timer: 1400,
      showConfirmButton: false
    });

    closeEditOrderModal();
    await loadOrdersManagement();
  } catch (error) {
    console.error('Ошибка сохранения заказа:', error);
    Swal.fire('Ошибка', 'Не удалось сохранить изменения', 'error');
  }
}

// Показать/скрыть товары заказа
function toggleOrderItems(orderId) {
  const itemsDiv = document.getElementById(`orderItems_${orderId}`);
  if (itemsDiv) {
    itemsDiv.style.display = itemsDiv.style.display === 'none' ? 'flex' : 'none';
  }
}

// Обновить статус заказа
async function updateOrderStatus(orderId, newStatus) {
  try {
    await db.collection('orders').doc(orderId).update({ 
      status: newStatus,
      statusUpdatedAt: Date.now()
    });
    
    const statusTexts = {
      pending: 'В обработке',
      preparing: 'Готовится',
      logistics: 'На логистике',
      driver: 'У водителя',
      completed: 'Доставлен',
      cancelled: 'Отменен'
    };
    
    Swal.fire({
      icon: 'success',
      title: 'Статус обновлен!',
      text: `Заказ переведен в статус: ${statusTexts[newStatus]}`,
      timer: 1500,
      showConfirmButton: false
    });
    
    await loadOrdersManagement();
    
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    Swal.fire('Ошибка', 'Не удалось обновить статус заказа', 'error');
    await loadOrdersManagement();
  }
}

// Загрузить фото заказа
async function uploadOrderPhoto(orderId) {
  const { value: file } = await Swal.fire({
    title: '📷 Загрузить фото заказа',
    html: '<input type="file" id="orderPhotoInput" accept="image/*" style="width:100%; padding:10px; border:2px dashed #17a2b8; border-radius:8px; cursor:pointer;">',
    showCancelButton: true,
    confirmButtonText: 'Загрузить',
    cancelButtonText: 'Отмена',
    preConfirm: () => {
      const fileInput = document.getElementById('orderPhotoInput');
      if (!fileInput.files[0]) {
        Swal.showValidationMessage('Выберите фото');
        return false;
      }
      return fileInput.files[0];
    }
  });
  
  if (!file) return;
  
  try {
    Swal.fire({
      title: 'Обработка фото...',
      text: 'Пожалуйста, подождите',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
    
    // Конвертируем фото в base64 (избегаем CORS проблем)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
    
    // Сжимаем до 600px для экономии места в Firestore
    const maxSize = 600;
    let width = img.width;
    let height = img.height;
    
    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    
    // Получаем base64 строку (качество 0.7 для экономии места)
    const base64Photo = canvas.toDataURL('image/jpeg', 0.7);
    
    // Добавляем фото к заказу (хранится в Firestore как base64)
    const orderDoc = await db.collection('orders').doc(orderId).get();
    const orderData = orderDoc.data();
    const photos = orderData.photos || [];
    photos.push({
      url: base64Photo,
      uploadedAt: Date.now()
    });
    
    await db.collection('orders').doc(orderId).update({ photos });
    
    Swal.fire({
      icon: 'success',
      title: 'Фото загружено!',
      text: 'Клиент увидит его при отслеживании заказа',
      timer: 2000,
      showConfirmButton: false
    });
    
    await loadOrdersManagement();
    
  } catch (error) {
    console.error('Ошибка загрузки фото:', error);
    Swal.fire('Ошибка', 'Не удалось загрузить фото: ' + error.message, 'error');
  }
}

// Обновить количество товара в заказе (из панели управления)
async function updateOrderItemQtyManagement(orderId, itemIndex, newQty) {
  await updateOrderItemQty(orderId, itemIndex, newQty);
  await loadOrdersManagement();
  
  // Также обновляем модальное окно товаров если оно открыто
  const modal = document.getElementById('orderItemsDetailModal');
  if (modal && modal.style.display !== 'none') {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (orderDoc.exists) {
      const orderData = orderDoc.data();
      const items = orderData.items || [];
      const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      
      // Обновляем таблицу
      const contentDiv = document.getElementById('orderItemsDetailContent');
      if (contentDiv) {
        const tableDiv = contentDiv.querySelector('.order-items-detail-box');
        if (tableDiv) {
          tableDiv.innerHTML = buildOrderItemsDetailTableHTML(orderId, items);
        }
        const totalDiv = document.getElementById('orderItemsDetailTotal');
        if (totalDiv) {
          totalDiv.innerHTML = `
            <div style="font-weight:700; color:#333;">Итого</div>
            <div style="font-size:18px; font-weight:800; color:#28a745; white-space:nowrap;">${total.toFixed(2)} сом</div>
          `;
        }
      }
    }
  }
}

// Удалить товар из заказа
async function deleteOrderItem(orderId, itemIndex) {
  const result = await Swal.fire({
    title: 'Удалить товар?',
    text: 'Удалить этот товар из заказа?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    items.splice(itemIndex, 1);
    
    if (items.length === 0) {
      await db.collection('orders').doc(orderId).delete();
      Swal.fire({
        icon: 'info',
        title: 'Заказ удален',
        text: 'Все товары были удалены, заказ полностью удален',
        timer: 2000,
        showConfirmButton: false
      });
    } else {
      // Пересчитываем общую сумму заказа (важно для комиссии агента!)
      const newTotal = items.reduce((sum, itm) => sum + (itm.price * itm.qty), 0);
      await db.collection('orders').doc(orderId).update({ items, total: newTotal });
      Swal.fire({
        icon: 'success',
        title: 'Товар удален',
        timer: 1500,
        showConfirmButton: false
      });
    }
    
    await loadOrdersManagement();
    
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    Swal.fire('Ошибка', 'Не удалось удалить товар', 'error');
  }
}

// Удалить весь заказ
async function deleteOrder(orderId) {
  const result = await Swal.fire({
    title: 'Удалить заказ?',
    html: 'Вы действительно хотите удалить весь заказ?<br><small style="color:#dc3545;">⚠️ Это действие нельзя отменить!</small>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: '🗑️ Да, удалить',
    cancelButtonText: 'Отмена'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    await db.collection('orders').doc(orderId).delete();
    
    Swal.fire({
      icon: 'success',
      title: 'Заказ удален!',
      timer: 1500,
      showConfirmButton: false
    });
    
    await loadOrdersManagement();
    
  } catch (error) {
    console.error('Ошибка удаления заказа:', error);
    Swal.fire('Ошибка', 'Не удалось удалить заказ', 'error');
  }
}

// ===== МОДАЛЬНОЕ ОКНО ТОВАРОВ ЗАКАЗА =====

function buildOrderItemsDetailTableHTML(orderId, items) {
  let html = '<div class="order-items-cards">';

  items.forEach((item, idx) => {
    const itemTotal = (item.price || 0) * (item.qty || 0);
    html += `
      <div class="order-item-card">
        <div class="order-item-card-title">${item.title || 'Товар'}</div>
        ${item.variantName ? `<div style="font-size:12px; color:#7b1fa2; background:#f3e5f5; padding:3px 8px; border-radius:4px; margin:4px 10px;">🎨 ${item.variantName}</div>` : ''}
        <div class="order-item-card-body">
          <div class="order-item-field">
            <div class="label">Количество</div>
            <div class="value">
              <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                <input type="number"
                  id="itemQty_${orderId}_${idx}"
                  value="${item.qty}"
                  min="0"
                  onchange="updateOrderItemQtyManagement('${orderId}', ${idx}, this.value)"
                  style="width:80px; padding:8px; border:1px solid #ddd; border-radius:6px; text-align:center; ">
                <span style="color:#666; font-size:13px;">шт</span>
              </div>
            </div>
          </div>
          <div class="order-item-field">
            <div class="label">Цена</div>
            <div class="value">${item.price} сом</div>
          </div>
          <div class="order-item-field">
            <div class="label">Сумма</div>
            <div class="value" style="font-weight:800; color:#007bff;">${itemTotal.toFixed(2)} сом</div>
          </div>
          <div class="order-item-actions">
            <button onclick="deleteOrderItemFromModal('${orderId}', ${idx})" style="padding:8px 14px; background:#dc3545; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700;">
              🗑️ Удалить
            </button>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

// Открыть модальное окно с товарами заказа
async function openOrderItemsDetailModal(orderId, clientName, clientPhone, dateStr) {
  const modal = document.getElementById('orderItemsDetailModal');
  modal.style.display = 'flex';
  lockPageScroll();
  
  document.getElementById('orderItemsDetailTitle').textContent = `📦 Товары в заказе`;
  document.getElementById('orderItemsDetailInfo').textContent = `👤 ${clientName} ${clientPhone ? '(' + clientPhone + ')' : ''} • 📅 ${dateStr}`;
  
  const contentDiv = document.getElementById('orderItemsDetailContent');
  contentDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">⏳ Загрузка товаров...</div>';
  
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      contentDiv.innerHTML = '<div style="text-align:center; color:#dc3545; padding:40px;">❌ Заказ не найден</div>';
      return;
    }
    
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    if (items.length === 0) {
      contentDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">📭 В заказе нет товаров</div>';
      return;
    }
    
    const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    contentDiv.innerHTML = '';
    
    const tableDiv = document.createElement('div');
    tableDiv.className = 'order-items-detail-box';
    tableDiv.style.cssText = 'background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
    tableDiv.innerHTML = buildOrderItemsDetailTableHTML(orderId, items);
    contentDiv.appendChild(tableDiv);

    const totalDiv = document.createElement('div');
    totalDiv.id = 'orderItemsDetailTotal';
    totalDiv.style.cssText = 'margin-top:12px; background:#f8f9fa; border:1px solid #e0e0e0; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;';
    totalDiv.innerHTML = `
      <div style="font-weight:700; color:#333;">Итого</div>
      <div style="font-size:18px; font-weight:800; color:#28a745; white-space:nowrap;">${total.toFixed(2)} сом</div>
    `;
    contentDiv.appendChild(totalDiv);
    
    const addBtn = document.getElementById('orderItemsAddBtn');
    addBtn.onclick = () => {
      closeOrderItemsDetailModal();
      openAddItemToOrderModal(orderId);
    };
    
  } catch (error) {
    console.error('Ошибка загрузки товаров:', error);
    contentDiv.innerHTML = '<div style="text-align:center; color:#dc3545; padding:40px;">❌ Ошибка загрузки товаров</div>';
  }
}

function closeOrderItemsDetailModal() {
  document.getElementById('orderItemsDetailModal').style.display = 'none';
  unlockPageScroll();
}

// Удалить товар из заказа через модальное окно
async function deleteOrderItemFromModal(orderId, itemIndex) {
  const result = await Swal.fire({
    title: 'Удалить товар?',
    text: 'Удалить этот товар из заказа?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new Error('Заказ не найден');
    }
    
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    items.splice(itemIndex, 1);
    
    if (items.length === 0) {
      await Swal.fire({
        title: 'Заказ пуст',
        text: 'В заказе не осталось товаров. Заказ будет удален.',
        icon: 'warning',
        confirmButtonText: 'Понятно'
      });
      await db.collection('orders').doc(orderId).delete();
      closeOrderItemsDetailModal();
      await loadOrdersManagement();
    } else {
      const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      await db.collection('orders').doc(orderId).update({ items, total });
      
      Swal.fire({
        icon: 'success',
        title: 'Товар удален',
        timer: 1500,
        showConfirmButton: false
      });
      
      const clientName = document.getElementById('orderItemsDetailInfo').textContent.split('👤')[1].split('•')[0].trim();
      const dateStr = document.getElementById('orderItemsDetailInfo').textContent.split('📅')[1].trim();
      await openOrderItemsDetailModal(orderId, clientName, '', dateStr);
    }
    
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    Swal.fire('Ошибка', 'Не удалось удалить товар', 'error');
  }
}

// ===== ОБЪЕДИНЕНИЕ ЗАКАЗОВ КЛИЕНТОВ =====

async function openMergeOrdersModal() {
  if (!Array.isArray(ordersManagementAllOrders) || ordersManagementAllOrders.length < 2) {
    Swal.fire({
      icon: 'info',
      title: 'Нет заказов для объединения',
      text: 'Для объединения нужно минимум 2 заказа',
      confirmButtonText: 'Понятно'
    });
    return;
  }

  const groups = {};
  
  ordersManagementAllOrders.forEach(order => {
    const name = (order.name || '').toLowerCase().trim();
    const phone = (order.phone || '').replace(/\D/g, '').trim();
    const orderDate = new Date(order.timestamp || Date.now());
    const dateKey = orderDate.toLocaleDateString('ru-RU');
    const groupKey = `${name}|${phone}|${dateKey}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = {
        name: order.name || 'Без имени',
        phone: order.phone || '',
        date: dateKey,
        orders: []
      };
    }
    groups[groupKey].orders.push(order);
  });

  const mergeableGroups = Object.values(groups).filter(g => g.orders.length >= 2);

  if (mergeableGroups.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'Нечего объединять',
      text: 'Не найдено клиентов с несколькими заказами за один день',
      confirmButtonText: 'Понятно'
    });
    return;
  }

  let html = '<div style="max-height:400px; overflow-y:auto;">';
  
  mergeableGroups.forEach((group, idx) => {
    const totalOrders = group.orders.length;
    const totalItems = group.orders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + i.qty, 0), 0);
    const totalSum = group.orders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + (i.price * i.qty), 0), 0);
    
    html += `
      <div style="background:#f8f9fa; border:2px solid #9c27b0; border-radius:10px; padding:15px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="font-weight:700; font-size:16px; color:#333;">👤 ${group.name}</div>
            <div style=" color:#666;">📞 ${group.phone || 'Без телефона'}</div>
            <div style="font-size:13px; color:#888;">📅 ${group.date}</div>
            <div style="margin-top:8px; ">
              <span style="background:#9c27b0; color:white; padding:3px 8px; border-radius:4px;">${totalOrders} заказа</span>
              <span style="background:#007bff; color:white; padding:3px 8px; border-radius:4px; margin-left:5px;">${totalItems} шт</span>
              <span style="background:#28a745; color:white; padding:3px 8px; border-radius:4px; margin-left:5px;">${totalSum.toFixed(0)} сом</span>
            </div>
          </div>
          <button onclick="mergeClientOrders('${group.orders.map(o => o.id).join(',')}')" style="padding:10px 20px; background:linear-gradient(90deg, #9c27b0, #673ab7); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700;">
            🔗 Объединить
          </button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  if (mergeableGroups.length > 1) {
    html += `
      <div style="margin-top:15px; padding-top:15px; border-top:2px solid #e0e0e0; text-align:center;">
        <button onclick="mergeAllClientOrders()" style="padding:12px 30px; background:linear-gradient(90deg, #ff5722, #e91e63); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:16px;">
          🔗 Объединить все (${mergeableGroups.length} групп)
        </button>
      </div>
    `;
  }

  Swal.fire({
    title: '🔗 Объединение заказов',
    html: html,
    width: 600,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: {
      popup: 'merge-orders-popup'
    }
  });
}

// Объединить заказы конкретного клиента
async function mergeClientOrders(orderIds) {
  const ids = orderIds.split(',');
  
  if (ids.length < 2) {
    Swal.fire('Ошибка', 'Нужно минимум 2 заказа для объединения', 'error');
    return;
  }

  const result = await Swal.fire({
    title: 'Объединить заказы?',
    html: `<p>Все товары из ${ids.length} заказов будут объединены в один.</p>
           <p style="color:#dc3545; font-size:13px;">⚠️ Остальные заказы будут удалены.</p>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#9c27b0',
    cancelButtonColor: '#6c757d',
    confirmButtonText: '🔗 Да, объединить',
    cancelButtonText: 'Отмена'
  });

  if (!result.isConfirmed) return;

  try {
    Swal.fire({
      title: 'Объединение...',
      text: 'Пожалуйста, подождите',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const orders = [];
    for (const id of ids) {
      const doc = await db.collection('orders').doc(id).get();
      if (doc.exists) {
        orders.push({ id: doc.id, ...doc.data() });
      }
    }

    if (orders.length < 2) {
      throw new Error('Не удалось загрузить заказы');
    }

    orders.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const mainOrder = orders[0];
    const otherOrders = orders.slice(1);

    let mergedItems = [...(mainOrder.items || [])];
    
    for (const order of otherOrders) {
      const orderItems = order.items || [];
      
      for (const item of orderItems) {
        const existingIndex = mergedItems.findIndex(mi => 
          mi.title === item.title && mi.price === item.price
        );
        
        if (existingIndex >= 0) {
          mergedItems[existingIndex].qty += item.qty;
        } else {
          mergedItems.push({ ...item });
        }
      }
    }

    const newTotal = mergedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

    await db.collection('orders').doc(mainOrder.id).update({
      items: mergedItems,
      total: newTotal,
      mergedFrom: otherOrders.map(o => o.id),
      mergedAt: Date.now()
    });

    for (const order of otherOrders) {
      await db.collection('orders').doc(order.id).delete();
    }

    Swal.fire({
      icon: 'success',
      title: 'Заказы объединены!',
      html: `<p>Объединено ${orders.length} заказов в один.</p>
             <p>Всего товаров: <strong>${mergedItems.reduce((s, i) => s + i.qty, 0)} шт</strong></p>
             <p>Общая сумма: <strong>${newTotal.toFixed(0)} сом</strong></p>`,
      confirmButtonText: 'Отлично!'
    });

    await loadOrdersManagement(true);

  } catch (error) {
    console.error('Ошибка объединения заказов:', error);
    Swal.fire('Ошибка', 'Не удалось объединить заказы: ' + (error.message || ''), 'error');
  }
}

// Объединить все группы заказов
async function mergeAllClientOrders() {
  if (!Array.isArray(ordersManagementAllOrders) || ordersManagementAllOrders.length < 2) {
    return;
  }

  const groups = {};
  
  ordersManagementAllOrders.forEach(order => {
    const name = (order.name || '').toLowerCase().trim();
    const phone = (order.phone || '').replace(/\D/g, '').trim();
    const orderDate = new Date(order.timestamp || Date.now());
    const dateKey = orderDate.toLocaleDateString('ru-RU');
    const groupKey = `${name}|${phone}|${dateKey}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(order);
  });

  const mergeableGroups = Object.values(groups).filter(g => g.length >= 2);

  if (mergeableGroups.length === 0) return;

  const result = await Swal.fire({
    title: 'Объединить ВСЕ заказы?',
    html: `<p>Будет объединено <strong>${mergeableGroups.length}</strong> групп заказов.</p>
           <p style="color:#dc3545;">⚠️ Это действие нельзя отменить!</p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ff5722',
    cancelButtonColor: '#6c757d',
    confirmButtonText: '🔗 Да, объединить все',
    cancelButtonText: 'Отмена'
  });

  if (!result.isConfirmed) return;

  try {
    Swal.fire({
      title: 'Объединение всех заказов...',
      text: 'Пожалуйста, подождите',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    let mergedCount = 0;
    let deletedCount = 0;

    for (const group of mergeableGroups) {
      group.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const mainOrder = group[0];
      const otherOrders = group.slice(1);

      let mergedItems = [...(mainOrder.items || [])];
      
      for (const order of otherOrders) {
        const orderItems = order.items || [];
        
        for (const item of orderItems) {
          const existingIndex = mergedItems.findIndex(mi => 
            mi.title === item.title && mi.price === item.price
          );
          
          if (existingIndex >= 0) {
            mergedItems[existingIndex].qty += item.qty;
          } else {
            mergedItems.push({ ...item });
          }
        }
      }

      const newTotal = mergedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

      await db.collection('orders').doc(mainOrder.id).update({
        items: mergedItems,
        total: newTotal,
        mergedFrom: otherOrders.map(o => o.id),
        mergedAt: Date.now()
      });

      for (const order of otherOrders) {
        await db.collection('orders').doc(order.id).delete();
        deletedCount++;
      }

      mergedCount++;
    }

    Swal.fire({
      icon: 'success',
      title: 'Все заказы объединены!',
      html: `<p>Объединено групп: <strong>${mergedCount}</strong></p>
             <p>Удалено дубликатов: <strong>${deletedCount}</strong></p>`,
      confirmButtonText: 'Отлично!'
    });

    await loadOrdersManagement(true);

  } catch (error) {
    console.error('Ошибка массового объединения:', error);
    Swal.fire('Ошибка', 'Не удалось объединить все заказы', 'error');
  }
}

// ===== ДОБАВЛЕНИЕ ТОВАРА В ЗАКАЗ =====

let currentOrderIdForAddItem = null;
let productsToAddCardsCache = null;
let productsToAddLastQuery = '';
let productsToAddFilterDebounceTimer = null;
let _productsToAddComposing = false;

function scheduleFilterProductsToAdd() {
  if (_productsToAddComposing) return;
  clearTimeout(productsToAddFilterDebounceTimer);
  productsToAddFilterDebounceTimer = setTimeout(() => {
    filterProductsToAdd();
  }, _isIOS ? 350 : 120);
}

// Инициализация composition events для поиска товаров
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchProductToAdd');
  if (searchInput) {
    searchInput.addEventListener('compositionstart', () => { _productsToAddComposing = true; });
    searchInput.addEventListener('compositionend', () => { _productsToAddComposing = false; scheduleFilterProductsToAdd(); });
  }
});

async function openAddItemToOrderModal(orderId) {
  currentOrderIdForAddItem = orderId;
  document.getElementById('addItemToOrderModal').style.display = 'flex';
  lockPageScroll();
  
  await loadProductsToAdd();
}

function closeAddItemToOrderModal() {
  document.getElementById('addItemToOrderModal').style.display = 'none';
  unlockPageScroll();
  currentOrderIdForAddItem = null;
  document.getElementById('searchProductToAdd').value = '';
  productsToAddLastQuery = '';
}

async function loadProductsToAdd() {
  const listDiv = document.getElementById('productsToAddList');
  listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">⏳ Загрузка товаров...</div>';
  
  try {
    const productsSnapshot = await db.collection('products').get();
    
    if (productsSnapshot.empty) {
      listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">📭 Товаров нет</div>';
      return;
    }
    
    listDiv.innerHTML = '';
    productsToAddCardsCache = null;
    
    productsSnapshot.forEach(doc => {
      const product = doc.data();
      const productCard = document.createElement('div');
      productCard.className = 'product-to-add-card';
      productCard.dataset.title = (product.title || product.name || '').toLowerCase();
      productCard.style.cssText = 'background:white; border:1px solid #e0e0e0; border-radius:8px; padding:12px; margin-bottom:10px; cursor:pointer; transition:all 0.2s;';
      
      const productName = product.title || product.name || 'Без названия';
      const productPrice = product.price || 0;
      const productCostPrice = product.costPrice || 0;
      const productPhoto = product.image || product.photo;
      
      productCard.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center;">
          ${productPhoto ? `<img src="${productPhoto}" style="width:60px; height:60px; object-fit:cover; border-radius:6px;">` : '<div style="width:60px; height:60px; background:#f0f0f0; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:24px;">📦</div>'}
          <div style="flex:1;">
            <div style="font-weight:600;  margin-bottom:4px;">${productName}</div>
            <div style="font-size:13px; color:#666;">💰 ${productPrice} сом</div>
            ${product.category ? `<div style="font-size:12px; color:#888; margin-top:2px;">📁 ${product.category}</div>` : ''}
          </div>
          <button onclick="addProductToOrder('${doc.id}', '${productName.replace(/'/g, "\\'")}', ${productPrice}, ${productCostPrice}); event.stopPropagation();" style="padding:8px 16px; background:#17a2b8; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; white-space:nowrap;">
            ➕ Добавить
          </button>
        </div>
      `;
      
      productCard.onmouseenter = () => productCard.style.background = '#f8f9fa';
      productCard.onmouseleave = () => productCard.style.background = 'white';
      
      listDiv.appendChild(productCard);
    });

    productsToAddCardsCache = Array.from(listDiv.querySelectorAll('.product-to-add-card'));
    scheduleFilterProductsToAdd();
    
  } catch (error) {
    console.error('Ошибка загрузки товаров:', error);
    listDiv.innerHTML = '<div style="text-align:center; color:#dc3545; padding:40px;">❌ Ошибка загрузки товаров</div>';
  }
}

function filterProductsToAdd() {
  const inputEl = document.getElementById('searchProductToAdd');
  if (!inputEl) return;
  const searchQuery = (inputEl.value || '').toLowerCase();

  if (searchQuery === productsToAddLastQuery) return;
  productsToAddLastQuery = searchQuery;

  const cards = Array.isArray(productsToAddCardsCache)
    ? productsToAddCardsCache
    : Array.from(document.querySelectorAll('.product-to-add-card'));

  cards.forEach(card => {
    const title = card.dataset.title || '';
    const shouldShow = title.includes(searchQuery);
    const isHidden = card.style.display === 'none';
    if (shouldShow && isHidden) card.style.display = 'block';
    if (!shouldShow && !isHidden) card.style.display = 'none';
  });
}

async function addProductToOrder(productId, productName, productPrice, productCostPrice) {
  if (!currentOrderIdForAddItem) {
    Swal.fire('Ошибка', 'Не выбран заказ', 'error');
    return;
  }
  
  try {
    const orderDoc = await db.collection('orders').doc(currentOrderIdForAddItem).get();
    
    if (!orderDoc.exists) {
      throw new Error('Заказ не найден');
    }
    
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    const existingItemIndex = items.findIndex(item => item.id === productId);
    
    if (existingItemIndex !== -1) {
      items[existingItemIndex].qty += 1;
    } else {
      items.push({
        id: productId,
        title: productName,
        price: productPrice,
        costPrice: productCostPrice,
        qty: 1
      });
    }
    
    const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    await db.collection('orders').doc(currentOrderIdForAddItem).update({
      items,
      total
    });
    
    Swal.fire({
      icon: 'success',
      title: 'Товар добавлен!',
      text: `${productName} добавлен в заказ`,
      timer: 1500,
      showConfirmButton: false
    });
    
    closeAddItemToOrderModal();
    await loadOrdersManagement();
    
  } catch (error) {
    console.error('Ошибка добавления товара:', error);
    Swal.fire('Ошибка', 'Не удалось добавить товар в заказ', 'error');
  }
}

// ===== ЭКСПОРТ ЗАКАЗА В TELEGRAM =====

async function exportOrderToExcel(orderId, clientName, clientPhone) {
  // Показываем загрузку СРАЗУ при нажатии кнопки
  Swal.fire({
    title: 'Подготовка заказа...',
    html: 'Загрузка данных и создание файлов',
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      throw new Error('Заказ не найден');
    }
    
    const order = orderDoc.data();
    const items = order.items || [];
    
    if (items.length === 0) {
      Swal.fire('Ошибка', 'В заказе нет товаров', 'error');
      return;
    }
    
    // Загружаем данные товаров для фотографий
    const productsSnapshot = await db.collection('products').get();
    const productsMap = {};
    productsSnapshot.forEach(doc => {
      const prod = doc.data();
      productsMap[prod.title || prod.name] = prod;
    });
    
    items.forEach(item => {
      const productData = productsMap[item.title];
      if (productData) {
        item.image = productData.image || productData.photo;
        item.photo = productData.photo || productData.image;
      }
    });
    
    const date = new Date(order.timestamp || Date.now());
    const dateStr = date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
    
    // Создаем данные для Excel
    const excelData = [
      ['ЗАКАЗ КЛИЕНТА'],
      [''],
      ['Клиент:', clientName],
      ['Телефон:', clientPhone],
      ['Адрес:', order.address || 'Не указан'],
      ['Дата заказа:', dateStr],
      [''],
      ['№', 'Товар', 'Количество', 'Цена за шт', 'Сумма']
    ];
    
    let totalAmount = 0;
    items.forEach((item, index) => {
      const itemTotal = item.price * item.qty;
      totalAmount += itemTotal;
      excelData.push([
        index + 1,
        item.title || 'Товар',
        item.qty + ' шт',
        item.price + ' сом',
        itemTotal.toFixed(2) + ' сом'
      ]);
    });
    
    excelData.push(['']);
    excelData.push(['', '', '', 'ИТОГО:', totalAmount.toFixed(2) + ' сом']);
    excelData.push(['']);
    excelData.push(['⚠️ ВНИМАНИЕ: Заказ был изменен администратором']);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    
    ws['!cols'] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Заказ');
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const excelBlob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Обновляем статус загрузки
    Swal.update({
      title: 'Создание PDF...',
      html: 'Генерация файлов с фото'
    });
    
    // Генерируем PDF с фото
    console.log('=== Начало создания PDF файла ===');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Масштаб для чёткости (1.5x - хорошее качество при минимальном размере)
    const pdfScale = 1.5;
    
    let yPos = 20;
    
    // Заголовок
    const headerCanvas = document.createElement('canvas');
    const headerCtx = headerCanvas.getContext('2d');
    headerCanvas.width = 600 * pdfScale;
    headerCanvas.height = 50 * pdfScale;
    headerCtx.scale(pdfScale, pdfScale);
    
    headerCtx.fillStyle = 'white';
    headerCtx.fillRect(0, 0, 600, 50);
    headerCtx.fillStyle = 'black';
    headerCtx.font = 'bold 24px Arial';
    headerCtx.textAlign = 'center';
    headerCtx.fillText('ЗАКАЗ ИЗМЕНЕН', 300, 35);
    
    const headerImage = headerCanvas.toDataURL('image/png');
    doc.addImage(headerImage, 'PNG', 20, yPos, 170, 15);
    
    yPos += 20;
    
    // Информация о заказе
    const infoCanvas = document.createElement('canvas');
    const infoCtx = infoCanvas.getContext('2d');
    infoCanvas.width = 700 * pdfScale;
    infoCanvas.height = 120 * pdfScale;
    infoCtx.scale(pdfScale, pdfScale);
    
    infoCtx.fillStyle = 'white';
    infoCtx.fillRect(0, 0, 700, 120);
    infoCtx.strokeStyle = 'black';
    infoCtx.lineWidth = 2;
    infoCtx.strokeRect(0, 0, 700, 120);
    
    infoCtx.fillStyle = 'black';
    infoCtx.font = '16px Arial';
    infoCtx.fillText(`Дата/Время: ${dateStr}`, 15, 30);
    infoCtx.fillText(`Имя клиента: ${clientName}`, 15, 55);
    infoCtx.fillText(`Телефон: ${clientPhone}`, 15, 80);
    infoCtx.fillText(`Адрес: ${order.address || 'Не указан'}`, 15, 105);
    
    const infoImage = infoCanvas.toDataURL('image/png');
    doc.addImage(infoImage, 'PNG', 20, yPos, 170, 30);
    
    yPos += 35;
    
    // Заголовок таблицы
    const tableHeaderCanvas = document.createElement('canvas');
    const thCtx = tableHeaderCanvas.getContext('2d');
    tableHeaderCanvas.width = 550 * pdfScale;
    tableHeaderCanvas.height = 50 * pdfScale;
    thCtx.scale(pdfScale, pdfScale);
    
    thCtx.fillStyle = '#e0e0e0';
    thCtx.fillRect(0, 0, 550, 50);
    
    thCtx.strokeStyle = 'black';
    thCtx.lineWidth = 2;
    thCtx.strokeRect(0, 0, 550, 50);
    
    thCtx.beginPath();
    thCtx.moveTo(90, 0);
    thCtx.lineTo(90, 50);
    thCtx.moveTo(310, 0);
    thCtx.lineTo(310, 50);
    thCtx.moveTo(390, 0);
    thCtx.lineTo(390, 50);
    thCtx.moveTo(470, 0);
    thCtx.lineTo(470, 50);
    thCtx.stroke();
    
    thCtx.fillStyle = 'black';
    thCtx.font = 'bold 14px Arial';
    thCtx.textAlign = 'center';
    thCtx.fillText('ФОТО', 45, 32);
    thCtx.fillText('НАЗВАНИЕ', 200, 32);
    thCtx.fillText('КОЛ-ВО', 350, 32);
    thCtx.fillText('ЦЕНА', 430, 32);
    thCtx.fillText('СУММА', 510, 32);
    
    const tableHeaderImage = tableHeaderCanvas.toDataURL('image/png');
    doc.addImage(tableHeaderImage, 'PNG', 20, yPos, 170, 12);
    
    yPos += 12;
    
    // Товары с фотографиями
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      let photoWidth = 90;
      let photoHeight = 90;
      let photoData = null;
      
      if ((item.image || item.photo) && (item.image?.startsWith('http') || item.photo?.startsWith('http'))) {
        try {
          const imgUrl = item.image || item.photo;
          const response = await fetch(imgUrl);
          const blob = await response.blob();
          
          const file = new File([blob], 'image.jpg', { type: blob.type });
          const fixedFile = await fixImageOrientation(file);
          
          const reader = new FileReader();
          const base64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(fixedFile);
          });
          
          photoData = base64;
          
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = resolve;
            img.src = base64;
          });
          
          const maxPhotoWidth = 100;
          const maxPhotoHeight = 100;
          
          let finalWidth = img.width;
          let finalHeight = img.height;
          
          if (finalWidth > maxPhotoWidth || finalHeight > maxPhotoHeight) {
            const scale = Math.min(maxPhotoWidth / finalWidth, maxPhotoHeight / finalHeight);
            finalWidth = finalWidth * scale;
            finalHeight = finalHeight * scale;
          }
          
          photoWidth = finalWidth;
          photoHeight = finalHeight;
          
          console.log('✓ Фото загружено:', item.title, `Размер: ${photoWidth.toFixed(0)}x${photoHeight.toFixed(0)}`);
        } catch (err) {
          console.error('✗ Ошибка фото:', item.title, err);
          photoWidth = 90;
          photoHeight = 90;
        }
      }
      
      const rowHeight = Math.max(photoHeight + 10, 100);
      
      const rowCanvas = document.createElement('canvas');
      const rowCtx = rowCanvas.getContext('2d');
      const photoColumnWidth = Math.max(photoWidth + 10, 70);
      const totalWidth = photoColumnWidth + 480;
      rowCanvas.width = totalWidth * pdfScale;
      rowCanvas.height = rowHeight * pdfScale;
      rowCtx.scale(pdfScale, pdfScale);
      
      rowCtx.fillStyle = 'white';
      rowCtx.fillRect(0, 0, totalWidth, rowHeight);
      
      rowCtx.strokeStyle = 'black';
      rowCtx.lineWidth = 2;
      rowCtx.strokeRect(0, 0, totalWidth, rowHeight);
      
      const col2 = photoColumnWidth;
      const col3 = photoColumnWidth + 240;
      const col4 = photoColumnWidth + 320;
      const col5 = photoColumnWidth + 400;
      
      rowCtx.beginPath();
      rowCtx.moveTo(col2, 0);
      rowCtx.lineTo(col2, rowHeight);
      rowCtx.moveTo(col3, 0);
      rowCtx.lineTo(col3, rowHeight);
      rowCtx.moveTo(col4, 0);
      rowCtx.lineTo(col4, rowHeight);
      rowCtx.moveTo(col5, 0);
      rowCtx.lineTo(col5, rowHeight);
      rowCtx.stroke();
      
      rowCtx.fillStyle = 'black';
      rowCtx.font = '13px Arial';
      rowCtx.textAlign = 'center';
      
      const midY = rowHeight / 2;
      
      rowCtx.textAlign = 'left';
      const title = item.title || 'Товар';
      const productItem = typeof products !== 'undefined' ? products.find(p => p.id === item.id) : null;
      const unitLabelItem = (productItem && productItem.isPack) ? 'пачка' : 'шт';
      if (title.length > 28) {
        rowCtx.fillText(title.substring(0, 28), col2 + 5, midY - 5);
        rowCtx.fillText(title.substring(28), col2 + 5, midY + 10);
      } else {
        rowCtx.fillText(title, col2 + 5, midY);
      }
      
      rowCtx.textAlign = 'center';
      rowCtx.fillText(`${item.qty} ${unitLabelItem}`, (col3 + col4) / 2, midY);
      
      rowCtx.fillText(`${item.price}`, (col4 + col5) / 2, midY - 5);
      rowCtx.font = '11px Arial';
      rowCtx.fillText('сом', (col4 + col5) / 2, midY + 8);
      
      rowCtx.font = 'bold 13px Arial';
      rowCtx.fillText(`${item.qty * item.price}`, (col5 + totalWidth) / 2, midY - 5);
      rowCtx.font = '11px Arial';
      rowCtx.fillText('сом', (col5 + totalWidth) / 2, midY + 8);
      
      const rowImage = rowCanvas.toDataURL('image/png');
      const rowPdfHeight = rowHeight * 170 / totalWidth;
      doc.addImage(rowImage, 'PNG', 20, yPos, 170, rowPdfHeight);
      
      if (photoData) {
        const photoWidthPdf = photoWidth * 170 / totalWidth;
        const photoHeightPdf = photoHeight * 170 / totalWidth;
        const xPos = 22 + (photoColumnWidth * 170 / totalWidth - photoWidthPdf) / 2;
        const yPosImg = yPos + (rowPdfHeight - photoHeightPdf) / 2;
        doc.addImage(photoData, 'JPEG', xPos, yPosImg, photoWidthPdf, photoHeightPdf);
      }
      
      yPos += rowPdfHeight;
    }
    
    // Строка ИТОГО с высоким разрешением
    const totalCanvas = document.createElement('canvas');
    const totalCtx = totalCanvas.getContext('2d');
    totalCanvas.width = 550 * pdfScale;
    totalCanvas.height = 60 * pdfScale;
    totalCtx.scale(pdfScale, pdfScale);
    
    totalCtx.fillStyle = '#fff9c4';
    totalCtx.fillRect(0, 0, 550, 60);
    
    totalCtx.strokeStyle = 'black';
    totalCtx.lineWidth = 3;
    totalCtx.strokeRect(0, 0, 550, 60);
    
    totalCtx.beginPath();
    totalCtx.moveTo(470, 0);
    totalCtx.lineTo(470, 60);
    totalCtx.stroke();
    
    totalCtx.fillStyle = 'black';
    totalCtx.font = 'bold 18px Arial';
    totalCtx.textAlign = 'right';
    totalCtx.fillText('ИТОГО:', 450, 38);
    
    totalCtx.textAlign = 'center';
    totalCtx.fillText(`${totalAmount.toFixed(0)}`, 510, 32);
    totalCtx.font = '14px Arial';
    totalCtx.fillText('сом', 510, 48);
    
    const totalImage = totalCanvas.toDataURL('image/png');
    doc.addImage(totalImage, 'PNG', 20, yPos, 170, 15);
    
    console.log('Генерируем PDF файл...');
    
    const pdfBlob = doc.output('blob');
    
    console.log('PDF файл сгенерирован, размер:', pdfBlob.size, 'байт');
    
    // ===== Генерируем PDF для печати (без фото) =====
    console.log('=== Начало создания PDF для печати (без фото) ===');
    
    const docPrint = new jsPDF();
    let yPosPrint = 15;
    
    // Заголовок
    const headerPrintCanvas = document.createElement('canvas');
    const headerPrintCtx = headerPrintCanvas.getContext('2d');
    headerPrintCanvas.width = 600 * pdfScale;
    headerPrintCanvas.height = 50 * pdfScale;
    headerPrintCtx.scale(pdfScale, pdfScale);
    
    headerPrintCtx.fillStyle = 'white';
    headerPrintCtx.fillRect(0, 0, 600, 50);
    headerPrintCtx.fillStyle = 'black';
    headerPrintCtx.font = 'bold 24px Arial';
    headerPrintCtx.textAlign = 'center';
    headerPrintCtx.fillText('ЗАКАЗ ИЗМЕНЕН (для печати)', 300, 35);
    
    const headerPrintImage = headerPrintCanvas.toDataURL('image/png');
    docPrint.addImage(headerPrintImage, 'PNG', 20, yPosPrint, 170, 12);
    
    yPosPrint += 15;
    
    // Информация о заказе
    const infoPrintCanvas = document.createElement('canvas');
    const infoPrintCtx = infoPrintCanvas.getContext('2d');
    infoPrintCanvas.width = 700 * pdfScale;
    infoPrintCanvas.height = 120 * pdfScale;
    infoPrintCtx.scale(pdfScale, pdfScale);
    
    infoPrintCtx.fillStyle = 'white';
    infoPrintCtx.fillRect(0, 0, 700, 120);
    infoPrintCtx.strokeStyle = 'black';
    infoPrintCtx.lineWidth = 2;
    infoPrintCtx.strokeRect(0, 0, 700, 120);
    
    infoPrintCtx.fillStyle = 'black';
    infoPrintCtx.font = '16px Arial';
    infoPrintCtx.fillText(`Дата/Время: ${dateStr}`, 15, 30);
    infoPrintCtx.fillText(`Имя клиента: ${clientName}`, 15, 55);
    infoPrintCtx.fillText(`Телефон: ${clientPhone}`, 15, 80);
    infoPrintCtx.fillText(`Адрес: ${order.address || 'Не указан'}`, 15, 105);
    
    const infoPrintImage = infoPrintCanvas.toDataURL('image/png');
    docPrint.addImage(infoPrintImage, 'PNG', 20, yPosPrint, 170, 28);
    
    yPosPrint += 30;
    
    // Заголовок таблицы (без колонки фото)
    const thPrintCanvas = document.createElement('canvas');
    const thPrintCtx = thPrintCanvas.getContext('2d');
    thPrintCanvas.width = 600 * pdfScale;
    thPrintCanvas.height = 40 * pdfScale;
    thPrintCtx.scale(pdfScale, pdfScale);
    
    thPrintCtx.fillStyle = '#e0e0e0';
    thPrintCtx.fillRect(0, 0, 600, 40);
    
    thPrintCtx.strokeStyle = 'black';
    thPrintCtx.lineWidth = 2;
    thPrintCtx.strokeRect(0, 0, 600, 40);
    
    // Вертикальные линии (4 колонки: Название | Кол-во | Цена | Сумма)
    thPrintCtx.beginPath();
    thPrintCtx.moveTo(300, 0); thPrintCtx.lineTo(300, 40);
    thPrintCtx.moveTo(400, 0); thPrintCtx.lineTo(400, 40);
    thPrintCtx.moveTo(500, 0); thPrintCtx.lineTo(500, 40);
    thPrintCtx.stroke();
    
    thPrintCtx.fillStyle = 'black';
    thPrintCtx.font = 'bold 12px Arial';
    thPrintCtx.textAlign = 'center';
    thPrintCtx.fillText('НАЗВАНИЕ', 150, 25);
    thPrintCtx.fillText('КОЛ-ВО', 350, 25);
    thPrintCtx.fillText('ЦЕНА', 450, 25);
    thPrintCtx.fillText('СУММА', 550, 25);
    
    const thPrintImage = thPrintCanvas.toDataURL('image/png');
    docPrint.addImage(thPrintImage, 'PNG', 20, yPosPrint, 170, 10);
    
    yPosPrint += 10;
    
    // Товары БЕЗ фото
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (yPosPrint > 265) {
        docPrint.addPage();
        yPosPrint = 15;
      }
      
      const productItem = typeof products !== 'undefined' ? products.find(p => p.id === item.id) : null;
      const unitLabelItem = (productItem && productItem.isPack) ? 'пач' : 'шт';
      
      const rowPrintCanvas = document.createElement('canvas');
      const rowPrintCtx = rowPrintCanvas.getContext('2d');
      rowPrintCanvas.width = 600 * pdfScale;
      rowPrintCanvas.height = 35 * pdfScale;
      rowPrintCtx.scale(pdfScale, pdfScale);
      
      rowPrintCtx.fillStyle = i % 2 === 0 ? 'white' : '#f9f9f9';
      rowPrintCtx.fillRect(0, 0, 600, 35);
      
      rowPrintCtx.strokeStyle = 'black';
      rowPrintCtx.lineWidth = 1;
      rowPrintCtx.strokeRect(0, 0, 600, 35);
      
      // Вертикальные линии (4 колонки)
      rowPrintCtx.beginPath();
      rowPrintCtx.moveTo(300, 0); rowPrintCtx.lineTo(300, 35);
      rowPrintCtx.moveTo(400, 0); rowPrintCtx.lineTo(400, 35);
      rowPrintCtx.moveTo(500, 0); rowPrintCtx.lineTo(500, 35);
      rowPrintCtx.stroke();
      
      rowPrintCtx.fillStyle = 'black';
      rowPrintCtx.font = '11px Arial';
      
      const titlePrint = item.title || 'Товар';
      rowPrintCtx.textAlign = 'left';
      if (titlePrint.length > 40) {
        rowPrintCtx.fillText(titlePrint.substring(0, 40), 5, 15);
        rowPrintCtx.fillText(titlePrint.substring(40, 80), 5, 28);
      } else {
        rowPrintCtx.fillText(titlePrint, 5, 22);
      }
      
      rowPrintCtx.textAlign = 'center';
      rowPrintCtx.fillText(`${item.qty} ${unitLabelItem}`, 350, 22);
      rowPrintCtx.fillText(`${item.price} сом`, 450, 22);
      rowPrintCtx.font = 'bold 11px Arial';
      rowPrintCtx.fillText(`${item.qty * item.price} сом`, 550, 22);
      
      const rowPrintImage = rowPrintCanvas.toDataURL('image/png');
      docPrint.addImage(rowPrintImage, 'PNG', 20, yPosPrint, 170, 9);
      
      yPosPrint += 9;
    }
    
    // Строка ИТОГО - на всю ширину таблицы с высоким разрешением
    const totalPrintCanvas = document.createElement('canvas');
    const totalPrintCtx = totalPrintCanvas.getContext('2d');
    totalPrintCanvas.width = 800 * pdfScale;
    totalPrintCanvas.height = 60 * pdfScale;
    totalPrintCtx.scale(pdfScale, pdfScale);
    
    // Яркий жёлтый фон
    totalPrintCtx.fillStyle = '#ffeb3b';
    totalPrintCtx.fillRect(0, 0, 800, 60);
    
    // Толстая чёрная рамка
    totalPrintCtx.strokeStyle = 'black';
    totalPrintCtx.lineWidth = 4;
    totalPrintCtx.strokeRect(0, 0, 800, 60);
    
    // Текст ИТОГО справа с отступом
    totalPrintCtx.fillStyle = 'black';
    totalPrintCtx.font = 'bold 24px Arial';
    totalPrintCtx.textAlign = 'right';
    totalPrintCtx.fillText(`ИТОГО:  ${totalAmount.toFixed(0)} сом`, 780, 40);
    
    const totalPrintImage = totalPrintCanvas.toDataURL('image/png');
    docPrint.addImage(totalPrintImage, 'PNG', 20, yPosPrint, 170, 14);
    
    const pdfPrintBlob = docPrint.output('blob');
    console.log('PDF для печати сгенерирован, размер:', pdfPrintBlob.size, 'байт');
    
    // Отправка в Telegram
    const message = `📦 *Заказ изменен*\n\n` +
      `👤 Клиент: ${clientName}\n` +
      `📱 Телефон: ${clientPhone}\n` +
      `📅 Дата: ${dateStr}\n` +
      `📍 Адрес: ${order.address || 'Не указан'}\n\n` +
      `🔄 *Заказ был изменен администратором*\n` +
      `📊 Товаров: ${items.length}\n` +
      `💰 Сумма: ${totalAmount.toFixed(2)} сом`;
    
    // Обновляем текст загрузки
    Swal.update({
      title: 'Отправка в Telegram...',
      html: 'Отправка файлов'
    });
    
    // Отправляем Excel файл
    const formData1 = new FormData();
    const excelFileName = `Заказ_${clientName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
    formData1.append('document', excelBlob, excelFileName);
    formData1.append('chat_id', '5567924440');
    formData1.append('caption', message + '\n\n📄 Excel файл');
    formData1.append('parse_mode', 'Markdown');
    
    await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData1
    });
    
    // Отправляем PDF для печати (без фото)
    const formData2 = new FormData();
    const pdfPrintFileName = `Заказ_печать_${clientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    formData2.append('document', pdfPrintBlob, pdfPrintFileName);
    formData2.append('chat_id', '5567924440');
    formData2.append('caption', '📄 PDF для печати (без фото)');
    
    await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData2
    });
    
    // Отправляем PDF файл с фото
    const formData3 = new FormData();
    const pdfFileName = `Заказ_с_фото_${clientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    formData3.append('document', pdfBlob, pdfFileName);
    formData3.append('chat_id', '5567924440');
    formData3.append('caption', '📸 PDF с фотографиями товаров');
    
    const response = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendDocument', {
      method: 'POST',
      body: formData3
    });
    
    const result = await response.json();
    
    if (result.ok) {
      Swal.fire({
        icon: 'success',
        title: 'Отправлено!',
        html: `3 файла отправлены в Telegram<br><strong>${clientName}</strong>`,
        timer: 2000,
        showConfirmButton: false
      });
    } else {
      throw new Error(result.description || 'Ошибка отправки');
    }
    
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка отправки',
      text: error.message || 'Не удалось отправить файл в Telegram'
    });
  }
}
