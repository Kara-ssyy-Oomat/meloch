// ==================== ОТЧЕТ ПО ПРИБЫЛИ ====================

function normalizeEpochMs(value, fallbackMs = Date.now()) {
  if (value === undefined || value === null || value === '') return fallbackMs;

  let ms = null;

  if (typeof value === 'number') {
    ms = value;
  } else if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) {
      ms = asNum;
    } else {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) ms = parsed;
    }
  } else if (typeof value === 'object') {
    try {
      if (typeof value.toMillis === 'function') {
        ms = value.toMillis();
      } else if (typeof value.toDate === 'function') {
        ms = value.toDate().getTime();
      } else if (typeof value.seconds === 'number') {
        ms = value.seconds * 1000;
      }
    } catch (e) {
      ms = null;
    }
  }

  if (!Number.isFinite(ms)) return fallbackMs;

  // Если пришли секунды, конвертируем в миллисекунды
  if (ms > 0 && ms < 100_000_000_000) {
    ms = ms * 1000;
  }

  // Отсекаем «космические» будущие даты (обычно это кривые данные)
  const now = Date.now();
  const maxFuture = now + 1000 * 60 * 60 * 24 * 365 * 5; // +5 лет
  if (ms > maxFuture) return fallbackMs;

  return ms;
}

// Открыть окно отчета по прибыли
let profitReportOrdersListener = null;
let profitReportExpensesListener = null;
let profitReportAutoRefresh = null;
let currentProfitTab = 'products'; // Отслеживаем текущую вкладку

async function openProfitReport() {
  console.log('📈 Открываем отчёт по прибыли...');
  
  // Показываем окно
  document.getElementById('profitReportWindow').style.display = 'block';
  lockPageScroll();
  
  // Закрываем меню
  toggleSideMenu();
  
  // Скрываем вкладку "Расходы" для корейского менеджера и менеджера бытовых техник
  const expensesTab = document.getElementById('tabExpenses');
  if (expensesTab) {
    expensesTab.style.display = (userRole === 'korean' || userRole === 'appliances') ? 'none' : 'block';
  }
  
  // Загружаем товары заново из Firebase
  console.log('⬇️ Загрузка товаров из Firebase...');
  try {
    const snapshot = await db.collection('products').get();
    products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });
    console.log('✅ Загружено товаров:', products.length);
    if (products.length > 0) {
      console.log('📦 Первый товар:', products[0]);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки товаров:', error);
  }
  
  // Сбрасываем на вкладку "По товарам" и загружаем данные
  switchProfitTab('products');
  loadProfitReport();
  
  // Отписываемся от предыдущих слушателей
  if (profitReportOrdersListener) profitReportOrdersListener();
  if (profitReportExpensesListener) profitReportExpensesListener();
  if (profitReportAutoRefresh) clearInterval(profitReportAutoRefresh);
  
  // Слушатель заказов
  profitReportOrdersListener = db.collection('orders').onSnapshot(() => {
    console.log('🔔 Заказы изменились');
    if (currentProfitTab === 'expenses') {
      loadExpensesReport();
    } else if (currentProfitTab === 'orders') {
      loadOrderProfitReport();
    }
  });
  
  // Слушатель расходов
  profitReportExpensesListener = db.collection('expenses').onSnapshot(() => {
    console.log('💸 Расходы изменились');
    if (currentProfitTab === 'expenses') {
      loadExpensesReport();
    }
  });
  
  // Автообновление каждые 3 секунды для вкладки расходов
  profitReportAutoRefresh = setInterval(() => {
    if (currentProfitTab === 'expenses') {
      loadExpensesReport();
    }
  }, 3000);
}

// Закрыть окно отчета
function closeProfitReport() {
  document.getElementById('profitReportWindow').style.display = 'none';
  unlockPageScroll();
  
  // Отписываемся от слушателей при закрытии окна
  if (profitReportOrdersListener) {
    profitReportOrdersListener();
    profitReportOrdersListener = null;
  }
  if (profitReportExpensesListener) {
    profitReportExpensesListener();
    profitReportExpensesListener = null;
  }
  if (profitReportAutoRefresh) {
    clearInterval(profitReportAutoRefresh);
    profitReportAutoRefresh = null;
  }
}

