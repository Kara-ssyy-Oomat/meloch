// ===== СИСТЕМА АГЕНТОВ (2% комиссия) =====

// Текущий агент (хранится в localStorage)
let currentAgent = null;

// ГЛОБАЛЬНАЯ функция закрытия ВСЕХ окон агентов
window.closeAllAgentModals = function() {
  // Список всех модальных окон для закрытия
  const modalIds = [
    'agentProfitModal',
    'agentsManagementModal', 
    'agentClientsListModal',
    'clientsForAgentsModal',
    'agentAuthModal',
    'ordersManagementWindow'   // Окно заказов
  ];
  
  modalIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  // Также закрываем любые другие fixed окна с высоким z-index
  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' && style.display !== 'none' && el.offsetWidth > 0) {
      const z = parseInt(style.zIndex) || 0;
      if (z >= 1000 && el.id !== 'bottomNavBar') {
        el.style.display = 'none';
      }
    }
  });
  
  // Закрываем Swal
  if (typeof Swal !== 'undefined' && Swal.close) {
    Swal.close();
  }
  
  // Разблокируем прокрутку
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.documentElement.style.overflow = '';
  
  if (typeof unlockPageScroll === 'function') {
    unlockPageScroll();
  }
};

// Закрытие по Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    window.closeAllAgentModals();
  }
});

// Загрузка агента при старте
function loadAgentFromStorage() {
  try {
    const saved = localStorage.getItem('currentAgent');
    if (saved) {
      currentAgent = JSON.parse(saved);
      updateAgentButton();
    }
  } catch(e) {
    console.error('Ошибка загрузки агента:', e);
  }
}

// Обновление кнопки агента
function updateAgentButton() {
  const btn = document.getElementById('agentBtn');
  if (!btn) return;
  
  if (currentAgent) {
    btn.innerHTML = '💰 Моя прибыль';
    btn.style.background = 'linear-gradient(135deg, #4caf50, #388e3c)';
  } else {
    btn.innerHTML = '🤝 Стать агентом';
    btn.style.background = 'linear-gradient(135deg, #9c27b0, #7b1fa2)';
  }
}

// Открытие модального окна агента
function openAgentModal() {
  if (currentAgent) {
    openAgentProfitModal();
  } else {
    document.getElementById('agentAuthModal').style.display = 'flex';
    lockPageScroll();
  }
}

// Закрытие модального окна авторизации
function closeAgentAuthModal() {
  document.getElementById('agentAuthModal').style.display = 'none';
  unlockPageScroll();
}

// Переключение вкладок вход/регистрация
function switchAgentTab(tab) {
  const loginBtn = document.getElementById('agentTabLogin');
  const regBtn = document.getElementById('agentTabRegister');
  const loginForm = document.getElementById('agentLoginForm');
  const regForm = document.getElementById('agentRegisterForm');
  
  if (tab === 'login') {
    loginBtn.style.background = '#9c27b0';
    loginBtn.style.color = 'white';
    regBtn.style.background = '#e0e0e0';
    regBtn.style.color = '#333';
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
  } else {
    regBtn.style.background = '#4caf50';
    regBtn.style.color = 'white';
    loginBtn.style.background = '#e0e0e0';
    loginBtn.style.color = '#333';
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
  }
}

// Регистрация агента
async function registerAgent() {
  const name = document.getElementById('agentRegName').value.trim();
  const phone = document.getElementById('agentRegPhone').value.trim();
  const password = document.getElementById('agentRegPassword').value;
  const password2 = document.getElementById('agentRegPassword2').value;
  
  if (!name || !phone || !password) {
    Swal.fire('Ошибка', 'Заполните все поля', 'warning');
    return;
  }
  
  if (password !== password2) {
    Swal.fire('Ошибка', 'Пароли не совпадают', 'warning');
    return;
  }
  
  if (password.length < 4) {
    Swal.fire('Ошибка', 'Пароль должен быть минимум 4 символа', 'warning');
    return;
  }
  
  try {
    // Проверяем нет ли уже такого агента
    const existing = await db.collection('agents').where('phone', '==', phone).get();
    if (!existing.empty) {
      Swal.fire('Ошибка', 'Агент с таким телефоном уже зарегистрирован', 'warning');
      return;
    }
    
    // Создаём агента
    const agentRef = await db.collection('agents').add({
      name: name,
      phone: phone,
      password: password, // В реальном проекте нужно хешировать!
      createdAt: Date.now(),
      active: true
    });
    
    currentAgent = {
      id: agentRef.id,
      name: name,
      phone: phone
    };
    
    localStorage.setItem('currentAgent', JSON.stringify(currentAgent));
    updateAgentButton();
    closeAgentAuthModal();
    
    Swal.fire('Успех!', 'Вы зарегистрированы как агент! Теперь делитесь своей ссылкой с клиентами.', 'success');
    
    // Очищаем форму
    document.getElementById('agentRegName').value = '';
    document.getElementById('agentRegPhone').value = '';
    document.getElementById('agentRegPassword').value = '';
    document.getElementById('agentRegPassword2').value = '';
    
    // Открываем окно прибыли
    setTimeout(() => openAgentProfitModal(), 500);
    
  } catch(e) {
    console.error('Ошибка регистрации агента:', e);
    Swal.fire('Ошибка', 'Не удалось зарегистрироваться. Попробуйте позже.', 'error');
  }
}

// Вход агента
async function loginAgent() {
  const phone = document.getElementById('agentLoginPhone').value.trim();
  const password = document.getElementById('agentLoginPassword').value;
  
  if (!phone || !password) {
    Swal.fire('Ошибка', 'Введите телефон и пароль', 'warning');
    return;
  }
  
  try {
    const snapshot = await db.collection('agents').where('phone', '==', phone).get();
    
    if (snapshot.empty) {
      Swal.fire('Ошибка', 'Агент не найден', 'warning');
      return;
    }
    
    const agentDoc = snapshot.docs[0];
    const agentData = agentDoc.data();
    
    if (agentData.password !== password) {
      Swal.fire('Ошибка', 'Неверный пароль', 'warning');
      return;
    }
    
    if (agentData.active === false) {
      Swal.fire('Ошибка', 'Ваш аккаунт заблокирован', 'warning');
      return;
    }
    
    currentAgent = {
      id: agentDoc.id,
      name: agentData.name,
      phone: agentData.phone
    };
    
    localStorage.setItem('currentAgent', JSON.stringify(currentAgent));
    updateAgentButton();
    closeAgentAuthModal();
    
    Swal.fire('Добро пожаловать!', `Вы вошли как агент: ${agentData.name}`, 'success');
    
    // Очищаем форму
    document.getElementById('agentLoginPhone').value = '';
    document.getElementById('agentLoginPassword').value = '';
    
    // Открываем окно прибыли
    setTimeout(() => openAgentProfitModal(), 500);
    
  } catch(e) {
    console.error('Ошибка входа агента:', e);
    Swal.fire('Ошибка', 'Не удалось войти. Попробуйте позже.', 'error');
  }
}

