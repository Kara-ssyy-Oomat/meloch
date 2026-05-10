// ==================== ОТЧЕТ ПО ПРИБЫЛИ ====================

// ОПТИМИЗАЦИЯ COSTS: общий кэш для тяжёлых выгрузок orders/products/agents.
// Раньше каждое переключение вкладки или нажатие «Обновить» делало
// db.collection('orders').get() и db.collection('products').get() заново —
// это сотни-тысячи Firestore Reads на один клик. Теперь данные живут 60 сек
// в памяти и переиспользуются всеми функциями отчёта.
const _profitReportCache = {
  orders: null,           ordersTs: 0,
  products: null,         productsTs: 0,
  agents: null,           agentsTs: 0,
  agentExpenses: null,    agentExpensesTs: 0,
  expenses: null,         expensesTs: 0,
};
const _PROFIT_REPORT_CACHE_MS = 60000; // 60 секунд

async function _getCachedCollection(key, queryFn) {
  const now = Date.now();
  const tsKey = key + 'Ts';
  if (_profitReportCache[key] && (now - _profitReportCache[tsKey]) < _PROFIT_REPORT_CACHE_MS) {
    return _profitReportCache[key];
  }
  const docs = await queryFn();
  _profitReportCache[key] = docs;
  _profitReportCache[tsKey] = now;
  return docs;
}
function _invalidateProfitReportCache() {
  _profitReportCache.orders = null;       _profitReportCache.ordersTs = 0;
  _profitReportCache.products = null;     _profitReportCache.productsTs = 0;
  _profitReportCache.agents = null;       _profitReportCache.agentsTs = 0;
  _profitReportCache.agentExpenses = null; _profitReportCache.agentExpensesTs = 0;
  _profitReportCache.expenses = null;     _profitReportCache.expensesTs = 0;
}
window._invalidateProfitReportCache = _invalidateProfitReportCache;