// Загрузить данные отчета
function loadProfitReport() {
  console.log('📊 loadProfitReport вызвана, products.length =', products ? products.length : 0);
  
  // Показываем все товары
  let productsWithCost = [...products];
  
  // Корейский менеджер видит только корейские товары, часы и электронику
  if (userRole === 'korean') {
    productsWithCost = productsWithCost.filter(p => p.category && (p.category.toLowerCase() === 'корейские' || p.category.toLowerCase() === 'часы' || p.category.toLowerCase() === 'электроника'));
  }
  
  // Менеджер бытовых техник видит только бытовые техники
  if (userRole === 'appliances') {
    productsWithCost = productsWithCost.filter(p => p.category && p.category.toLowerCase() === 'бытовые');
  }
  
  console.log('📊 Товаров для отчёта:', productsWithCost.length);
  
  // Вычисляем общую прибыль и среднюю наценку
  let totalProfit = 0;
  let totalMarkup = 0;
  let count = 0;
  
  productsWithCost.forEach(p => {
    const salePrice = parseFloat(p.price) || 0;
    const costPrice = parseFloat(p.costPrice) || 0;
    if (costPrice > 0 && salePrice > 0) {
      const profit = salePrice - costPrice;
      const markup = (profit / costPrice) * 100;
      totalProfit += profit;
      totalMarkup += markup;
      count++;
    }
  });
  
  const avgMarkup = count > 0 ? (totalMarkup / count).toFixed(1) : 0;
  
  // Обновляем сводку
  document.getElementById('totalProfit').textContent = totalProfit.toFixed(2) + ' сом';
  document.getElementById('avgMarkup').textContent = avgMarkup + '%';
  document.getElementById('totalProducts').textContent = productsWithCost.length;
  
  // Отображаем таблицу
  filterProfitReport();
}

// Фильтрация и сортировка отчета
function filterProfitReport() {
  const category = document.getElementById('profitCategoryFilter').value;
  const sortBy = document.getElementById('profitSortFilter').value;

  // Показываем все товары
  let filtered = [...products];
  console.log('🔍 filterProfitReport: всего товаров:', filtered.length);
  
  // Корейский менеджер видит только корейские товары, часы и электронику
  if (userRole === 'korean') {
    filtered = filtered.filter(p => p.category && (p.category.toLowerCase() === 'корейские' || p.category.toLowerCase() === 'часы' || p.category.toLowerCase() === 'электроника'));
  }
  
  // Менеджер бытовых техник видит только бытовые техники
  if (userRole === 'appliances') {
    filtered = filtered.filter(p => p.category && p.category.toLowerCase() === 'бытовые');
  }
  
  // Фильтр по категории
  if (category) {
    filtered = filtered.filter(p => (p.category || 'все').toLowerCase() === category.toLowerCase());
  }
  
  // Сортировка
  filtered.sort((a, b) => {
    const saleA = parseFloat(a.price) || 0;
    const costA = parseFloat(a.costPrice) || 0;
    const saleB = parseFloat(b.price) || 0;
    const costB = parseFloat(b.costPrice) || 0;
    const profitA = saleA - costA;
    const profitB = saleB - costB;
    const markupA = costA > 0 ? ((profitA / costA) * 100) : 0;
    const markupB = costB > 0 ? ((profitB / costB) * 100) : 0;
    
    switch(sortBy) {
      case 'profit-desc': return profitB - profitA;
      case 'profit-asc': return profitA - profitB;
      case 'markup-desc': return markupB - markupA;
      case 'markup-asc': return markupA - markupB;
      case 'name': return (a.title || '').localeCompare(b.title || '');
      default: return profitB - profitA;
    }
  });
  
  // Отображаем в таблице
  const tbody = document.getElementById('profitReportBody');
  tbody.innerHTML = '';
  
  filtered.forEach((p, index) => {
    const salePrice = parseFloat(p.price) || 0;
    const costPrice = parseFloat(p.costPrice) || 0;
    const profit = salePrice - costPrice;
    const markup = costPrice > 0 ? ((profit / costPrice) * 100).toFixed(1) : '—';
    const profitColor = profit > 0 ? '#28a745' : profit < 0 ? '#dc3545' : '#ffc107';
    const productName = p.title || p.name || 'Без названия';
    
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid #e0e0e0';
    row.innerHTML = `
      <td data-label="#" style="padding:12px;  color:#666;">${index + 1}</td>
      <td data-label="Товар" class="product-name-cell">${productName}</td>
      <td data-label="Категория" style="padding:12px; font-size:13px; text-align:center; color:#666;">${p.category || 'все'}</td>
      <td data-label="Закупка" style="padding:12px;  text-align:right; color:#666;">${costPrice.toFixed(2)} сом</td>
      <td data-label="Продажа" style="padding:12px;  text-align:right; font-weight:600;">${salePrice.toFixed(2)} сом</td>
      <td data-label="Прибыль" style="padding:12px;  text-align:right; font-weight:700; color:${profitColor};">${profit > 0 ? '+' : ''}${profit.toFixed(2)} сом</td>
      <td data-label="Наценка %" style="padding:12px;  text-align:right; font-weight:700; color:${profitColor};">${markup}%</td>
    `;
    tbody.appendChild(row);
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:30px; text-align:center; color:#999;">Нет данных для отображения</td></tr>';
  }
}

// Экспорт в Excel
async function exportProfitToExcel() {
  const category = document.getElementById('profitCategoryFilter').value;

  let filtered = [...products];
  
  // Корейский менеджер видит только корейские товары, часы и электронику
  if (userRole === 'korean') {
    filtered = filtered.filter(p => p.category && (p.category.toLowerCase() === 'корейские' || p.category.toLowerCase() === 'часы' || p.category.toLowerCase() === 'электроника'));
  }
  
  // Менеджер бытовых техник видит только бытовые техники
  if (userRole === 'appliances') {
    filtered = filtered.filter(p => p.category && p.category.toLowerCase() === 'бытовые');
  }
  
  if (category) {
    filtered = filtered.filter(p => (p.category || 'все').toLowerCase() === category.toLowerCase());
  }
  
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['№', 'Товар', 'Категория', 'Цена закупки', 'Цена продажи', 'Прибыль', 'Наценка %']
  ];
  
  filtered.forEach((p, index) => {
    const salePrice = toFiniteNumber(p.price, 0);
    const costPrice = toFiniteNumber(p.costPrice, 0);
    const profit = costPrice > 0 ? (salePrice - costPrice) : 0;
    const markup = costPrice > 0 ? ((profit / costPrice) * 100).toFixed(1) : '';
    wsData.push([
      index + 1,
      getTitle(p),
      p.category || 'все',
      Number.isFinite(costPrice) ? costPrice : '',
      Number.isFinite(salePrice) ? salePrice : '',
      profit.toFixed(2),
      markup
    ]);
  });
  
  // Добавляем итоги
  const totalProfit = filtered.reduce((sum, p) => sum + (p.price - p.costPrice), 0);
  const avgMarkup = filtered.length > 0 
    ? (filtered.reduce((sum, p) => sum + ((p.price - p.costPrice) / p.costPrice * 100), 0) / filtered.length).toFixed(1)
    : 0;
  
  wsData.push([]);
  wsData.push(['', '', '', '', 'ИТОГО:', totalProfit.toFixed(2), avgMarkup + '%']);
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Отчет по прибыли');
  XLSX.writeFile(wb, `Отчет_по_прибыли_${new Date().toLocaleDateString()}.xlsx`);
  
  Swal.fire('Готово!', 'Отчет экспортирован в Excel', 'success');
}