// Выход агента
function logoutAgent() {
  // Отписываемся от слушателя при выходе
  if (agentOrdersListener) {
    agentOrdersListener();
    agentOrdersListener = null;
  }
  currentAgent = null;
  localStorage.removeItem('currentAgent');
  updateAgentButton();
  closeAgentProfitModal();
  Swal.fire('Выход', 'Вы вышли из аккаунта агента', 'info');
}

// Слушатель заказов агента (real-time)
let agentOrdersListener = null;

// Открытие окна прибыли агента
async function openAgentProfitModal() {
  if (!currentAgent) {
    openAgentModal();
    return;
  }
  
  document.getElementById('agentProfitModal').style.display = 'flex';
  lockPageScroll();
  
  // Устанавливаем имя агента
  document.getElementById('agentProfitName').textContent = `Агент: ${currentAgent.name}`;
  
  // Запускаем real-time слушатель заказов
  startAgentOrdersListener();
}

// Закрытие окна прибыли
function closeAgentProfitModal() {
  document.getElementById('agentProfitModal').style.display = 'none';
  unlockPageScroll();
  // НЕ отписываемся от слушателя при закрытии, чтобы уведомлять о новых заказах
}

// Запуск real-time слушателя заказов агента
function startAgentOrdersListener() {
  if (!currentAgent) return;
  
  // Отписываемся от предыдущего слушателя
  if (agentOrdersListener) {
    agentOrdersListener();
  }
  
  const listEl = document.getElementById('agentOrdersList');
  if (listEl) {
    listEl.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">Загрузка заказов...</div>';
  }
  
  // Загружаем заказы по имени агента (основной способ - через ref=name)
  // И также по ID агента (для совместимости со старыми данными)
  const searchValues = [currentAgent.name];
  if (currentAgent.id && currentAgent.id !== currentAgent.name) {
    searchValues.push(currentAgent.id);
  }
  
  console.log('🔍 Поиск заказов агента:', searchValues);
  
  // Используем 'in' для поиска по нескольким значениям
  agentOrdersListener = db.collection('orders')
    .where('partner', 'in', searchValues)
    .limit(500)
    .onSnapshot(snapshot => {
      console.log('📦 Найдено заказов:', snapshot.size);
      
      // Проверяем, есть ли новые заказы
      const changes = snapshot.docChanges();
      const newOrders = changes.filter(change => change.type === 'added');
      
      // Если окно прибыли открыто и есть новые заказы (не при первой загрузке)
      if (newOrders.length > 0 && allAgentOrders.length > 0) {
        newOrders.forEach(change => {
          const newOrder = change.doc.data();
          // Показываем уведомление о новом заказе
          Swal.fire({
            icon: 'success',
            title: '🎉 Новый заказ!',
            html: `
              <div style="text-align:left;">
                <div><strong>Клиент:</strong> ${newOrder.name || 'Клиент'}</div>
                <div><strong>Телефон:</strong> ${newOrder.phone || ''}</div>
                <div><strong>Сумма:</strong> ${(newOrder.total || 0).toLocaleString()} сом</div>
                <div style="color:#4caf50; font-weight:bold; margin-top:10px;">
                  💰 Ваша прибыль: +${Math.round((newOrder.total || 0) * 0.02).toLocaleString()} сом
                </div>
              </div>
            `,
            timer: 5000,
            timerProgressBar: true,
            showConfirmButton: true,
            confirmButtonText: 'Отлично!'
          });
        });
      }
      
      // Обновляем данные
      allAgentOrders = [];
      snapshot.forEach(doc => allAgentOrders.push({ id: doc.id, ...doc.data() }));
      allAgentOrders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Применяем фильтры и отображаем
      filterAgentOrders();
      
    }, error => {
      console.error('Ошибка слушателя заказов агента:', error);
      const listEl = document.getElementById('agentOrdersList');
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align:center; padding:30px; color:#dc3545;">
            <div>Ошибка загрузки заказов</div>
            <div style="font-size:12px; margin-top:5px;">${error.message}</div>
          </div>
        `;
      }
    });
}

// Хранилище всех заказов агента
let allAgentOrders = [];
let filteredAgentOrders = [];

// Загрузка/обновление заказов агента (перезапускает слушатель)
async function loadAgentOrders() {
  if (!currentAgent) return;
  
  // Перезапускаем real-time слушатель
  startAgentOrdersListener();
}

// Фильтрация заказов по периоду и статусу
function filterAgentOrders() {
  const periodFilter = document.getElementById('agentPeriodFilter')?.value || 'all';
  const statusFilter = document.getElementById('agentStatusFilter')?.value || 'all';
  
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  filteredAgentOrders = allAgentOrders.filter(order => {
    // Фильтр по периоду
    const orderTime = order.timestamp || 0;
    let periodMatch = true;
    
    switch(periodFilter) {
      case 'today':
        periodMatch = orderTime >= today.getTime();
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        periodMatch = orderTime >= weekStart.getTime();
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        periodMatch = orderTime >= monthStart.getTime();
        break;
      case 'year':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        periodMatch = orderTime >= yearStart.getTime();
        break;
    }
    
    // Фильтр по статусу
    const statusMatch = statusFilter === 'all' || order.status === statusFilter;
    
    return periodMatch && statusMatch;
  });
  
  // Сортируем: новые заказы всегда сверху
  filteredAgentOrders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  displayAgentOrders();
  updateAgentStats(filteredAgentOrders);
  drawAgentProfitChart(filteredAgentOrders);
}

// Отображение списка заказов
function displayAgentOrders() {
  const listEl = document.getElementById('agentOrdersList');
  if (!listEl) return;
  
  const orders = filteredAgentOrders;
  
  // Если вообще нет заказов
  if (allAgentOrders.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:40px; color:#666;">
        <div style="font-size:48px; margin-bottom:15px;">📭</div>
        <div style="font-size:16px;">Пока нет заказов от ваших клиентов</div>
        <div style="font-size:14px; color:#999; margin-top:10px;">Поделитесь своей ссылкой, чтобы привлечь клиентов!</div>
        <div style="font-size:13px; color:#9c27b0; margin-top:15px; padding:10px; background:#f3e5f5; border-radius:8px;">
          🔔 Новые заказы будут появляться автоматически
        </div>
      </div>
    `;
    document.getElementById('agentFilteredCount').textContent = '0 заказов';
    return;
  }
  
  // Если по фильтрам ничего не найдено
  if (orders.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:40px; color:#666;">
        <div style="font-size:48px; margin-bottom:15px;">🔍</div>
        <div style="font-size:16px;">Заказов по выбранным фильтрам не найдено</div>
      </div>
    `;
    document.getElementById('agentFilteredCount').textContent = '0 заказов';
    return;
  }
  
  document.getElementById('agentFilteredCount').textContent = `${orders.length} ${orders.length === 1 ? 'заказ' : orders.length < 5 ? 'заказа' : 'заказов'}`;
    
  let html = '';
  
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000; // 24 часа назад
  
  orders.forEach(order => {
    const profit = Math.round((order.total || 0) * 0.02); // 2%
    const date = order.time || new Date(order.timestamp).toLocaleString();
    const statusColors = {
      'Новый': '#17a2b8',
      'В обработке': '#ffc107',
      'Доставляется': '#007bff',
      'Доставлен': '#28a745',
      'Отменён': '#dc3545'
    };
    const statusColor = statusColors[order.status] || '#666';
    
    // Проверяем, новый ли заказ (менее 24 часов)
    const isRecent = (order.timestamp || 0) > oneDayAgo;
    const recentBadge = isRecent ? '<span style="background:#ff5722; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:8px; animation:pulse 1.5s infinite;">🆕 НОВЫЙ</span>' : '';
    const recentBorder = isRecent ? 'box-shadow:0 0 10px rgba(255,87,34,0.3);' : '';
    
    // Формируем список товаров (скрыт по умолчанию)
    let itemsHtml = '';
    const itemsCount = order.items ? order.items.length : 0;
    if (order.items && order.items.length > 0) {
      itemsHtml = `<div id="agentOrderItems_${order.id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;">`;
      itemsHtml += '<div style="font-size:12px; color:#666; margin-bottom:5px;">📦 Товары:</div>';
      order.items.forEach(item => {
        const itemTotal = (item.price || 0) * (item.qty || 0);
        itemsHtml += `
          <div style="display:flex; justify-content:space-between; font-size:13px; padding:3px 0; color:#555;">
            <span style="flex:1;">${item.title || 'Товар'}</span>
            <span style="white-space:nowrap; margin-left:10px;">${item.qty} × ${item.price} = <strong>${itemTotal.toLocaleString()}</strong> сом</span>
          </div>
        `;
      });
      itemsHtml += '</div>';
    }
    
    // Кнопка показать товары
    const showItemsBtn = itemsCount > 0 ? `
      <button onclick="toggleAgentOrderItems('${order.id}')" id="agentOrderItemsBtn_${order.id}" style="padding:5px 10px; background:#9c27b0; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px;">
        <span>👁️ Товары (${itemsCount})</span>
      </button>
    ` : '';
    
    html += `
      <div style="background:${isRecent ? '#fff8e1' : '#f8f9fa'}; border-radius:12px; padding:15px; border-left:4px solid ${statusColor}; ${recentBorder}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
          <div style="flex:1; min-width:200px;">
            <div style="font-weight:600; color:#333; font-size:15px;">${order.name || 'Клиент'}${recentBadge}</div>
            <div style="font-size:13px; color:#666; margin-top:2px;">📱 ${order.phone || ''}</div>
            <div style="font-size:12px; color:#888; margin-top:2px;">📍 ${order.address || ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#999; margin-bottom:4px;">${date}</div>
            <div style="font-size:12px; padding:4px 10px; background:${statusColor}; color:white; border-radius:12px; display:inline-block; font-weight:500;">${order.status || 'Новый'}</div>
          </div>
        </div>
        ${itemsHtml}
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; margin-top:12px; border-top:1px solid #e0e0e0; flex-wrap:wrap; gap:10px;">
          <div>
            <span style="color:#666;">Сумма заказа:</span>
            <span style="font-weight:600; color:#333; font-size:15px;">${(order.total || 0).toLocaleString()} сом</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${showItemsBtn}
            <div style="background:#e8f5e9; padding:6px 14px; border-radius:8px;">
              <span style="color:#388e3c; font-weight:700; font-size:14px;">+${profit.toLocaleString()} сом</span>
            </div>
            <button onclick="removeClientFromAgent('${order.phone}', '${(order.name || '').replace(/'/g, "\\'")}', '${order.id}')" style="padding:6px 12px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500;">
              ❌ Отвязать
            </button>
          </div>
        </div>
      </div>
    `;
  });
  
  listEl.innerHTML = html;
}

// Переключение видимости товаров в заказе
function toggleAgentOrderItems(orderId) {
  const itemsDiv = document.getElementById('agentOrderItems_' + orderId);
  const btn = document.getElementById('agentOrderItemsBtn_' + orderId);
  
  if (itemsDiv && btn) {
    if (itemsDiv.style.display === 'none') {
      itemsDiv.style.display = 'block';
      btn.style.background = '#7b1fa2';
      btn.innerHTML = '<span>🔽 Скрыть</span>';
    } else {
      itemsDiv.style.display = 'none';
      btn.style.background = '#9c27b0';
      const count = itemsDiv.querySelectorAll('div[style*="justify-content:space-between"]').length;
      btn.innerHTML = `<span>👁️ Товары (${count})</span>`;
    }
  }
}

// Обновление статистики
async function updateAgentStats(orders) {
  let totalSum = 0;
  let totalOrders = orders.length;
  const uniqueClients = new Set();
  
  orders.forEach(order => {
    totalSum += order.total || 0;
    if (order.phone) uniqueClients.add(order.phone);
  });
  
  const totalProfit = Math.round(totalSum * 0.02);
  
  // Загружаем выплаты агента
  let totalPaid = 0;
  if (currentAgent && currentAgent.id) {
    try {
      const payoutsSnapshot = await db.collection('agentPayouts')
        .where('agentId', '==', currentAgent.id)
        .get();
      
      payoutsSnapshot.forEach(doc => {
        totalPaid += doc.data().amount || 0;
      });
    } catch(e) {
      console.log('Не удалось загрузить выплаты:', e);
    }
  }
  
  const balance = totalProfit - totalPaid;
  
  const ordersEl = document.getElementById('agentTotalOrders');
  const sumEl = document.getElementById('agentTotalSum');
  const profitEl = document.getElementById('agentTotalProfit');
  const clientsEl = document.getElementById('agentTotalClients');
  const paidEl = document.getElementById('agentTotalPaid');
  const balanceEl = document.getElementById('agentBalance');
  
  if (ordersEl) ordersEl.textContent = totalOrders;
  if (sumEl) sumEl.textContent = totalSum.toLocaleString();
  if (profitEl) profitEl.textContent = totalProfit.toLocaleString();
  if (clientsEl) clientsEl.textContent = uniqueClients.size;
  if (paidEl) paidEl.textContent = totalPaid.toLocaleString();
  if (balanceEl) balanceEl.textContent = balance.toLocaleString();
}

// Получить заказы предыдущего периода
function getPreviousPeriodOrders(orders, period) {
  const now = new Date();
  let startTime, endTime;
  
  switch(period) {
    case 'today':
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      startTime = yesterday.getTime();
      endTime = now.setHours(0, 0, 0, 0);
      break;
    case 'week':
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(lastWeekStart.getDate() - lastWeekStart.getDay() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
      startTime = lastWeekStart.getTime();
      endTime = lastWeekEnd.getTime();
      break;
    case 'month':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      startTime = lastMonthStart.getTime();
      endTime = lastMonthEnd.getTime();
      break;
    case 'year':
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear(), 0, 1);
      startTime = lastYearStart.getTime();
      endTime = lastYearEnd.getTime();
      break;
    default:
      return [];
  }
  
  return orders.filter(o => {
    const t = o.timestamp || 0;
    return t >= startTime && t < endTime;
  });
}

// Рисование графика прибыли
let agentChart = null;
function drawAgentProfitChart(orders) {
  const chartContainer = document.getElementById('agentProfitChart');
  const canvas = document.getElementById('agentChartCanvas');
  if (!chartContainer || !canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Группируем заказы по дням
  const dailyData = {};
  orders.forEach(order => {
    const timestamp = order.timestamp || order.createdAt || order.date;
    if (!timestamp) return;
    
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return;
    
    const dateKey = date.toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = 0;
    }
    dailyData[dateKey] += Math.round((order.total || 0) * 0.02);
  });
  
  const sortedDates = Object.keys(dailyData).sort();
  
  // Если нет данных для графика
  if (sortedDates.length === 0) {
    chartContainer.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:150px; color:#999;">
        <div style="font-size:40px; margin-bottom:10px;">📊</div>
        <div style="font-size:14px;">Нет данных для отображения графика</div>
        <div style="font-size:12px; margin-top:5px;">Заказы появятся здесь после оформления</div>
      </div>
    `;
    return;
  }
  
  // Восстанавливаем canvas если был заменён на текст
  if (!document.getElementById('agentChartCanvas')) {
    chartContainer.innerHTML = '<canvas id="agentChartCanvas" style="max-height:200px; width:100%;"></canvas>';
  }
  
  const labels = sortedDates.map(d => {
    const date = new Date(d);
    return date.getDate() + '.' + (date.getMonth() + 1);
  });
  const data = sortedDates.map(d => dailyData[d]);
  
  // Уничтожаем старый график
  if (agentChart) {
    agentChart.destroy();
    agentChart = null;
  }
  
  // Создаем новый график (если есть Chart.js)
  if (typeof Chart !== 'undefined') {
    try {
      const canvasEl = document.getElementById('agentChartCanvas');
      if (!canvasEl) return;
      
      agentChart = new Chart(canvasEl.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Прибыль (сом)',
            data: data,
            borderColor: '#9c27b0',
            backgroundColor: 'rgba(156, 39, 176, 0.1)',
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#9c27b0'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return value + ' сом';
                }
              }
            }
          }
        }
      });
    } catch(e) {
      console.error('Ошибка Chart.js:', e);
      chartContainer.innerHTML = `
        <div style="text-align:center; padding:20px; color:#666;">
          <div>📈 Прибыль: ${data.reduce((a,b) => a+b, 0)} сом за ${data.length} дней</div>
        </div>
      `;
    }
  } else {
    // Простая текстовая сводка если Chart.js не подключен
    chartContainer.innerHTML = `
      <div style="padding:20px; text-align:center; color:#666;">
        <div style="font-size:24px; color:#9c27b0; font-weight:700;">${data.reduce((a,b) => a+b, 0)} сом</div>
        <div style="font-size:14px; margin-top:5px;">Прибыль за ${data.length} дней</div>
      </div>
    `;
  }
}