async function _loadOrdersCached() {
  return _getCachedCollection('orders', async () => {
    const snap = await db.collection('orders').get();
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    return arr;
  });
}
async function _loadProductsCached() {
  return _getCachedCollection('products', async () => {
    const snap = await db.collection('products').get();
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    return arr;
  });
}
async function _loadAgentsCached() {
  return _getCachedCollection('agents', async () => {
    const snap = await db.collection('agents').get();
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    return arr;
  });
}
async function _loadExpensesCached() {
  return _getCachedCollection('expenses', async () => {
    const snap = await db.collection('expenses').orderBy('timestamp', 'desc').get();
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    return arr;
  });
}
async function _loadAgentExpensesCached() {
  return _getCachedCollection('agentExpenses', async () => {
    const snap = await db.collection('agentExpenses').get();
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    return arr;
  });
}

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
  
  // Скрываем вкладку "Расходы" для корейского менеджера и менеджера бытовых техник
  const expensesTab = document.getElementById('tabExpenses');
  if (expensesTab) {
    expensesTab.style.display = (userRole === 'korean' || userRole === 'appliances') ? 'none' : 'block';
  }
  
  // ОПТИМИЗАЦИЯ COSTS: загружаем товары через общий кэш (60 сек).
  // При повторном открытии отчёта данные не читаются из Firestore заново.
  // Принудительный refresh — кнопкой «Обновить» (она вызовет _invalidateProfitReportCache).
  console.log('⬇️ Загрузка товаров (с кэшем)...');
  try {
    const cached = await _loadProductsCached();
    products = [...cached];
    console.log('✅ Товаров (кэш/firebase):', products.length);
  } catch (error) {
    console.error('❌ Ошибка загрузки товаров:', error);
  }
  
  // Сбрасываем на вкладку "По товарам" и загружаем данные
  switchProfitTab('products');
  loadProfitReport();
  
  // ОПТИМИЗАЦИЯ COSTS: убрали onSnapshot на orders/expenses — они вычитывали
  // ВСЕ документы коллекций при каждом изменении и держали постоянное
  // соединение с Firestore. Теперь данные обновляются только когда админ
  // явно переключает вкладку или нажимает «Обновить».
  if (profitReportOrdersListener) { profitReportOrdersListener(); profitReportOrdersListener = null; }
  if (profitReportExpensesListener) { profitReportExpensesListener(); profitReportExpensesListener = null; }
  if (profitReportAutoRefresh) { clearInterval(profitReportAutoRefresh); profitReportAutoRefresh = null; }
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
  const tabAgents = document.getElementById('tabAgents');
  const tabExpenses = document.getElementById('tabExpenses');
  const productsPanel = document.getElementById('profitProductsPanel');
  const ordersPanel = document.getElementById('profitOrdersPanel');
  const agentsPanel = document.getElementById('profitAgentsPanel');
  const expensesPanel = document.getElementById('profitExpensesPanel');
  const productsTable = document.getElementById('profitProductsTable');
  const ordersTable = document.getElementById('profitOrdersTable');
  const agentsTable = document.getElementById('profitAgentsTable');
  const expensesTable = document.getElementById('profitExpensesTable');
  
  // Сброс стилей всех кнопок
  [tabProducts, tabOrders, tabAgents, tabExpenses].forEach(btn => {
    if (btn) {
      btn.style.background = '#e9ecef';
      btn.style.color = '#333';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    }
  });
  
  // Скрыть все панели и таблицы
  if (productsPanel) productsPanel.style.display = 'none';
  if (ordersPanel) ordersPanel.style.display = 'none';
  if (agentsPanel) agentsPanel.style.display = 'none';
  if (expensesPanel) expensesPanel.style.display = 'none';
  if (productsTable) productsTable.style.display = 'none';
  if (ordersTable) ordersTable.style.display = 'none';
  if (agentsTable) agentsTable.style.display = 'none';
  if (expensesTable) expensesTable.style.display = 'none';
  
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
  } else if (tab === 'agents') {
    tabAgents.style.background = 'linear-gradient(90deg, #9c27b0, #7b1fa2)';
    tabAgents.style.color = 'white';
    tabAgents.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    agentsPanel.style.display = 'block';
    agentsTable.style.display = 'block';
    loadAgentsProfitReport();
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
    const cached = await _loadOrdersCached();
    const orders = cached.map(o => ({
      ...o,
      timestamp: normalizeEpochMs(o.timestamp, Date.now())
    }));

    console.log('📋 Заказы (кэш/firebase):', orders.length);
    
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
  
  // ОПТИМИЗАЦИЯ COSTS: используем кэш товаров (60 сек) вместо нового .get()
  let productsMap = new Map();
  try {
    const cachedProducts = await _loadProductsCached();
    cachedProducts.forEach(data => {
      productsMap.set(data.id, {
        name: data.name || 'Неизвестный товар',
        costPrice: data.costPrice || 0,
        salePrice: data.price || 0,
        category: data.category || 'все'
      });
    });
    console.log('💰 Товаров в карте (кэш):', productsMap.size);
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
      _invalidateProfitReportCache();
      
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
    // ОПТИМИЗАЦИЯ COSTS: используем кэш заказов вместо нового .get()
    const cachedOrders = await _loadOrdersCached();
    const orders = cachedOrders.map(o => ({
      ...o,
      timestamp: o.timestamp || Date.now()
    }));
    
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
    _invalidateProfitReportCache();
    
    Swal.fire('Успех!', `Удалено заказов: ${deleteCount}`, 'success');
    
    loadOrderProfitReport();
    
  } catch (error) {
    console.error('Ошибка удаления заказов:', error);
    Swal.fire('Ошибка', 'Не удалось удалить заказы: ' + error.message, 'error');
  }
}

// ==================== ОТЧЕТ ПО АГЕНТАМ ====================