// Переключение вкладок в отчете
function switchProfitTab(tab) {
  currentProfitTab = tab; // Сохраняем текущую вкладку
  console.log('🔄 Переключение на вкладку:', tab);
  
  const tabProducts = document.getElementById('tabProducts');
  const tabOrders = document.getElementById('tabOrders');
  const tabExpenses = document.getElementById('tabExpenses');
  const productsPanel = document.getElementById('profitProductsPanel');
  const ordersPanel = document.getElementById('profitOrdersPanel');
  const expensesPanel = document.getElementById('profitExpensesPanel');
  const productsTable = document.getElementById('profitProductsTable');
  const ordersTable = document.getElementById('profitOrdersTable');
  const expensesTable = document.getElementById('profitExpensesTable');
  
  // Сброс стилей всех кнопок
  [tabProducts, tabOrders, tabExpenses].forEach(btn => {
    btn.style.background = '#e9ecef';
    btn.style.color = '#333';
    btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
  });
  
  // Скрыть все панели и таблицы
  productsPanel.style.display = 'none';
  ordersPanel.style.display = 'none';
  expensesPanel.style.display = 'none';
  productsTable.style.display = 'none';
  ordersTable.style.display = 'none';
  expensesTable.style.display = 'none';
  
  if (tab === 'products') {
    tabProducts.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
    tabProducts.style.color = 'white';
    tabProducts.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    productsPanel.style.display = 'block';
    productsTable.style.display = 'block';
  } else if (tab === 'orders') {
    tabOrders.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
    tabOrders.style.color = 'white';
    tabOrders.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    ordersPanel.style.display = 'block';
    ordersTable.style.display = 'block';
    loadOrderProfitReport();
  } else if (tab === 'expenses') {
    tabExpenses.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
    tabExpenses.style.color = 'white';
    tabExpenses.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    expensesPanel.style.display = 'block';
    expensesTable.style.display = 'block';
    loadExpensesReport();
  }
}