// Экспорт отчета
function exportAgentReport() {
  if (!currentAgent || filteredAgentOrders.length === 0) {
    Swal.fire('Нет данных', 'Нет заказов для экспорта', 'info');
    return;
  }
  
  const periodFilter = document.getElementById('agentPeriodFilter')?.value || 'all';
  const statusFilter = document.getElementById('agentStatusFilter')?.value || 'all';
  
  let csv = 'Дата,Клиент,Телефон,Адрес,Статус,Сумма,Прибыль\n';
  
  filteredAgentOrders.forEach(order => {
    const date = order.time || new Date(order.timestamp).toLocaleString();
    const name = (order.name || 'Клиент').replace(/,/g, ' ');
    const phone = order.phone || '';
    const address = (order.address || '').replace(/,/g, ' ');
    const status = order.status || 'Новый';
    const total = order.total || 0;
    const profit = Math.round(total * 0.02);
    
    csv += `"${date}","${name}","${phone}","${address}","${status}",${total},${profit}\n`;
  });
  
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `agent_report_${currentAgent.name}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  
  Swal.fire({
    icon: 'success',
    title: 'Экспортировано!',
    text: `Отчет сохранен: ${filteredAgentOrders.length} заказов`,
    timer: 2000,
    showConfirmButton: false
  });
}

// Отвязать клиента от агента
async function removeClientFromAgent(phone, clientName, orderId) {
  const result = await Swal.fire({
    title: '❌ Отвязать клиента?',
    html: `Вы уверены, что хотите отвязать клиента <strong>"${clientName}"</strong> (${phone}) от себя?<br><br><span style="color:#ff9800;">Все заказы этого клиента будут отвязаны от вас.</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, отвязать',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    // Находим все заказы этого клиента с текущим агентом
    const snapshot = await db.collection('orders')
      .where('phone', '==', phone)
      .where('partner', '==', currentAgent.id)
      .get();
    
    if (snapshot.empty) {
      Swal.fire('Ошибка', 'Заказы не найдены', 'error');
      return;
    }
    
    // Удаляем привязку к агенту
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { partner: firebase.firestore.FieldValue.delete() });
    });
    
    await batch.commit();
    
    Swal.fire({
      icon: 'success',
      title: 'Клиент отвязан',
      text: `Клиент "${clientName}" больше не привязан к вам. Отвязано ${snapshot.size} заказов.`,
      timer: 2500,
      showConfirmButton: false
    });
    
    // Обновляем список
    await loadAgentOrders();
    
  } catch(e) {
    console.error('Ошибка отвязки клиента:', e);
    Swal.fire('Ошибка', 'Не удалось отвязать клиента', 'error');
  }
}

