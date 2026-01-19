// ===== PARTNERS ORDERS MODULE =====
// Функции партнёрских заказов

// ==================== ПАРТНЕРСКИЕ ЗАКАЗЫ ====================

// Открытие окна партнерских заказов
function openPartnersOrdersWindow() {
  toggleSideMenu();
  
  setTimeout(() => {
    const partnersWindow = document.getElementById('partnersOrdersWindow');
    partnersWindow.style.display = 'flex';
    lockPageScroll();
    loadPartnersOrders();
  }, 300);
}

// Закрытие окна партнерских заказов
function closePartnersOrdersWindow() {
  const partnersWindow = document.getElementById('partnersOrdersWindow');
  partnersWindow.style.display = 'none';
  unlockPageScroll();
}

// Загрузить заказы от партнеров
async function loadPartnersOrders() {
  const statsDiv = document.getElementById('partnersStats');
  const listDiv = document.getElementById('partnersOrdersList');
  
  statsDiv.innerHTML = '<div style="text-align:center; color:#999;">⏳ Загрузка...</div>';
  listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">⏳ Загрузка...</div>';
  
  try {
    // Получаем все заказы
    const ordersSnapshot = await db.collection('orders').get();
    let allOrders = [];
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      allOrders.push({ id: doc.id, ...data });
    });
    
    // Фильтруем только заказы с партнерами
    let orders = allOrders.filter(order => order.partner || order.referredBy);
    
    if (orders.length === 0) {
      statsDiv.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">📭 Заказов от партнеров пока нет</div>';
      listDiv.innerHTML = '';
      return;
    }
    
    // Фильтр по дате
    const dateFilter = document.getElementById('partnersFilterDate').value;
    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);
    
    orders = orders.filter(order => {
      const orderTime = order.timestamp || 0;
      switch(dateFilter) {
        case 'today': return orderTime >= today;
        case 'week': return orderTime >= (today - 7 * 86400000);
        case 'month': return orderTime >= (today - 30 * 86400000);
        case 'all': return true;
        default: return true;
      }
    });
    
    // Собираем статистику по партнерам
    const partnersMap = new Map();
    orders.forEach(order => {
      const partnerName = order.partner || order.referredBy || 'Неизвестный';
      
      if (!partnersMap.has(partnerName)) {
        partnersMap.set(partnerName, {
          name: partnerName,
          ordersCount: 0,
          totalAmount: 0,
          clients: new Set()
        });
      }
      
      const partner = partnersMap.get(partnerName);
      partner.ordersCount++;
      partner.totalAmount += order.total || 0;
      partner.clients.add(order.phone || order.name);
    });
    
    // Заполняем фильтр партнеров
    const partnerFilter = document.getElementById('partnersFilterPartner');
    partnerFilter.innerHTML = '<option value="all">Все партнеры</option>';
    Array.from(partnersMap.keys()).sort().forEach(partner => {
      partnerFilter.innerHTML += `<option value="${partner}">${partner}</option>`;
    });
    
    // Отображаем статистику
    let statsHTML = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:15px;">';
    
    Array.from(partnersMap.values()).sort((a, b) => b.totalAmount - a.totalAmount).forEach(partner => {
      statsHTML += `
        <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; padding:20px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
          <div style="font-size:18px; font-weight:700; margin-bottom:10px;">🤝 ${partner.name}</div>
          <div style=" opacity:0.9;">
            <div style="margin:5px 0;">📦 Заказов: <strong>${partner.ordersCount}</strong></div>
            <div style="margin:5px 0;">👥 Клиентов: <strong>${partner.clients.size}</strong></div>
            <div style="margin:5px 0;">💰 Сумма: <strong>${partner.totalAmount.toFixed(0)} сом</strong></div>
          </div>
        </div>
      `;
    });
    
    statsHTML += '</div>';
    statsDiv.innerHTML = statsHTML;
    
    // Фильтр по конкретному партнеру
    const selectedPartner = partnerFilter.value;
    if (selectedPartner !== 'all') {
      orders = orders.filter(order => (order.partner || order.referredBy) === selectedPartner);
    }
    
    // Отображаем список заказов
    if (orders.length === 0) {
      listDiv.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">📭 Нет заказов по выбранным фильтрам</div>';
      return;
    }
    
    // Сортируем по дате (новые первые)
    orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let ordersHTML = '';
    orders.forEach((order, index) => {
      const date = new Date(order.timestamp);
      const dateStr = date.toLocaleDateString('ru-RU');
      const partnerName = order.partner || order.referredBy || 'Неизвестный';
      
      ordersHTML += `
        <div style="background:white; border:2px solid #e0e0e0; border-radius:12px; padding:20px; margin-bottom:15px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
            <div>
              <div style="font-size:16px; font-weight:700; color:#333; margin-bottom:5px;">
                📦 Заказ #${index + 1}
              </div>
              <div style=" color:#666;">
                👤 <strong>${order.name || 'Без имени'}</strong> ${order.phone ? '(' + order.phone + ')' : ''}
              </div>
              <div style="font-size:13px; color:#888; margin-top:3px;">
                📅 ${dateStr} • 🕐 ${order.time || ''}
              </div>
              <div style="font-size:13px; margin-top:5px;">
                <span style="background:linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color:white; padding:6px 12px; border-radius:8px; font-weight:600;">🤝 ${partnerName}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:20px; font-weight:700; color:#28a745;">
                ${order.total || 0} сом
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    listDiv.innerHTML = ordersHTML;
    
  } catch (error) {
    console.error('Ошибка загрузки партнерских заказов:', error);
    statsDiv.innerHTML = '<div style="text-align:center; color:#dc3545; padding:20px;">❌ Ошибка загрузки</div>';
    listDiv.innerHTML = '';
  }
}

// Экспорт партнерских заказов в Excel
async function exportPartnersToExcel() {
  Swal.fire({
    title: 'Экспорт',
    text: 'Функция экспорта в Excel будет добавлена позже',
    icon: 'info'
  });
}