// Загрузить отчет по заказам
async function loadOrderProfitReport() {
  console.log('🔵 loadOrderProfitReport ВЫЗВАНА');
  try {
    const ordersSnapshot = await db.collection('orders').get();
    const orders = [];
    
    console.log('📦 Загружено заказов из Firebase:', ordersSnapshot.size);
    
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      orders.push({
        id: doc.id,
        ...data,
        timestamp: normalizeEpochMs(data.timestamp, Date.now())
      });
    });
    
    console.log('📋 Заказы после обработки:', orders.length);
    
    await filterOrderProfitReport(orders);
  } catch (error) {
    console.error('❌ Ошибка загрузки заказов:', error);
    Swal.fire('Ошибка', 'Не удалось загрузить заказы', 'error');
  }
}

// Фильтрация отчета по заказам
async function filterOrderProfitReport(ordersData = null) {
  console.log('🟢 filterOrderProfitReport ВЫЗВАНА, получено заказов:', ordersData ? ordersData.length : 'null');
  
  const dateFilter = document.getElementById('orderDateFilter').value;
  const sortBy = document.getElementById('orderSortFilter').value;
  
  console.log('🔍 Фильтры:', { dateFilter, sortBy });
  
  // Если данные не переданы, загружаем заново
  if (!ordersData) {
    console.log('⚠️ Данные не переданы, вызываю loadOrderProfitReport');
    loadOrderProfitReport();
    return;
  }
  
  // Загружаем все товары с себестоимостью из Firebase
  let productsMap = new Map();
  try {
    const productsSnapshot = await db.collection('products').get();
    console.log('🛍️ Загружено товаров из Firebase:', productsSnapshot.size);
    
    productsSnapshot.forEach(doc => {
      const data = doc.data();
      productsMap.set(doc.id, {
        name: data.name || 'Неизвестный товар',
        costPrice: data.costPrice || 0,
        salePrice: data.price || 0,
        category: data.category || 'все'
      });
    });
    
    console.log('💰 Товаров в карте:', productsMap.size);
  } catch (error) {
    console.error('❌ Ошибка загрузки товаров:', error);
  }
  
  // Фильтр по дате
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;
  const monthStart = todayStart - 30 * 86400000;
  
  let filtered = ordersData.filter(order => {
    const orderTime = order.timestamp;
    switch(dateFilter) {
      case 'today': return orderTime >= todayStart;
      case 'yesterday': return orderTime >= yesterdayStart && orderTime < todayStart;
      case 'week': return orderTime >= weekStart;
      case 'month': return orderTime >= monthStart;
      case 'all': return true;
      default: return true;
    }
  });
  
  // Рассчитываем прибыль для каждого заказа
  const ordersWithProfit = filtered.map(order => {
    let totalCost = 0;
    let totalSale = 0;
    let totalProfit = 0;
    const items = order.items || [];
    let hasKoreanProducts = false;
    let hasAppliancesProducts = false;
    
    console.log('=== ЗАКАЗ ===', {
      name: order.name,
      phone: order.phone,
      timestamp: new Date(order.timestamp).toLocaleString()
    });
    
    items.forEach(item => {
      const productData = productsMap.get(item.id);
      
      // Проверяем категорию товара
      const isKoreanProduct = productData && productData.category && (productData.category.toLowerCase() === 'корейские' || productData.category.toLowerCase() === 'часы' || productData.category.toLowerCase() === 'электроника');
      const isAppliancesProduct = productData && productData.category && productData.category.toLowerCase() === 'бытовые';
      
      if (isKoreanProduct) {
        hasKoreanProducts = true;
      }
      
      if (isAppliancesProduct) {
        hasAppliancesProducts = true;
      }
      
      // Для корейского менеджера считаем ТОЛЬКО корейские товары, часы и электронику
      if (userRole === 'korean' && !isKoreanProduct) {
        return;
      }
      
      // Для менеджера бытовых техник считаем ТОЛЬКО бытовые техники
      if (userRole === 'appliances' && !isAppliancesProduct) {
        return;
      }
      
      // Используем себестоимость из заказа, если она есть, иначе из базы товаров
      const costPrice = item.costPrice || (productData ? productData.costPrice : 0);
      const itemCost = costPrice * item.qty;
      const itemSale = item.price * item.qty;
      const itemProfit = costPrice > 0 ? (itemSale - itemCost) : 0;
      
      console.log('📦 Товар:', item.title || (productData ? productData.name : 'Неизвестный товар'), {
        'ID товара': item.id,
        'Название': item.title,
        'Категория': productData ? productData.category : 'нет',
        'Корейский?': isKoreanProduct ? 'ДА' : 'НЕТ',
        'Количество': item.qty,
        'Цена в заказе (за шт)': item.price,
        'Себестоимость из заказа': item.costPrice,
        'Себестоимость из базы': productData ? productData.costPrice : 0,
        'Используется себестоимость': costPrice,
        '---': '---',
        'Сумма продажи': itemSale,
        'Сумма себестоимости': itemCost,
        'ПРИБЫЛЬ': itemProfit,
        '---2': '---',
        'Расчет': `(${item.price} × ${item.qty}) - (${costPrice} × ${item.qty}) = ${itemSale} - ${itemCost} = ${itemProfit}`
      });
      
      totalCost += costPrice * item.qty;
      totalSale += item.price * item.qty;
      totalProfit += itemProfit;
    });
    
    console.log('ИТОГО ЗАКАЗ:', {
      себестоимость: totalCost,
      продажа: totalSale,
      прибыль: totalProfit
    });
    console.log('---');
    
    return {
      ...order,
      totalCost,
      totalSale,
      profit: totalProfit,
      itemsCount: items.reduce((sum, item) => sum + item.qty, 0),
      hasKoreanProducts,
      hasAppliancesProducts
    };
  });
  
  // Фильтруем заказы для корейского менеджера
  let finalOrders = ordersWithProfit;
  if (userRole === 'korean') {
    finalOrders = ordersWithProfit.filter(order => order.hasKoreanProducts);
  }
  
  // Фильтруем заказы для менеджера бытовых техник
  if (userRole === 'appliances') {
    finalOrders = ordersWithProfit.filter(order => order.hasAppliancesProducts);
  }
  
  // Сортировка
  finalOrders.sort((a, b) => {
    switch(sortBy) {
      case 'profit-desc': return b.profit - a.profit;
      case 'date-desc': return b.timestamp - a.timestamp;
      case 'date-asc': return a.timestamp - b.timestamp;
      default: return b.profit - a.profit;
    }
  });
  
  // Обновляем сводку
  const totalProfit = finalOrders.reduce((sum, o) => sum + o.profit, 0);
  const uniqueClients = new Set(finalOrders.map(o => o.phone || o.name)).size;
  
  document.getElementById('totalOrderProfit').textContent = totalProfit.toFixed(2) + ' сом';
  document.getElementById('totalOrdersCount').textContent = finalOrders.length;
  document.getElementById('totalClientsCount').textContent = uniqueClients;
  
  // Отображаем в таблице
  const tbody = document.getElementById('orderProfitReportBody');
  tbody.innerHTML = '';
  
  // Группировка по клиентам
  const clientMap = new Map();
  finalOrders.forEach(order => {
    const clientKey = order.phone || order.name || 'Неизвестный';
    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, {
        name: order.name || 'Неизвестный',
        phone: order.phone || '',
        orders: [],
        totalProfit: 0,
        totalSale: 0,
        totalCost: 0
      });
    }
    const client = clientMap.get(clientKey);
    client.orders.push(order);
    client.totalProfit += order.profit;
    client.totalSale += order.totalSale;
    client.totalCost += order.totalCost;
  });
  
  // Сортируем клиентов по прибыли
  const clients = Array.from(clientMap.values()).sort((a, b) => b.totalProfit - a.totalProfit);
  
  let rowIndex = 0;
  clients.forEach(client => {
    // Сортируем заказы клиента от нового к старому
    client.orders.sort((a, b) => b.timestamp - a.timestamp);
    
    // Строка клиента (группировочная)
    const clientRow = document.createElement('tr');
    clientRow.style.background = '#f0f8ff';
    clientRow.style.borderBottom = '2px solid #007bff';
    clientRow.style.fontWeight = '600';
    clientRow.style.cursor = 'pointer';
    
    clientRow.innerHTML = `
      <td data-label="Клиент" style="padding:12px; " colspan="7">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="cursor:pointer; transition: transform 0.3s; display:inline-block;">▶</span>
          <span>👤 ${client.name}</span>
          ${client.phone ? '<span style="color:#666;">(' + client.phone + ')</span>' : ''}
          <span style="color:#666;">${client.orders.length} заказов</span>
          <span style="color:#28a745; font-weight:700; margin-left:auto;">+${client.totalProfit.toFixed(2)} сом</span>
        </div>
      </td>
    `;
    
    clientRow.addEventListener('click', () => openClientOrdersDetail(client));
    tbody.appendChild(clientRow);
    
    rowIndex++;
  });
  
  if (clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:30px; text-align:center; color:#999;">Нет заказов за выбранный период</td></tr>';
  }
}