// Инициализация системы агентов при загрузке
document.addEventListener('DOMContentLoaded', function() {
  loadAgentFromStorage();
});

// ===== УПРАВЛЕНИЕ АГЕНТАМИ (для админа) =====

// Открыть окно управления агентами
async function openAgentsManagement() {
  document.getElementById('agentsManagementModal').style.display = 'flex';
  lockPageScroll();
  await loadAgentsManagement();
}

// Закрыть окно управления агентами
function closeAgentsManagement() {
  document.getElementById('agentsManagementModal').style.display = 'none';
  unlockPageScroll();
}

// Обновить список агентов
async function refreshAgentsManagement() {
  await loadAgentsManagement();
}

// Загрузить список агентов
async function loadAgentsManagement() {
  const listEl = document.getElementById('agentsManagementList');
  listEl.innerHTML = '<div style="text-align:center; color:#999; padding:30px;">Загрузка агентов...</div>';
  
  try {
    // Получаем всех агентов
    const agentsSnapshot = await db.collection('agents').get();
    
    if (agentsSnapshot.empty) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:40px; color:#666;">
          <div style="font-size:48px; margin-bottom:15px;">👥</div>
          <div style="font-size:16px;">Пока нет зарегистрированных агентов</div>
        </div>
      `;
      document.getElementById('adminTotalAgents').textContent = '0';
      document.getElementById('adminActiveAgents').textContent = '0';
      document.getElementById('adminAgentsTotalOrders').textContent = '0';
      document.getElementById('adminAgentsTotalCommission').textContent = '0 сом';
      return;
    }
    
    // Собираем данные агентов
    const agents = [];
    const agentIds = new Set(); // Множество ID агентов
    agentsSnapshot.forEach(doc => {
      agents.push({ id: doc.id, ...doc.data() });
      agentIds.add(doc.id);
    });
    
    // Создаём карту имён агентов для быстрого поиска
    const agentNames = new Map();
    agents.forEach(agent => {
      agentNames.set(agent.name, agent.id);
      agentNames.set(agent.id, agent.id); // также по ID
    });
    
    // Получаем статистику заказов ТОЛЬКО для зарегистрированных агентов
    const ordersSnapshot = await db.collection('orders').get();
    const ordersByAgent = {};
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      // Проверяем partner - может быть имя или ID агента
      let agentId = null;
      if (order.partner) {
        // Сначала проверяем по ID
        if (agentIds.has(order.partner)) {
          agentId = order.partner;
        } else {
          // Иначе ищем по имени
          agentId = agentNames.get(order.partner);
        }
      }
      
      if (agentId) {
        if (!ordersByAgent[agentId]) {
          ordersByAgent[agentId] = { count: 0, total: 0 };
        }
        ordersByAgent[agentId].count++;
        ordersByAgent[agentId].total += order.total || 0;
      }
    });
    
    // Считаем общую статистику
    let totalAgents = agents.length;
    let activeAgents = agents.filter(a => a.active !== false).length;
    let totalOrders = 0;
    let totalCommission = 0;
    
    Object.values(ordersByAgent).forEach(stats => {
      totalOrders += stats.count;
      totalCommission += Math.round(stats.total * 0.02);
    });
    
    document.getElementById('adminTotalAgents').textContent = totalAgents;
    document.getElementById('adminActiveAgents').textContent = activeAgents;
    document.getElementById('adminAgentsTotalOrders').textContent = totalOrders;
    document.getElementById('adminAgentsTotalCommission').textContent = totalCommission.toLocaleString() + ' сом';
    
    // Сортируем: сначала по количеству заказов (убывание)
    agents.sort((a, b) => {
      const ordersA = ordersByAgent[a.id]?.count || 0;
      const ordersB = ordersByAgent[b.id]?.count || 0;
      return ordersB - ordersA;
    });
    
    // Формируем HTML
    let html = '';
    
    // Загружаем выплаты агентам
    const payoutsSnapshot = await db.collection('agentPayouts').get();
    const payoutsByAgent = {};
    payoutsSnapshot.forEach(doc => {
      const payout = doc.data();
      if (payout.agentId) {
        if (!payoutsByAgent[payout.agentId]) {
          payoutsByAgent[payout.agentId] = 0;
        }
        payoutsByAgent[payout.agentId] += payout.amount || 0;
      }
    });
    
    agents.forEach(agent => {
      const stats = ordersByAgent[agent.id] || { count: 0, total: 0 };
      const commission = Math.round(stats.total * 0.02);
      const paidOut = payoutsByAgent[agent.id] || 0;
      const balance = commission - paidOut; // Остаток к выплате
      const isActive = agent.active !== false;
      const createdDate = agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'Неизвестно';
      
      html += `
        <div style="background:#f8f9fa; border-radius:12px; padding:15px; border-left:4px solid ${isActive ? '#4caf50' : '#dc3545'};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:15px; flex-wrap:wrap;">
            <div style="flex:1; min-width:200px;">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                <div style="font-weight:700; font-size:16px; color:#333;">${agent.name || 'Без имени'}</div>
                <span style="font-size:11px; padding:3px 8px; border-radius:10px; background:${isActive ? '#e8f5e9' : '#ffebee'}; color:${isActive ? '#388e3c' : '#c62828'};">
                  ${isActive ? '✓ Активен' : '✗ Заблокирован'}
                </span>
              </div>
              <div style="font-size:14px; color:#666; margin-bottom:5px;">📱 ${agent.phone || 'Нет телефона'}</div>
              <div style="font-size:12px; color:#999;">📅 Регистрация: ${createdDate}</div>
            </div>
            
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <div style="text-align:center; padding:8px 12px; background:white; border-radius:8px;">
                <div style="font-size:10px; color:#666;">Заказов</div>
                <div style="font-size:16px; font-weight:700; color:#2196f3;">${stats.count}</div>
              </div>
              <div style="text-align:center; padding:8px 12px; background:white; border-radius:8px;">
                <div style="font-size:10px; color:#666;">Комиссия</div>
                <div style="font-size:16px; font-weight:700; color:#4caf50;">${commission.toLocaleString()}</div>
              </div>
              <div style="text-align:center; padding:8px 12px; background:white; border-radius:8px;">
                <div style="font-size:10px; color:#666;">Выплачено</div>
                <div style="font-size:16px; font-weight:700; color:#ff9800;">${paidOut.toLocaleString()}</div>
              </div>
              <div style="text-align:center; padding:8px 12px; background:${balance > 0 ? '#fff3e0' : '#e8f5e9'}; border-radius:8px; border:2px solid ${balance > 0 ? '#ff9800' : '#4caf50'};">
                <div style="font-size:10px; color:#666;">К выплате</div>
                <div style="font-size:16px; font-weight:700; color:${balance > 0 ? '#e65100' : '#388e3c'};">${balance.toLocaleString()}</div>
              </div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${balance > 0 ? `
              <button onclick="payoutToAgent('${agent.id}', '${(agent.name || '').replace(/'/g, "\\'")}', ${balance})" style="padding:8px 15px; background:#4caf50; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                💸 Выплатить
              </button>
              ` : ''}
              <button onclick="viewAgentOrders('${agent.id}', '${(agent.name || '').replace(/'/g, "\\'")}')" style="padding:8px 15px; background:#2196f3; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                📋 Заказы
              </button>
              <button onclick="viewAgentPayouts('${agent.id}', '${(agent.name || '').replace(/'/g, "\\'")}')" style="padding:8px 15px; background:#9c27b0; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                📜 История выплат
              </button>
              <button onclick="toggleAgentStatus('${agent.id}', ${isActive})" style="padding:8px 15px; background:${isActive ? '#ff9800' : '#4caf50'}; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                ${isActive ? '🔒 Блокировать' : '🔓 Разблокировать'}
              </button>
              <button onclick="deleteAgent('${agent.id}', '${(agent.name || '').replace(/'/g, "\\'")}')" style="padding:8px 15px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                🗑️ Удалить
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    listEl.innerHTML = html;
    
  } catch(e) {
    console.error('Ошибка загрузки агентов:', e);
    listEl.innerHTML = `
      <div style="text-align:center; padding:30px; color:#dc3545;">
        <div>Ошибка загрузки агентов</div>
        <div style="font-size:12px; margin-top:5px;">${e.message}</div>
      </div>
    `;
  }
}