// Загрузка отчета по агентам
async function loadAgentsProfitReport() {
  console.log('🤝 Загрузка отчета по агентам...');
  
  const contentEl = document.getElementById('agentsProfitReportContent');
  if (!contentEl) return;
  
  contentEl.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">Загрузка данных...</div>';
  
  try {
    // ОПТИМИЗАЦИЯ COSTS: используем общий кэш для товаров/агентов/заказов
    console.log('⬇️ Загрузка для агентов (кэш)...');
    const cachedProducts = await _loadProductsCached();
    const productsMap = new Map();
    cachedProducts.forEach(data => {
      productsMap.set(data.id, {
        costPrice: parseFloat(data.costPrice) || 0,
        salePrice: parseFloat(data.price) || 0,
        name: data.name || data.title || ''
      });
    });

    const cachedAgents = await _loadAgentsCached();
    const agents = {};
    const agentsByName = {};
    cachedAgents.forEach(data => {
      const agentData = { ...data, orders: [], totalSum: 0, totalProfit: 0, ordersCount: 0 };
      agents[data.id] = agentData;
      if (agentData.name) agentsByName[agentData.name] = agentData;
    });

    const cachedOrders = await _loadOrdersCached();
    // эмулируем интерфейс snapshot.forEach(doc => doc.data())
    const ordersSnapshot = { forEach: (cb) => cachedOrders.forEach(o => cb({ id: o.id, data: () => o })) };
    
    // Фильтруем по периоду
    const dateFilter = document.getElementById('agentsDateFilter')?.value || 'month';
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;
    const monthStart = todayStart - 30 * 86400000;
    
    let totalOrdersCount = 0;
    let totalSum = 0;
    let totalProfit = 0;
    
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      const partnerId = data.partner;
      
      if (!partnerId) return; // Пропускаем заказы без агента
      
      const orderTime = normalizeEpochMs(data.timestamp, Date.now());
      
      // Фильтр по периоду
      let inPeriod = false;
      switch(dateFilter) {
        case 'today': inPeriod = orderTime >= todayStart; break;
        case 'yesterday': inPeriod = orderTime >= yesterdayStart && orderTime < todayStart; break;
        case 'week': inPeriod = orderTime >= weekStart; break;
        case 'month': inPeriod = orderTime >= monthStart; break;
        case 'all': inPeriod = true; break;
      }
      
      if (!inPeriod) return;
      
      // Вычисляем прибыль по заказу (продажа - закупка)
      let orderProfit = 0;
      let orderCost = 0;
      let orderSale = 0;
      
      if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
          const salePrice = parseFloat(item.price) || 0;
          const qty = parseInt(item.qty) || 1;
          const productData = productsMap.get(item.id);
          
          // Используем себестоимость из заказа, если она есть, иначе из базы товаров
          let costPrice = 0;
          if (item.costPrice !== undefined && item.costPrice !== null) {
            costPrice = parseFloat(item.costPrice) || 0;
          } else if (productData) {
            costPrice = productData.costPrice || 0;
          }
          
          const itemSale = salePrice * qty;
          const itemCost = costPrice * qty;
          const itemProfit = costPrice > 0 ? (itemSale - itemCost) : 0;
          
          orderSale += itemSale;
          orderCost += itemCost;
          orderProfit += itemProfit;
        });
      }
      
      // Ищем агента - сначала по ID, потом по имени
      let agent = agents[partnerId] || agentsByName[partnerId];
      
      // Если агент существует, добавляем заказ
      if (agent) {
        agent.orders.push({ id: doc.id, ...data });
        agent.totalSum += data.total || 0;
        agent.totalProfit += orderProfit;
        agent.ordersCount++;
        totalOrdersCount++;
        totalSum += data.total || 0;
        totalProfit += orderProfit;
        
        console.log(`📋 Заказ для агента ${agent.name}:`, {
          клиент: data.name,
          сумма: data.total,
          прибыль: orderProfit
        });
      }
    });
    
    console.log('📊 ИТОГО по агентам:', {
      заказов: totalOrdersCount,
      сумма: totalSum,
      прибыль: totalProfit
    });
    
    // Обновляем сводку
    const totalCommission = Math.round(totalSum * 0.02);
    document.getElementById('agentsTotalCount').textContent = Object.keys(agents).length;
    document.getElementById('agentsOrdersCount').textContent = totalOrdersCount;
    document.getElementById('agentsTotalProfit').textContent = Math.round(totalProfit).toLocaleString() + ' сом';
    document.getElementById('agentsTotalCommission').textContent = totalCommission.toLocaleString() + ' сом';
    // Преобразуем в массив для сортировки
    let agentsList = Object.values(agents);
    
    // Сортировка
    const sortFilter = document.getElementById('agentsSortFilter')?.value || 'orders-desc';
    switch(sortFilter) {
      case 'orders-desc': agentsList.sort((a, b) => b.ordersCount - a.ordersCount); break;
      case 'sum-desc': agentsList.sort((a, b) => b.totalProfit - a.totalProfit); break;
      case 'commission-desc': agentsList.sort((a, b) => (b.totalSum * 0.02) - (a.totalSum * 0.02)); break;
      case 'name': agentsList.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
    }
    
    // Отображаем агентов
    if (agentsList.length === 0) {
      contentEl.innerHTML = `
        <div style="text-align:center; padding:40px; color:#666;">
          <div style="font-size:48px; margin-bottom:15px;">🤝</div>
          <div style="font-size:16px;">Нет зарегистрированных агентов</div>
        </div>
      `;
      return;
    }
    
    let html = '';
    agentsList.forEach((agent, index) => {
      const commission = Math.round(agent.totalSum * 0.02);
      const profit = Math.round(agent.totalProfit || 0);
      const isActive = agent.active !== false;
      
      html += `
        <div style="background:white; border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1); border-left:4px solid ${isActive ? '#4caf50' : '#dc3545'};">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="flex:1; min-width:200px;">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px;">
                <span style="font-size:18px; font-weight:700; color:#333;">${index + 1}. ${agent.name || 'Без имени'}</span>
                <span style="font-size:12px; padding:3px 8px; border-radius:10px; background:${isActive ? '#e8f5e9' : '#ffebee'}; color:${isActive ? '#4caf50' : '#dc3545'};">
                  ${isActive ? 'Активен' : 'Заблокирован'}
                </span>
              </div>
              <div style="font-size:13px; color:#666;">📱 ${agent.phone || 'Нет телефона'}</div>
              <div style="font-size:12px; color:#999; margin-top:5px;">
                Регистрация: ${agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'Неизвестно'}
              </div>
            </div>
            
            <div style="display:flex; gap:15px; align-items:center; flex-wrap:wrap;">
              <div style="text-align:center; padding:10px 15px; background:#e3f2fd; border-radius:8px;">
                <div style="font-size:11px; color:#666;">Заказов</div>
                <div style="font-size:20px; font-weight:700; color:#2196f3;">${agent.ordersCount}</div>
              </div>
              <div style="text-align:center; padding:10px 15px; background:#e8f5e9; border-radius:8px;">
                <div style="font-size:11px; color:#666;">Прибыль</div>
                <div style="font-size:20px; font-weight:700; color:#4caf50;">${profit.toLocaleString()}</div>
              </div>
              <div style="text-align:center; padding:10px 15px; background:#fff3e0; border-radius:8px;">
                <div style="font-size:11px; color:#666;">Комиссия</div>
                <div style="font-size:20px; font-weight:700; color:#ff9800;">${commission.toLocaleString()}</div>
              </div>
              <button onclick="showAgentOrdersDetail('${agent.id}', '${(agent.name || '').replace(/'/g, "\\'")}')" style="padding:10px 15px; background:#9c27b0; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px;">
                👁️ Заказы
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    contentEl.innerHTML = html;
    
  } catch (error) {
    console.error('❌ Ошибка загрузки отчета по агентам:', error);
    contentEl.innerHTML = `
      <div style="text-align:center; padding:30px; color:#dc3545;">
        <div>Ошибка загрузки данных</div>
        <div style="font-size:12px; margin-top:5px;">${error.message}</div>
      </div>
    `;
  }
}

// Показать детали заказов агента
async function showAgentOrdersDetail(agentId, agentName) {
  try {
    // ОПТИМИЗАЦИЯ COSTS: товары — из общего кэша
    const cachedProducts = await _loadProductsCached();
    const productsMap = new Map();
    cachedProducts.forEach(data => {
      productsMap.set(data.id, { costPrice: parseFloat(data.costPrice) || 0 });
    });

    // Заказы агента — точечный запрос по индексу partner (это уже было оптимально)
    const snapshot = await db.collection('orders')
      .where('partner', '==', agentId)
      .get();

    if (snapshot.empty) {
      Swal.fire('Нет заказов', `У агента "${agentName}" пока нет заказов`, 'info');
      return;
    }

    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let html = '<div style="max-height:400px; overflow-y:auto;">';
    let totalSum = 0;
    let totalProfit = 0;
    
    orders.forEach((order, i) => {
      const date = order.time || new Date(order.timestamp).toLocaleDateString();
      const statusColors = {
        'Новый': '#17a2b8',
        'В обработке': '#ffc107',
        'Доставляется': '#007bff',
        'Доставлен': '#28a745',
        'Отменён': '#dc3545'
      };
      const color = statusColors[order.status] || '#666';
      totalSum += order.total || 0;
      
      // Рассчитываем прибыль по заказу
      let orderProfit = 0;
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          const salePrice = parseFloat(item.price) || 0;
          const qty = parseInt(item.qty) || 1;
          const productData = productsMap.get(item.id);
          
          let costPrice = 0;
          if (item.costPrice !== undefined && item.costPrice !== null) {
            costPrice = parseFloat(item.costPrice) || 0;
          } else if (productData) {
            costPrice = productData.costPrice || 0;
          }
          
          if (costPrice > 0) {
            orderProfit += (salePrice - costPrice) * qty;
          }
        });
      }
      totalProfit += orderProfit;
      
      html += `
        <div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600;">${order.name || 'Клиент'}</div>
            <div style="font-size:12px; color:#666;">${order.phone || ''} • ${date}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:600; color:#333;">${(order.total || 0).toLocaleString()} сом</div>
            <div style="font-size:12px; color:#4caf50;">Прибыль: ${Math.round(orderProfit).toLocaleString()} сом</div>
            <span style="font-size:11px; padding:2px 6px; background:${color}; color:white; border-radius:8px;">${order.status || 'Новый'}</span>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    
    const commission = Math.round(totalSum * 0.02);
    
    Swal.fire({
      title: `🤝 Заказы агента: ${agentName}`,
      html: `
        <div style="margin-bottom:15px; display:flex; gap:15px; justify-content:center; flex-wrap:wrap;">
          <div style="background:#e3f2fd; padding:10px 20px; border-radius:8px; text-align:center;">
            <div style="font-size:12px; color:#666;">Заказов</div>
            <div style="font-size:20px; font-weight:700; color:#2196f3;">${orders.length}</div>
          </div>
          <div style="background:#e8f5e9; padding:10px 20px; border-radius:8px; text-align:center;">
            <div style="font-size:12px; color:#666;">Чистая прибыль</div>
            <div style="font-size:20px; font-weight:700; color:#4caf50;">${Math.round(totalProfit).toLocaleString()}</div>
          </div>
          <div style="background:#fff3e0; padding:10px 20px; border-radius:8px; text-align:center;">
            <div style="font-size:12px; color:#666;">Комиссия</div>
            <div style="font-size:20px; font-weight:700; color:#ff9800;">${commission.toLocaleString()}</div>
          </div>
        </div>
        ${html}
      `,
      width: '600px',
      showCloseButton: true,
      showConfirmButton: false
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
    Swal.fire('Ошибка', 'Не удалось загрузить заказы', 'error');
  }
}

// Экспорт отчета по агентам в Excel
async function exportAgentsProfitToExcel() {
  try {
    // ОПТИМИЗАЦИЯ COSTS: используем общий кэш для всех трёх коллекций
    const cachedProducts = await _loadProductsCached();
    const productsMap = new Map();
    cachedProducts.forEach(data => {
      productsMap.set(data.id, { costPrice: parseFloat(data.costPrice) || 0 });
    });

    const cachedAgents = await _loadAgentsCached();
    const cachedOrders = await _loadOrdersCached();

    const agents = {};
    cachedAgents.forEach(data => {
      agents[data.id] = { name: data.name, phone: data.phone, ordersCount: 0, totalSum: 0, totalProfit: 0 };
    });

    cachedOrders.forEach(data => {
      if (data.partner && agents[data.partner]) {
        agents[data.partner].ordersCount++;
        agents[data.partner].totalSum += data.total || 0;
        
        // Рассчитываем прибыль по заказу
        if (data.items && data.items.length > 0) {
          data.items.forEach(item => {
            const salePrice = parseFloat(item.price) || 0;
            const qty = parseInt(item.qty) || 1;
            const productData = productsMap.get(item.id);
            
            let costPrice = 0;
            if (item.costPrice !== undefined && item.costPrice !== null) {
              costPrice = parseFloat(item.costPrice) || 0;
            } else if (productData) {
              costPrice = productData.costPrice || 0;
            }
            
            if (costPrice > 0) {
              agents[data.partner].totalProfit += (salePrice - costPrice) * qty;
            }
          });
        }
      }
    });
    
    let csv = 'Агент,Телефон,Количество заказов,Сумма заказов,Чистая прибыль,Комиссия (2%)\n';
    
    Object.values(agents).forEach(agent => {
      const commission = Math.round(agent.totalSum * 0.02);
      csv += `"${agent.name || ''}","${agent.phone || ''}",${agent.ordersCount},${agent.totalSum},${Math.round(agent.totalProfit)},${commission}\n`;
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `agents_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    Swal.fire({
      icon: 'success',
      title: 'Экспортировано!',
      text: 'Отчет по агентам сохранен',
      timer: 2000,
      showConfirmButton: false
    });
    
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    Swal.fire('Ошибка', 'Не удалось экспортировать отчет', 'error');
  }
}

// ==================== КОНЕЦ ОТЧЕТА ПО ПРИБЫЛИ ====================