// Показать/скрыть заказы клиента
function toggleClientOrders(clientClass) {
  const rows = document.querySelectorAll('.' + clientClass);
  if (rows.length === 0) return;
  
  const isHidden = rows[0].style.display === 'none';
  
  rows.forEach(row => {
    row.style.display = isHidden ? 'table-row' : 'none';
  });
  
  // Поворачиваем стрелочку
  const arrowId = 'arrow-' + clientClass.replace('client-', '');
  const arrow = document.getElementById(arrowId);
  if (arrow) {
    arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
  }
  
  // Если раскрываем заказы, прокручиваем к последнему товару
  if (isHidden && rows.length > 0) {
    setTimeout(() => {
      const lastRow = rows[rows.length - 1];
      lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }
}

// Открыть модальное окно с детальной информацией о заказах клиента
function openClientOrdersDetail(clientData) {
  const modal = document.getElementById('clientOrdersDetailModal');
  modal.style.display = 'flex';
  lockPageScroll();
  
  // Устанавливаем заголовок
  document.getElementById('clientDetailName').textContent = `👤 ${clientData.name}`;
  document.getElementById('clientDetailInfo').textContent = clientData.phone ? `📱 ${clientData.phone}` : 'Телефон не указан';
  
  // Устанавливаем сводку
  document.getElementById('clientDetailTotalOrders').textContent = clientData.orders.length;
  document.getElementById('clientDetailTotalSale').textContent = clientData.totalSale.toFixed(2) + ' сом';
  document.getElementById('clientDetailTotalProfit').textContent = '+' + clientData.totalProfit.toFixed(2) + ' сом';
  
  // Загружаем список заказов
  const listDiv = document.getElementById('clientOrdersDetailList');
  listDiv.innerHTML = '';
  
  clientData.orders.forEach((order, orderIdx) => {
    const orderCard = document.createElement('div');
    orderCard.style.cssText = 'background:white; border:1px solid #e0e0e0; border-radius:10px; padding:15px; margin-bottom:15px; box-shadow:0 2px 4px rgba(0,0,0,0.05);';
    
    const date = new Date(order.timestamp);
    const dateStr = date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
    const profitColor = order.profit > 0 ? '#28a745' : order.profit < 0 ? '#dc3545' : '#ffc107';
    
    let itemsHTML = '';
    const items = order.items || [];
    let displayedItemIdx = 0;
    items.forEach((item, itemIdx) => {
      // Проверяем категорию товара для корейского менеджера
      if (userRole === 'korean') {
        const product = products.find(p => p.id === item.id);
        const isKoreanProduct = product && product.category && (product.category.toLowerCase() === 'корейские' || product.category.toLowerCase() === 'часы' || product.category.toLowerCase() === 'электроника');
        if (!isKoreanProduct) {
          return;
        }
      }
      
      // Проверяем категорию товара для менеджера бытовых техник
      if (userRole === 'appliances') {
        const product = products.find(p => p.id === item.id);
        const isAppliancesProduct = product && product.category && product.category.toLowerCase() === 'бытовые';
        if (!isAppliancesProduct) {
          return;
        }
      }
      
      displayedItemIdx++;
      
      // Ищем товар в базе для получения актуальной себестоимости
      const product = products.find(p => p.id === item.id);
      
      const itemSale = item.price * item.qty;
      const costPrice = item.costPrice || (product && product.costPrice) || 0;
      const itemCost = costPrice * item.qty;
      const itemProfit = costPrice > 0 ? (itemSale - itemCost) : 0;
      const itemProfitColor = itemProfit > 0 ? '#28a745' : itemProfit < 0 ? '#dc3545' : '#999';
      const unitLbl = (product && product.isPack) ? 'пачка' : 'шт';
      
      itemsHTML += `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px; font-size:13px;">${displayedItemIdx}</td>
          <td style="padding:8px; font-size:13px; font-weight:600;">${item.title || 'Товар'}${(product && product.isPack) ? ' <span style="background:#9c27b0;color:white;padding:1px 4px;border-radius:3px;font-size:10px;">ПАЧКА</span>' : ''}${item.variantName ? ` <span style="background:#7b1fa2;color:white;padding:1px 4px;border-radius:3px;font-size:10px;">${item.variantName}</span>` : ''}</td>
          <td style="padding:8px; font-size:13px; text-align:center;">${item.qty} ${unitLbl}</td>
          <td style="padding:8px; font-size:13px; text-align:right;">${item.price.toFixed(2)} сом</td>
          <td style="padding:8px; font-size:13px; text-align:right;">${costPrice.toFixed(2)} сом</td>
          <td style="padding:8px; font-size:13px; text-align:right; font-weight:600;">${itemSale.toFixed(2)} сом</td>
          <td style="padding:8px; font-size:13px; text-align:right;">${itemCost.toFixed(2)} сом</td>
          <td style="padding:8px;  text-align:right; font-weight:700; color:white; background:${itemProfitColor}; border-radius:4px;">
            <div style="padding:4px;">${itemProfit > 0 ? '+' : ''}${itemProfit.toFixed(2)} сом</div>
          </td>
        </tr>
      `;
    });
    
    orderCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
        <div>
          <div style="font-size:18px; font-weight:700; color:#333; margin-bottom:5px;">
            📦 Заказ #${orderIdx + 1}
          </div>
          <div style=" color:#666;">
            📅 ${dateStr}
          </div>
          <div style=" color:#888; margin-top:3px;">
            📍 ${order.address || 'Адрес не указан'}
          </div>
        </div>
        <div style="text-align:right;">
          <div style=" color:#666; margin-bottom:5px;">Прибыль:</div>
          <div style="font-size:22px; font-weight:700; color:${profitColor};">
            ${order.profit > 0 ? '+' : ''}${order.profit.toFixed(2)} сом
          </div>
        </div>
      </div>
      
      <div style="background:#f8f9fa; border-radius:8px; padding:12px; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#e9ecef;">
              <th style="padding:8px; text-align:left;">#</th>
              <th style="padding:8px; text-align:left;">Товар</th>
              <th style="padding:8px; text-align:center;">Кол-во</th>
              <th style="padding:8px; text-align:right;">Цена</th>
              <th style="padding:8px; text-align:right;">Себестоимость</th>
              <th style="padding:8px; text-align:right;">Сумма продажи</th>
              <th style="padding:8px; text-align:right;">Сумма себестоимости</th>
              <th style="padding:8px; text-align:right;">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:2px solid #e0e0e0;">
        <div style="font-size:16px; font-weight:600; color:#333;">
          💰 Итого: ${order.totalSale.toFixed(2)} сом
        </div>
        <div style="font-size:16px; font-weight:600;">
          Себестоимость: ${order.totalCost.toFixed(2)} сом
        </div>
        <div style="font-size:18px; font-weight:700; color:${profitColor};">
          📊 Прибыль: ${order.profit > 0 ? '+' : ''}${order.profit.toFixed(2)} сом
        </div>
      </div>
    `;
    
    listDiv.appendChild(orderCard);
  });
}

// Закрыть модальное окно детальной информации
function closeClientOrdersDetailModal() {
  document.getElementById('clientOrdersDetailModal').style.display = 'none';
  unlockPageScroll();
}

// Удалить конкретный заказ клиента
async function deleteSpecificOrder(orderId, clientName) {
  const result = await Swal.fire({
    title: 'Удалить заказ?',
    html: `Вы действительно хотите удалить этот заказ клиента <strong>${clientName}</strong>?<br><br><small style="color:#dc3545;">⚠️ Это действие нельзя отменить!</small>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: '🗑️ Да, удалить',
    cancelButtonText: 'Отмена'
  });

  if (result.isConfirmed) {
    try {
      await db.collection('orders').doc(orderId).delete();
      
      Swal.fire({
        icon: 'success',
        title: 'Заказ удален!',
        text: 'Заказ успешно удален из базы данных',
        timer: 2000,
        showConfirmButton: false
      });
      
      await loadOrderProfitReport();
      
    } catch (error) {
      console.error('Ошибка удаления заказа:', error);
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: 'Не удалось удалить заказ: ' + error.message
      });
    }
  }
}