// Просмотр заказов агента
async function viewAgentOrders(agentId, agentName) {
  try {
    const snapshot = await db.collection('orders')
      .where('partner', '==', agentId)
      .limit(50)
      .get();
    
    // Также ищем по имени агента
    const snapshotByName = await db.collection('orders')
      .where('partner', '==', agentName)
      .limit(50)
      .get();
    
    // Объединяем результаты
    const ordersMap = new Map();
    snapshot.forEach(doc => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
    snapshotByName.forEach(doc => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
    const orders = Array.from(ordersMap.values());
    
    if (orders.length === 0) {
      Swal.fire('Заказы агента', `У агента "${agentName}" пока нет заказов`, 'info');
      return;
    }
    
    orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let html = '<div style="max-height:400px; overflow-y:auto;">';
    let totalSum = 0;
    
    orders.forEach(order => {
      totalSum += order.total || 0;
      const date = order.time || new Date(order.timestamp).toLocaleString();
      const commission = Math.round((order.total || 0) * 0.02);
      
      html += `
        <div style="background:#f8f9fa; padding:12px; border-radius:8px; margin-bottom:10px; border-left:3px solid #9c27b0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:600;">${order.name || 'Клиент'}</div>
              <div style="font-size:13px; color:#666;">${order.phone || ''}</div>
              <div style="font-size:12px; color:#999;">${date}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:600;">${(order.total || 0).toLocaleString()} сом</div>
              <div style="color:#4caf50; font-size:13px;">+${commission} сом</div>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    
    const totalCommission = Math.round(totalSum * 0.02);
    
    Swal.fire({
      title: `📋 Заказы агента: ${agentName}`,
      html: `
        <div style="margin-bottom:15px; padding:10px; background:#e8f5e9; border-radius:8px;">
          <strong>Всего заказов:</strong> ${orders.length} | 
          <strong>Сумма:</strong> ${totalSum.toLocaleString()} сом | 
          <strong>Комиссия:</strong> ${totalCommission.toLocaleString()} сом
        </div>
        ${html}
      `,
      width: 600,
      showConfirmButton: true,
      confirmButtonText: 'Закрыть'
    });
    
  } catch(e) {
    console.error('Ошибка загрузки заказов агента:', e);
    Swal.fire('Ошибка', 'Не удалось загрузить заказы агента', 'error');
  }
}

// Блокировка/разблокировка агента
async function toggleAgentStatus(agentId, currentlyActive) {
  const action = currentlyActive ? 'заблокировать' : 'разблокировать';
  
  const result = await Swal.fire({
    title: `${currentlyActive ? '🔒' : '🔓'} ${action.charAt(0).toUpperCase() + action.slice(1)} агента?`,
    text: currentlyActive 
      ? 'Агент не сможет войти в систему и получать комиссию' 
      : 'Агент снова сможет работать в системе',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: currentlyActive ? 'Заблокировать' : 'Разблокировать',
    cancelButtonText: 'Отмена',
    confirmButtonColor: currentlyActive ? '#ff9800' : '#4caf50'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    await db.collection('agents').doc(agentId).update({
      active: !currentlyActive
    });
    
    Swal.fire({
      icon: 'success',
      title: currentlyActive ? 'Агент заблокирован' : 'Агент разблокирован',
      timer: 1500,
      showConfirmButton: false
    });
    
    await loadAgentsManagement();
    
  } catch(e) {
    console.error('Ошибка изменения статуса агента:', e);
    Swal.fire('Ошибка', 'Не удалось изменить статус агента', 'error');
  }
}

// Удаление агента
async function deleteAgent(agentId, agentName) {
  const result = await Swal.fire({
    title: '🗑️ Удалить агента?',
    html: `Вы уверены, что хотите удалить агента <strong>"${agentName}"</strong>?<br><br><span style="color:#dc3545;">Это действие нельзя отменить!</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Удалить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    await db.collection('agents').doc(agentId).delete();
    
    Swal.fire({
      icon: 'success',
      title: 'Агент удалён',
      timer: 1500,
      showConfirmButton: false
    });
    
    await loadAgentsManagement();
    
  } catch(e) {
    console.error('Ошибка удаления агента:', e);
    Swal.fire('Ошибка', 'Не удалось удалить агента', 'error');
  }
}

// ===== НАЗНАЧЕНИЕ КЛИЕНТОВ АГЕНТАМ =====

let allClientsData = [];
let allAgentsForAssign = [];

// Открыть окно назначения клиентов
async function openClientsForAgents() {
  document.getElementById('clientsForAgentsModal').style.display = 'flex';
  await loadClientsForAgents();
}

// Закрыть окно
function closeClientsForAgents() {
  document.getElementById('clientsForAgentsModal').style.display = 'none';
}

// Загрузить клиентов
async function loadClientsForAgents() {
  const listEl = document.getElementById('clientsForAgentsList');
  listEl.innerHTML = '<div style="text-align:center; color:#999; padding:30px;">Загрузка клиентов...</div>';
  
  try {
    // Загружаем всех агентов
    const agentsSnapshot = await db.collection('agents').get();
    allAgentsForAssign = [];
    agentsSnapshot.forEach(doc => {
      allAgentsForAssign.push({ id: doc.id, ...doc.data() });
    });
    
    // Загружаем все заказы
    const ordersSnapshot = await db.collection('orders').get();
    
    // Группируем клиентов по телефону
    const clientsMap = {};
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const phone = order.phone || '';
      const name = order.name || 'Без имени';
      
      if (!phone) return;
      
      if (!clientsMap[phone]) {
        clientsMap[phone] = {
          phone: phone,
          name: name,
          ordersCount: 0,
          totalSum: 0,
          lastOrder: 0,
          partner: null,
          orderIds: []
        };
      }
      
      clientsMap[phone].ordersCount++;
      clientsMap[phone].totalSum += order.total || 0;
      clientsMap[phone].orderIds.push(doc.id);
      
      if (order.timestamp > clientsMap[phone].lastOrder) {
        clientsMap[phone].lastOrder = order.timestamp;
        clientsMap[phone].name = name; // Берём имя из последнего заказа
      }
      
      // Если у заказа есть агент - запоминаем (проверяем по имени или ID)
      if (order.partner) {
        const foundAgent = allAgentsForAssign.find(a => a.name === order.partner || a.id === order.partner);
        if (foundAgent) {
          clientsMap[phone].partner = foundAgent.name; // Сохраняем имя агента
        }
      }
    });
    
    // Преобразуем в массив и сортируем
    allClientsData = Object.values(clientsMap);
    allClientsData.sort((a, b) => b.lastOrder - a.lastOrder);
    
    renderClientsForAgents();
    
  } catch(e) {
    console.error('Ошибка загрузки клиентов:', e);
    listEl.innerHTML = `
      <div style="text-align:center; padding:30px; color:#dc3545;">
        <div>Ошибка загрузки</div>
        <div style="font-size:12px;">${e.message}</div>
      </div>
    `;
  }
}

// Фильтрация клиентов
function filterClientsForAgents() {
  renderClientsForAgents();
}

// Отрисовка списка клиентов
function renderClientsForAgents() {
  const listEl = document.getElementById('clientsForAgentsList');
  const search = (document.getElementById('clientsSearchInput').value || '').toLowerCase().trim();
  const filter = document.getElementById('clientsAgentFilter').value;
  
  let filtered = allClientsData.filter(client => {
    // Поиск
    if (search) {
      const matchName = (client.name || '').toLowerCase().includes(search);
      const matchPhone = (client.phone || '').includes(search);
      if (!matchName && !matchPhone) return false;
    }
    
    // Фильтр по агенту
    if (filter === 'no-agent' && client.partner) return false;
    if (filter === 'has-agent' && !client.partner) return false;
    
    return true;
  });
  
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:40px; color:#666;">
        <div style="font-size:48px; margin-bottom:15px;">🔍</div>
        <div>Клиенты не найдены</div>
      </div>
    `;
    return;
  }
  
  // Формируем опции агентов
  let agentOptions = '<option value="">-- Без агента --</option>';
  allAgentsForAssign.forEach(agent => {
    agentOptions += `<option value="${agent.id}">${agent.name} (${agent.phone})</option>`;
  });
  
  let html = '';
  
  filtered.forEach(client => {
    const lastOrderDate = client.lastOrder ? new Date(client.lastOrder).toLocaleDateString() : 'Неизвестно';
    // Ищем агента по имени ИЛИ по ID (для совместимости)
    const currentAgent = allAgentsForAssign.find(a => a.name === client.partner || a.id === client.partner);
    const agentName = currentAgent ? currentAgent.name : (client.partner || 'Не назначен');
    const agentColor = currentAgent ? '#4caf50' : (client.partner ? '#2196f3' : '#999');
    
    html += `
      <div style="background:#f8f9fa; border-radius:10px; padding:15px; border-left:4px solid ${currentAgent || client.partner ? '#4caf50' : '#ff9800'};">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap;">
          <div style="flex:1; min-width:200px;">
            <div style="font-weight:600; font-size:15px; color:#333;">${client.name}</div>
            <div style="font-size:14px; color:#666;">📱 ${client.phone}</div>
            <div style="font-size:12px; color:#999; margin-top:5px;">
              📦 ${client.ordersCount} заказов | 💰 ${client.totalSum.toLocaleString()} сом | 📅 ${lastOrderDate}
            </div>
          </div>
          
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-size:13px;">
              <span style="color:#666;">Агент:</span>
              <span style="color:${agentColor}; font-weight:600;">${agentName}</span>
            </div>
            <select onchange="assignAgentToClient('${client.phone}', this.value)" style="padding:8px 12px; border:2px solid #9c27b0; border-radius:8px; font-size:14px; min-width:180px;">
              ${currentAgent ? agentOptions.replace(`value="${currentAgent.id}"`, `value="${currentAgent.id}" selected`) : agentOptions}
            </select>
          </div>
        </div>
      </div>
    `;
  });
  
  listEl.innerHTML = html;
}

// Назначить агента клиенту (обновляем все его заказы)
async function assignAgentToClient(phone, agentId) {
  const client = allClientsData.find(c => c.phone === phone);
  if (!client) return;
  
  const agent = agentId ? allAgentsForAssign.find(a => a.id === agentId) : null;
  const agentName = agent ? agent.name : 'без агента';
  
  try {
    // Показываем индикатор загрузки
    Swal.fire({
      title: 'Обновление...',
      text: 'Назначение агента для всех заказов клиента',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
    
    // Получаем ВСЕ заказы клиента напрямую из Firebase (включая новые)
    const ordersSnapshot = await db.collection('orders')
      .where('phone', '==', phone)
      .get();
    
    if (ordersSnapshot.empty) {
      Swal.fire('Ошибка', 'Заказы клиента не найдены', 'warning');
      return;
    }
    
    // Обновляем все заказы клиента
    const batch = db.batch();
    let updatedCount = 0;
    
    ordersSnapshot.forEach(doc => {
      const orderRef = db.collection('orders').doc(doc.id);
      if (agent) {
        // Записываем имя агента (для поиска по имени)
        batch.update(orderRef, { partner: agent.name });
      } else {
        batch.update(orderRef, { partner: firebase.firestore.FieldValue.delete() });
      }
      updatedCount++;
    });
    
    await batch.commit();
    
    // Сохраняем связь клиент-агент в отдельную коллекцию
    // Это позволит автоматически привязывать новые заказы клиента к агенту
    const clientAgentRef = db.collection('clientAgents').doc(phone);
    if (agent) {
      await clientAgentRef.set({
        phone: phone,
        clientName: client.name,
        agentName: agent.name,
        agentId: agent.id,
        updatedAt: Date.now()
      });
    } else {
      // Удаляем связь если агент снят
      await clientAgentRef.delete().catch(() => {});
    }
    
    // Обновляем локальные данные (сохраняем имя агента)
    client.partner = agent ? agent.name : null;
    client.orderIds = ordersSnapshot.docs.map(doc => doc.id); // Обновляем список ID
    renderClientsForAgents();
    
    Swal.fire({
      icon: 'success',
      title: 'Готово!',
      text: `Клиент "${client.name}" назначен ${agent ? 'агенту: ' + agent.name : 'без агента'}. Обновлено ${updatedCount} заказов.`,
      timer: 2000,
      showConfirmButton: false
    });
    
  } catch(e) {
    console.error('Ошибка назначения агента:', e);
    Swal.fire('Ошибка', 'Не удалось назначить агента', 'error');
  }
}

// ===== КОНЕЦ НАЗНАЧЕНИЯ КЛИЕНТОВ =====

// ===== СПИСОК КЛИЕНТОВ АГЕНТА =====

function showAgentClientsList() {
  const modal = document.getElementById('agentClientsListModal');
  const content = document.getElementById('agentClientsListContent');
  
  if (!modal || !content) return;
  
  modal.style.display = 'flex';
  
  // Получаем уникальных клиентов из заказов агента с подсчётом заказов
  const clientsMap = new Map();
  
  (filteredAgentOrders || allAgentOrders || []).forEach(order => {
    const phone = order.phone || order.customerPhone;
    if (phone) {
      if (!clientsMap.has(phone)) {
        clientsMap.set(phone, {
          name: order.customerName || order.name || 'Без имени',
          phone: phone,
          address: order.address || order.customerAddress || 'Не указан',
          ordersCount: 1,
          totalSum: order.total || 0
        });
      } else {
        const client = clientsMap.get(phone);
        client.ordersCount += 1;
        client.totalSum += order.total || 0;
      }
    }
  });
  
  // Сортируем по количеству заказов (больше заказов - выше)
  const clients = Array.from(clientsMap.values()).sort((a, b) => b.ordersCount - a.ordersCount);
  
  if (clients.length === 0) {
    content.innerHTML = '<div style="text-align:center; color:#999; padding:30px;">Нет клиентов</div>';
    return;
  }
  
  content.innerHTML = clients.map(client => {
    const profit = Math.round(client.totalSum * 0.02);
    return `
    <div style="background:#f9f9f9; padding:12px 15px; border-radius:10px; margin-bottom:10px; border-left:4px solid #ff9800;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
        <div style="font-weight:600; color:#333;">👤 ${client.name}</div>
        <div style="background:#ff9800; color:white; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600;">
          ${client.ordersCount} ${client.ordersCount === 1 ? 'заказ' : client.ordersCount < 5 ? 'заказа' : 'заказов'}
        </div>
      </div>
      <div style="font-size:13px; color:#666; margin-bottom:3px;">📞 <a href="tel:${client.phone}" style="color:#2196f3; text-decoration:none;">${client.phone}</a></div>
      <div style="font-size:13px; color:#666; margin-bottom:5px;">📍 ${client.address}</div>
      <div style="display:flex; justify-content:space-between; font-size:12px; padding-top:5px; border-top:1px dashed #ddd;">
        <span style="color:#666;">💵 Сумма: <strong>${client.totalSum.toLocaleString()}</strong> сом</span>
        <span style="color:#4caf50;">💰 Прибыль: <strong>${profit.toLocaleString()}</strong> сом</span>
      </div>
    </div>
  `;
  }).join('');
}

function closeAgentClientsList() {
  const modal = document.getElementById('agentClientsListModal');
  if (modal) modal.style.display = 'none';
}

// ===== КОНЕЦ СПИСКА КЛИЕНТОВ =====

// ===== ВЫПЛАТЫ АГЕНТАМ =====

// Выплатить агенту
async function payoutToAgent(agentId, agentName, maxAmount) {
  const { value: amount } = await Swal.fire({
    title: '💸 Выплата агенту',
    html: `
      <div style="text-align:left; margin-bottom:15px;">
        <div style="font-size:16px; margin-bottom:10px;"><strong>Агент:</strong> ${agentName}</div>
        <div style="font-size:14px; color:#666;">Доступно к выплате: <strong style="color:#4caf50;">${maxAmount.toLocaleString()} сом</strong></div>
      </div>
    `,
    input: 'number',
    inputLabel: 'Сумма выплаты (сом)',
    inputValue: maxAmount,
    inputAttributes: {
      min: 1,
      max: maxAmount,
      step: 1
    },
    showCancelButton: true,
    confirmButtonText: '💸 Выплатить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#4caf50',
    inputValidator: (value) => {
      if (!value || value <= 0) {
        return 'Введите сумму больше 0';
      }
      if (value > maxAmount) {
        return `Максимальная сумма: ${maxAmount} сом`;
      }
    }
  });
  
  if (!amount) return;
  
  try {
    Swal.fire({
      title: 'Сохранение...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
    
    // Сохраняем выплату в Firebase
    await db.collection('agentPayouts').add({
      agentId: agentId,
      agentName: agentName,
      amount: Number(amount),
      timestamp: Date.now(),
      date: new Date().toLocaleString()
    });
    
    Swal.fire({
      icon: 'success',
      title: 'Выплата сохранена!',
      html: `<div>Агент: <strong>${agentName}</strong></div><div>Сумма: <strong>${Number(amount).toLocaleString()} сом</strong></div>`,
      timer: 2000,
      showConfirmButton: false
    });
    
    // Обновляем список агентов
    loadAgentsManagement();
    
  } catch(e) {
    console.error('Ошибка выплаты:', e);
    Swal.fire('Ошибка', 'Не удалось сохранить выплату', 'error');
  }
}

// Просмотр истории выплат агента
async function viewAgentPayouts(agentId, agentName) {
  try {
    Swal.fire({
      title: 'Загрузка...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
    
    const payoutsSnapshot = await db.collection('agentPayouts')
      .where('agentId', '==', agentId)
      .get();
    
    let payouts = [];
    let totalPaid = 0;
    payoutsSnapshot.forEach(doc => {
      const payout = doc.data();
      payouts.push({ id: doc.id, ...payout });
      totalPaid += payout.amount || 0;
    });
    
    // Сортируем по дате (новые сверху)
    payouts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    if (payouts.length === 0) {
      Swal.fire({
        title: `📜 История выплат: ${agentName}`,
        html: '<div style="padding:20px; color:#999;">Выплат пока не было</div>',
        confirmButtonText: 'Закрыть'
      });
      return;
    }
    
    let html = `
      <div style="text-align:left; max-height:400px; overflow-y:auto;">
        <div style="background:#e8f5e9; padding:10px 15px; border-radius:8px; margin-bottom:15px;">
          <strong>Всего выплачено:</strong> ${totalPaid.toLocaleString()} сом
        </div>
    `;
    
    payouts.forEach(payout => {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #eee;">
          <div>
            <div style="font-weight:600; color:#4caf50;">${payout.amount.toLocaleString()} сом</div>
            <div style="font-size:12px; color:#999;">${payout.date || new Date(payout.timestamp).toLocaleString()}</div>
          </div>
          <button onclick="deletePayout('${payout.id}', '${agentId}', '${agentName}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">🗑️</button>
        </div>
      `;
    });
    
    html += '</div>';
    
    Swal.fire({
      title: `📜 История выплат: ${agentName}`,
      html: html,
      width: 500,
      confirmButtonText: 'Закрыть'
    });
    
  } catch(e) {
    console.error('Ошибка загрузки выплат:', e);
    Swal.fire('Ошибка', 'Не удалось загрузить историю выплат', 'error');
  }
}

// Удалить выплату
async function deletePayout(payoutId, agentId, agentName) {
  const result = await Swal.fire({
    title: 'Удалить выплату?',
    text: 'Сумма вернётся в баланс агента',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    await db.collection('agentPayouts').doc(payoutId).delete();
    
    Swal.fire({
      icon: 'success',
      title: 'Выплата удалена',
      timer: 1500,
      showConfirmButton: false
    });
    
    // Обновляем
    loadAgentsManagement();
    viewAgentPayouts(agentId, agentName);
    
  } catch(e) {
    console.error('Ошибка удаления выплаты:', e);
    Swal.fire('Ошибка', 'Не удалось удалить выплату', 'error');
  }
}

// ===== КОНЕЦ ВЫПЛАТ АГЕНТАМ =====

// ===== КОНЕЦ УПРАВЛЕНИЯ АГЕНТАМИ =====

// ===== КОНЕЦ СИСТЕМЫ АГЕНТОВ =====
