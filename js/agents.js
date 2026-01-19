// ===== СИСТЕМА АГЕНТОВ (2% комиссия) =====

// Текущий агент (хранится в localStorage)
let currentAgent = null;

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
  currentAgent = null;
  localStorage.removeItem('currentAgent');
  updateAgentButton();
  closeAgentProfitModal();
  Swal.fire('Выход', 'Вы вышли из аккаунта агента', 'info');
}

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
  
  // Загружаем заказы
  await loadAgentOrders();
}

// Закрытие окна прибыли
function closeAgentProfitModal() {
  document.getElementById('agentProfitModal').style.display = 'none';
  unlockPageScroll();
}

// Загрузка заказов агента
async function loadAgentOrders() {
  if (!currentAgent) return;
  
  const listEl = document.getElementById('agentOrdersList');
  listEl.innerHTML = '<div style="text-align:center; color:#999; padding:30px;">Загрузка заказов...</div>';
  
  try {
    // Ищем заказы где partner равен ID агента (без orderBy чтобы не требовать индекс)
    const snapshot = await db.collection('orders')
      .where('partner', '==', currentAgent.id)
      .limit(100)
      .get();
    
    if (snapshot.empty) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:40px; color:#666;">
          <div style="font-size:48px; margin-bottom:15px;">📭</div>
          <div style="font-size:16px;">Пока нет заказов от ваших клиентов</div>
          <div style="font-size:14px; color:#999; margin-top:10px;">Поделитесь своей ссылкой, чтобы привлечь клиентов!</div>
        </div>
      `;
      document.getElementById('agentTotalOrders').textContent = '0';
      document.getElementById('agentTotalSum').textContent = '0 сом';
      document.getElementById('agentTotalProfit').textContent = '0 сом';
      return;
    }
    
    // Сортируем на клиенте по timestamp (новые сверху)
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let totalSum = 0;
    let totalOrders = 0;
    let html = '';
    
    orders.forEach(order => {
      totalOrders++;
      totalSum += order.total || 0;
      
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
      
      // Формируем список товаров
      let itemsHtml = '';
      if (order.items && order.items.length > 0) {
        itemsHtml = '<div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;">';
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
      
      html += `
        <div style="background:#f8f9fa; border-radius:12px; padding:15px; border-left:4px solid ${statusColor};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div>
              <div style="font-weight:600; color:#333;">${order.name || 'Клиент'}</div>
              <div style="font-size:13px; color:#666;">📱 ${order.phone || ''}</div>
              <div style="font-size:12px; color:#888;">📍 ${order.address || ''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px; color:#999;">${date}</div>
              <div style="font-size:12px; padding:3px 8px; background:${statusColor}; color:white; border-radius:10px; display:inline-block;">${order.status || 'Новый'}</div>
            </div>
          </div>
          ${itemsHtml}
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; margin-top:10px; border-top:1px solid #e0e0e0; flex-wrap:wrap; gap:10px;">
            <div>
              <span style="color:#666;">Сумма заказа:</span>
              <span style="font-weight:600; color:#333;">${(order.total || 0).toLocaleString()} сом</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="background:#e8f5e9; padding:5px 12px; border-radius:8px;">
                <span style="color:#388e3c; font-weight:700;">+${profit.toLocaleString()} сом</span>
              </div>
              <button onclick="removeClientFromAgent('${order.phone}', '${(order.name || '').replace(/'/g, "\\'")}', '${order.id}')" style="padding:5px 10px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">
                ❌ Отвязать
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    const totalProfit = Math.round(totalSum * 0.02);
    
    document.getElementById('agentTotalOrders').textContent = totalOrders;
    document.getElementById('agentTotalSum').textContent = totalSum.toLocaleString() + ' сом';
    document.getElementById('agentTotalProfit').textContent = totalProfit.toLocaleString() + ' сом';
    
    listEl.innerHTML = html;
    
  } catch(e) {
    console.error('Ошибка загрузки заказов агента:', e);
    listEl.innerHTML = `
      <div style="text-align:center; padding:30px; color:#dc3545;">
        <div>Ошибка загрузки заказов</div>
        <div style="font-size:12px; margin-top:5px;">${e.message}</div>
      </div>
    `;
  }
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
    
    // Получаем статистику заказов ТОЛЬКО для зарегистрированных агентов
    const ordersSnapshot = await db.collection('orders').get();
    const ordersByAgent = {};
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      // Проверяем что partner - это ID существующего агента
      if (order.partner && agentIds.has(order.partner)) {
        if (!ordersByAgent[order.partner]) {
          ordersByAgent[order.partner] = { count: 0, total: 0 };
        }
        ordersByAgent[order.partner].count++;
        ordersByAgent[order.partner].total += order.total || 0;
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
    
    agents.forEach(agent => {
      const stats = ordersByAgent[agent.id] || { count: 0, total: 0 };
      const commission = Math.round(stats.total * 0.02);
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
            
            <div style="display:flex; gap:15px; align-items:center; flex-wrap:wrap;">
              <div style="text-align:center; padding:8px 15px; background:white; border-radius:8px;">
                <div style="font-size:11px; color:#666;">Заказов</div>
                <div style="font-size:18px; font-weight:700; color:#2196f3;">${stats.count}</div>
              </div>
              <div style="text-align:center; padding:8px 15px; background:white; border-radius:8px;">
                <div style="font-size:11px; color:#666;">Сумма</div>
                <div style="font-size:18px; font-weight:700; color:#333;">${stats.total.toLocaleString()}</div>
              </div>
              <div style="text-align:center; padding:8px 15px; background:#e8f5e9; border-radius:8px;">
                <div style="font-size:11px; color:#666;">Комиссия</div>
                <div style="font-size:18px; font-weight:700; color:#4caf50;">${commission.toLocaleString()}</div>
              </div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px;">
              <button onclick="viewAgentOrders('${agent.id}', '${(agent.name || '').replace(/'/g, "\\'")}')" style="padding:8px 15px; background:#2196f3; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                📋 Заказы
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
    
    if (snapshot.empty) {
      Swal.fire('Заказы агента', `У агента "${agentName}" пока нет заказов`, 'info');
      return;
    }
    
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
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
      
      // Если у заказа есть агент - запоминаем
      if (order.partner && allAgentsForAssign.find(a => a.id === order.partner)) {
        clientsMap[phone].partner = order.partner;
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
    const currentAgent = allAgentsForAssign.find(a => a.id === client.partner);
    const agentName = currentAgent ? currentAgent.name : 'Не назначен';
    const agentColor = currentAgent ? '#4caf50' : '#999';
    
    html += `
      <div style="background:#f8f9fa; border-radius:10px; padding:15px; border-left:4px solid ${currentAgent ? '#4caf50' : '#ff9800'};">
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
              ${agentOptions.replace(`value="${client.partner || ''}"`, `value="${client.partner || ''}" selected`)}
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
  
  const agentName = agentId ? allAgentsForAssign.find(a => a.id === agentId)?.name : 'без агента';
  
  try {
    // Обновляем все заказы клиента
    const batch = db.batch();
    
    for (const orderId of client.orderIds) {
      const orderRef = db.collection('orders').doc(orderId);
      if (agentId) {
        batch.update(orderRef, { partner: agentId });
      } else {
        batch.update(orderRef, { partner: firebase.firestore.FieldValue.delete() });
      }
    }
    
    await batch.commit();
    
    // Обновляем локальные данные
    client.partner = agentId || null;
    renderClientsForAgents();
    
    Swal.fire({
      icon: 'success',
      title: 'Готово!',
      text: `Клиент "${client.name}" назначен ${agentName ? 'агенту: ' + agentName : 'без агента'}. Обновлено ${client.orderIds.length} заказов.`,
      timer: 2000,
      showConfirmButton: false
    });
    
  } catch(e) {
    console.error('Ошибка назначения агента:', e);
    Swal.fire('Ошибка', 'Не удалось назначить агента', 'error');
  }
}

// ===== КОНЕЦ НАЗНАЧЕНИЯ КЛИЕНТОВ =====

// ===== КОНЕЦ УПРАВЛЕНИЯ АГЕНТАМИ =====

// ===== КОНЕЦ СИСТЕМЫ АГЕНТОВ =====