// Обновить количество товара в заказе
async function updateOrderItemQty(orderId, itemIndex, newQty) {
  newQty = parseInt(newQty);
  
  if (isNaN(newQty) || newQty < 0) {
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Введите корректное количество (0 или больше)'
    });
    await loadOrderProfitReport();
    return;
  }

  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      throw new Error('Заказ не найден');
    }
    
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    if (itemIndex >= items.length) {
      throw new Error('Товар не найден в заказе');
    }
    
    // Если количество = 0, удаляем товар из заказа
    if (newQty === 0) {
      const result = await Swal.fire({
        title: 'Удалить товар?',
        html: `Количество = 0. Удалить товар <strong>"${items[itemIndex].title || 'Товар'}"</strong> из заказа?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена'
      });
      
      if (result.isConfirmed) {
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
            text: 'Товар успешно удален из заказа',
            timer: 1500,
            showConfirmButton: false
          });
        }
        
        await loadOrderProfitReport();
      } else {
        await loadOrderProfitReport();
      }
      return;
    }
    
    // Обновляем количество товара
    items[itemIndex].qty = newQty;
    
    // Проверяем оптовую цену
    const item = items[itemIndex];
    const product = products.find(p => p.id === item.id);
    if (product && product.optQty && product.optPrice && newQty >= product.optQty) {
      items[itemIndex].price = product.optPrice;
    } else if (product && product.price) {
      items[itemIndex].price = product.price;
    }
    
    // Пересчитываем общую сумму заказа (важно для комиссии агента!)
    const newTotal = items.reduce((sum, itm) => sum + (itm.price * itm.qty), 0);
    
    await db.collection('orders').doc(orderId).update({ items, total: newTotal });
    
    Swal.fire({
      icon: 'success',
      title: 'Количество обновлено!',
      html: `Новое количество: <strong>${newQty} шт</strong>`,
      timer: 1500,
      showConfirmButton: false
    });
    
    await loadOrderProfitReport();
    
  } catch (error) {
    console.error('Ошибка обновления количества:', error);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Не удалось обновить количество: ' + error.message
    });
    await loadOrderProfitReport();
  }
}

// Экспорт заказов в Excel
async function exportOrderProfitToExcel() {
  const dateFilter = document.getElementById('orderDateFilter').value;
  
  try {
    const ordersSnapshot = await db.collection('orders').get();
    const orders = [];
    
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      orders.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp || Date.now()
      });
    });
    
    // Применяем фильтры
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;
    const monthStart = todayStart - 30 * 86400000;
    
    let filtered = orders.filter(order => {
      const orderTime = order.timestamp;
      switch(dateFilter) {
        case 'today': return orderTime >= todayStart;
        case 'yesterday': return orderTime >= yesterdayStart && orderTime < todayStart;
        case 'week': return orderTime >= weekStart;
        case 'month': return orderTime >= monthStart;
        case 'all': return true;
        default: return true;
      }
    });
    
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['№', 'Дата', 'Клиент', 'Телефон', 'Товаров', 'Закупка', 'Сумма', 'Прибыль']
    ];
    
    filtered.forEach((order, index) => {
      let totalCost = 0;
      let totalSale = 0;
      const items = order.items || [];
      
      items.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product && product.costPrice) {
          totalCost += product.costPrice * item.qty;
          totalSale += item.price * item.qty;
        } else {
          totalSale += item.price * item.qty;
        }
      });
      
      const profit = totalSale - totalCost;
      const date = new Date(order.timestamp);
      const dateStr = date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
      const itemsCount = items.reduce((sum, item) => sum + item.qty, 0);
      
      wsData.push([
        index + 1,
        dateStr,
        order.name || 'Неизвестный',
        order.phone || '-',
        itemsCount,
        totalCost.toFixed(2),
        totalSale.toFixed(2),
        profit.toFixed(2)
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Прибыль по заказам');
    XLSX.writeFile(wb, `Прибыль_по_заказам_${new Date().toLocaleDateString()}.xlsx`);
    
    Swal.fire('Готово!', 'Отчет экспортирован в Excel', 'success');
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    Swal.fire('Ошибка', 'Не удалось экспортировать отчет', 'error');
  }
}

// Удаление выбранных заказов
async function deleteSelectedOrders() {
  const result = await Swal.fire({
    title: '⚠️ Внимание!',
    html: 'Вы действительно хотите удалить заказы за выбранный период?<br><br><strong style="color:#dc3545;">Это действие нельзя отменить!</strong>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    const dateFilter = document.getElementById('orderDateFilter').value;
    const ordersSnapshot = await db.collection('orders').get();
    
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;
    const monthStart = todayStart - 30 * 86400000;
    
    let deleteCount = 0;
    const batch = db.batch();
    
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      const orderTime = data.timestamp || Date.now();
      let shouldDelete = false;
      
      switch(dateFilter) {
        case 'today': shouldDelete = orderTime >= todayStart; break;
        case 'yesterday': shouldDelete = orderTime >= yesterdayStart && orderTime < todayStart; break;
        case 'week': shouldDelete = orderTime >= weekStart; break;
        case 'month': shouldDelete = orderTime >= monthStart; break;
        case 'all': shouldDelete = true; break;
      }
      
      if (shouldDelete) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    });
    
    await batch.commit();
    
    Swal.fire('Успех!', `Удалено заказов: ${deleteCount}`, 'success');
    
    loadOrderProfitReport();
    
  } catch (error) {
    console.error('Ошибка удаления заказов:', error);
    Swal.fire('Ошибка', 'Не удалось удалить заказы: ' + error.message, 'error');
  }
}

// ==================== КОНЕЦ ОТЧЕТА ПО ПРИБЫЛИ ====================
