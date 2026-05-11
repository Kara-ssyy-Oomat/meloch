// ==================== ФУНКЦИИ РАСХОДОВ ====================

// Открыть окно добавления расхода
function openAddExpenseModal() {
  document.getElementById('addExpenseModal').style.display = 'flex';
  lockPageScroll();
  
  // Установить текущую дату
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expenseDate').value = today;
  
  // Очистить поля
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseIsRecurring').checked = false;
  document.getElementById('recurringOptions').style.display = 'none';
  
  // Сбросить чекбоксы дней недели
  document.querySelectorAll('.recurringDay').forEach(cb => cb.checked = false);
}

// Переключение информации о ежедневных расходах
function toggleRecurringOptions() {
  const isChecked = document.getElementById('expenseIsRecurring').checked;
  const recurringOptions = document.getElementById('recurringOptions');
  recurringOptions.style.display = isChecked ? 'block' : 'none';
}

// Выбрать все дни недели
function selectAllDays() {
  document.querySelectorAll('.recurringDay').forEach(cb => cb.checked = true);
}

// Закрыть окно добавления расхода
function closeAddExpenseModal() {
  document.getElementById('addExpenseModal').style.display = 'none';
  unlockPageScroll();
}

// Сохранить расход
async function saveExpense() {
  const description = document.getElementById('expenseDescription').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const date = document.getElementById('expenseDate').value;
  const isRecurring = document.getElementById('expenseIsRecurring').checked;
  
  if (!description) {
    Swal.fire('Ошибка', 'Введите описание расхода', 'error');
    return;
  }
  
  if (!amount || amount <= 0) {
    Swal.fire('Ошибка', 'Введите корректную сумму', 'error');
    return;
  }
  
  if (!date) {
    Swal.fire('Ошибка', 'Выберите дату', 'error');
    return;
  }
  
  // Собираем выбранные дни недели
  let selectedDays = [];
  if (isRecurring) {
    selectedDays = Array.from(document.querySelectorAll('.recurringDay:checked'))
      .map(cb => parseInt(cb.value));
    
    // Если не выбран ни один день, предупреждаем
    if (selectedDays.length === 0) {
      Swal.fire('Ошибка', 'Выберите хотя бы один день недели для регулярного расхода', 'error');
      return;
    }
  }
  
  try {
    // Сохраняем в Firebase
    const expenseData = {
      description,
      amount,
      date,
      timestamp: new Date(date).getTime(),
      createdAt: Date.now(),
      isRecurring: isRecurring || false
    };
    
    // Добавляем дни недели только если это регулярный расход
    if (isRecurring) {
      expenseData.recurringDays = selectedDays;
    }
    
    await db.collection('expenses').add(expenseData);

    // Инвалидируем кэш отчёта, чтобы при следующем открытии увидели новые данные
    if (typeof _invalidateProfitReportCache === 'function') _invalidateProfitReportCache();
    
    closeAddExpenseModal();
    
    if (isRecurring) {
      const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const selectedDayNames = selectedDays.map(d => dayNames[d]).join(', ');
      Swal.fire('Успех', `Регулярный расход "${description}" добавлен! Дни: ${selectedDayNames}`, 'success');
    } else {
      Swal.fire('Успех', 'Расход добавлен!', 'success');
    }
    
    loadExpensesReport();
  } catch (error) {
    console.error('Ошибка сохранения расхода:', error);
    Swal.fire('Ошибка', 'Не удалось сохранить расход', 'error');
  }
}

// Загрузить отчет по расходам
async function loadExpensesReport() {
  try {
    console.log('📊 loadExpensesReport вызвана');
    const period = document.getElementById('expenseDateFilter').value;
    console.log('🔍 Период:', period);

    // ОПТИМИЗАЦИЯ COSTS: используем общий кэш отчёта (60 сек) для тяжёлых
    // выгрузок — раньше каждый клик делал заново 4 крупных .get() без лимита.
    const _useCache = typeof _loadExpensesCached === 'function';
    // ОПТИМИЗАЦИЯ COSTS: лимит 5000 на fallback-чтение (если cache-функции
    // не загружены). Раньше тянуло всё, могло быть очень много за годы.
    const expensesSnapshot = _useCache ? null : await db.collection('expenses').orderBy('timestamp', 'desc').limit(5000).get();
    let expenses = [];
    if (_useCache) {
      const cached = await _loadExpensesCached();
      expenses = cached.map(d => ({
        ...d,
        timestamp: normalizeEpochMs(d.timestamp, normalizeEpochMs(d.createdAt, Date.now()))
      }));
    } else {
      expensesSnapshot.forEach(doc => {
        const data = doc.data();
        expenses.push({
          id: doc.id,
          ...data,
          timestamp: normalizeEpochMs(data.timestamp, normalizeEpochMs(data.createdAt, Date.now()))
        });
      });
    }
    console.log('💸 Всего расходов:', expenses.length);

    // Получаем расходы агентов из коллекции agentExpenses (тоже через кэш)
    try {
      const agentSrc = _useCache ? await _loadAgentExpensesCached() : null;
      if (agentSrc) {
        agentSrc.forEach(data => {
          expenses.push({
            id: 'agent_' + data.id,
            description: data.description,
            amount: data.amount || 0,
            timestamp: normalizeEpochMs(data.timestamp, normalizeEpochMs(data.createdAt, Date.now())),
            createdAt: data.createdAt || Date.now(),
            isAgentExpense: true,
            agentName: data.agentName || 'Агент'
          });
        });
        console.log('🤝 Расходов агентов загружено:', agentSrc.length);
      } else {
        const agentExpSnapshot = await db.collection('agentExpenses').limit(5000).get();
        agentExpSnapshot.forEach(doc => {
          const data = doc.data();
          expenses.push({
            id: 'agent_' + doc.id,
            description: data.description,
            amount: data.amount || 0,
            timestamp: normalizeEpochMs(data.timestamp, normalizeEpochMs(data.createdAt, Date.now())),
            createdAt: data.createdAt || Date.now(),
            isAgentExpense: true,
            agentName: data.agentName || 'Агент'
          });
        });
      }
    } catch(e) {
      console.log('⚠️ Не удалось загрузить расходы агентов:', e);
    }

    // Заказы — из общего кэша
    let orders = [];
    if (_useCache) {
      const cached = await _loadOrdersCached();
      orders = cached.map(o => ({ ...o, timestamp: normalizeEpochMs(o.timestamp, Date.now()) }));
    } else {
      const ordersSnapshot = await db.collection('orders').orderBy('timestamp', 'desc').limit(10000).get();
      ordersSnapshot.forEach(doc => {
        const data = doc.data();
        orders.push({
          id: doc.id,
          ...data,
          timestamp: normalizeEpochMs(data.timestamp, Date.now())
        });
      });
    }
    console.log('📦 Всего заказов:', orders.length);

    // Товары — из общего кэша
    let productsMap = new Map();
    try {
      if (_useCache) {
        const cached = await _loadProductsCached();
        cached.forEach(data => {
          productsMap.set(data.id, {
            name: data.name || 'Неизвестный товар',
            costPrice: data.costPrice || 0,
            salePrice: data.price || 0,
            category: data.category || 'все'
          });
        });
      } else {
        const productsSnapshot = await db.collection('products').limit(5000).get();
        productsSnapshot.forEach(doc => {
          const data = doc.data();
          productsMap.set(doc.id, {
            name: data.name || 'Неизвестный товар',
            costPrice: data.costPrice || 0,
            salePrice: data.price || 0,
            category: data.category || 'все'
          });
        });
      }
      console.log('💰 Товаров в карте:', productsMap.size);
    } catch (error) {
      console.error('❌ Ошибка загрузки товаров:', error);
    }
    
    // Фильтруем по периоду
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    
    console.log('📅 Временные метки:');
    console.log('  Сейчас:', new Date(now).toLocaleString());
    console.log('  Начало сегодня:', new Date(todayStart).toLocaleString());
    console.log('  Начало вчера:', new Date(yesterdayStart).toLocaleString());
    
    const expensesBeforeFilter = expenses.length;
    
    // Сначала отделяем регулярные расходы от обычных
    const recurringExpenseIds = new Set();
    expenses.forEach(exp => {
      if (exp.isRecurring && exp.recurringDays && exp.recurringDays.length > 0) {
        recurringExpenseIds.add(exp.id);
      }
    });
    
    // Фильтруем по периоду (только НЕ-регулярные расходы — регулярные обработаем отдельно)
    expenses = expenses.filter(exp => {
      // Регулярные расходы убираем — они будут заменены виртуальными записями
      if (recurringExpenseIds.has(exp.id)) return false;
      
      const expTime = exp.timestamp;
      switch(period) {
        case 'today': return expTime >= todayStart;
        case 'yesterday': return expTime >= yesterdayStart && expTime < todayStart;
        case 'week': return expTime >= weekStart;
        case 'month': return expTime >= monthStart;
        case 'all': return true;
        default: return true;
      }
    });
    
    console.log(`💸 Обычных расходов до фильтра: ${expensesBeforeFilter}, после: ${expenses.length}`);
    
    // ========== РЕГУЛЯРНЫЕ РАСХОДЫ: генерация виртуальных записей ==========
    // ОПТИМИЗАЦИЯ COSTS: берём regular из уже загруженного списка (или из кэша),
    // а не делаем дополнительный .where('isRecurring','==',true).get().
    let recurringExpenses = [];
    if (_useCache) {
      const allCached = await _loadExpensesCached();
      allCached.forEach(data => {
        if (data.isRecurring === true && data.recurringDays && data.recurringDays.length > 0) {
          recurringExpenses.push({...data});
        }
      });
    } else {
      expensesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.isRecurring === true && data.recurringDays && data.recurringDays.length > 0) {
          recurringExpenses.push({id: doc.id, ...data});
        }
      });
    }
    
    console.log('🔄 Регулярных расходов найдено:', recurringExpenses.length);
    
    if (recurringExpenses.length > 0) {
      // Определяем диапазон дат для генерации
      let periodStartMs, periodEndMs;
      switch(period) {
        case 'today':
          periodStartMs = todayStart;
          periodEndMs = now;
          break;
        case 'yesterday':
          periodStartMs = yesterdayStart;
          periodEndMs = todayStart - 1;
          break;
        case 'week':
          periodStartMs = weekStart;
          periodEndMs = now;
          break;
        case 'month':
          periodStartMs = monthStart;
          periodEndMs = now;
          break;
        case 'all':
          // Для "all" — от самого раннего регулярного расхода до сегодня
          periodStartMs = Math.min(...recurringExpenses.map(e => e.timestamp || e.createdAt || Date.now()));
          periodEndMs = now;
          break;
        default:
          periodStartMs = todayStart;
          periodEndMs = now;
      }
      
      const dayMs = 86400000;
      
      recurringExpenses.forEach(expense => {
        const expenseStartMs = expense.timestamp || expense.createdAt || 0;
        
        // Начинаем с позднейшей из: начала периода или даты создания расхода
        const genStartMs = Math.max(periodStartMs, expenseStartMs);
        // Не генерируем в будущее
        const genEndMs = Math.min(periodEndMs, todayStart + dayMs - 1);
        
        // Выравниваем до начала дня
        const genStart = new Date(genStartMs);
        genStart.setHours(0, 0, 0, 0);
        
        let currentDay = new Date(genStart);
        let dayIndex = 0;
        
        while (currentDay.getTime() <= genEndMs) {
          const dayOfWeek = currentDay.getDay();
          
          if (expense.recurringDays.includes(dayOfWeek)) {
            expenses.push({
              ...expense,
              id: expense.id + '_virtual_' + dayIndex,
              description: expense.description + ' (регулярный)',
              timestamp: currentDay.getTime(),
              isVirtual: true
            });
          }
          
          currentDay.setDate(currentDay.getDate() + 1);
          dayIndex++;
        }
      });
      
      console.log('💸 Расходов после добавления регулярных:', expenses.length);
    }
    // ========== КОНЕЦ РЕГУЛЯРНЫХ РАСХОДОВ ==========
    
    orders = orders.filter(order => {
      const orderTime = order.timestamp;
      switch(period) {
        case 'today': return orderTime >= todayStart;
        case 'yesterday': return orderTime >= yesterdayStart && orderTime < todayStart;
        case 'week': return orderTime >= weekStart;
        case 'month': return orderTime >= monthStart;
        case 'all': return true;
        default: return true;
      }
    });
    
    console.log('📊 Заказов после фильтра:', orders.length);
    
    // Рассчитываем прибыль от заказов (КАК В ФУНКЦИИ ПО ЗАКАЗАМ)
    let totalOrderProfit = 0;
    orders.forEach(order => {
      const items = order.items || [];
      let hasKoreanProducts = false;
      
      items.forEach(item => {
        const productData = productsMap.get(item.id);
        
        // Проверяем категорию товара
        if (productData && productData.category && (productData.category.toLowerCase() === 'корейские' || productData.category.toLowerCase() === 'часы' || productData.category.toLowerCase() === 'электроника')) {
          hasKoreanProducts = true;
        }
        
        // Для корейского менеджера считаем только корейские товары, часы и электронику
        if (userRole === 'korean' && (!productData || !productData.category || (productData.category.toLowerCase() !== 'корейские' && productData.category.toLowerCase() !== 'часы' && productData.category.toLowerCase() !== 'электроника'))) {
          return; // Пропускаем не корейские товары, часы и электронику
        }
        
        // Используем себестоимость из заказа, если она есть, иначе из базы товаров
        const costPrice = item.costPrice || (productData ? productData.costPrice : 0);
        const itemCost = costPrice * item.qty;
        const itemSale = item.price * item.qty;
        // Если себестоимость = 0 или не указана, прибыль = 0
        const itemProfit = costPrice > 0 ? (itemSale - itemCost) : 0;
        
        totalOrderProfit += itemProfit;
      });
    });
    
    console.log('💰 Прибыль от заказов:', totalOrderProfit.toFixed(2));
    
    // Рассчитываем общие расходы
    const totalExpensesAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    console.log('💸 Сумма расходов:', totalExpensesAmount.toFixed(2));
    
    // Чистая прибыль = прибыль от заказов - расходы
    const netProfitAmount = totalOrderProfit - totalExpensesAmount;
    
    console.log('📊 Чистая прибыль:', netProfitAmount.toFixed(2));
    
    // Обновляем сводку
    document.getElementById('totalExpenses').textContent = totalExpensesAmount.toFixed(2) + ' сом';
    document.getElementById('expensesPeriodProfit').textContent = totalOrderProfit.toFixed(2) + ' сом';
    document.getElementById('netProfit').textContent = netProfitAmount.toFixed(2) + ' сом';
    document.getElementById('netProfit').style.color = netProfitAmount >= 0 ? '#28a745' : '#dc3545';
    
    console.log('✅ Сводка обновлена');
    
    // Отображаем расходы в таблице
    const tbody = document.getElementById('expensesReportBody');
    tbody.innerHTML = '';
    
    if (expenses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:40px; text-align:center; color:#999;">Расходов за выбранный период нет</td></tr>';
      return;
    }
    
    expenses.forEach((expense, index) => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #e0e0e0';
      row.style.transition = 'background 0.2s';
      row.onmouseenter = () => row.style.background = '#f8f9fa';
      row.onmouseleave = () => row.style.background = 'white';
      
      const date = new Date(expense.timestamp);
      const dateStr = date.toLocaleDateString('ru-RU');
      
      // Определяем реальный ID расхода (убираем _virtual_X для виртуальных)
      const realExpenseId = expense.isVirtual ? expense.id.split('_virtual_')[0] : expense.id;
      
      // Формируем описание дней недели для регулярных расходов
      let daysInfo = '';
      if (expense.isRecurring && expense.recurringDays && expense.recurringDays.length > 0) {
        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const selectedDayNames = expense.recurringDays.map(d => dayNames[d]).join(', ');
        daysInfo = `<span style="color:#666; font-size:11px; margin-left:8px;">(${selectedDayNames})</span>`;
      }
      
      // Добавляем метку для ежедневных расходов
      const recurringBadge = expense.isRecurring ? 
        `<span style="background:#17a2b8; color:white; padding:2px 6px; border-radius:4px; font-size:11px; margin-left:8px;">🔄 Регулярный</span>` : '';
      
      // Метка расхода агента
      const agentBadge = expense.isAgentExpense ? 
        `<span style="background:#ff9800; color:white; padding:2px 6px; border-radius:4px; font-size:11px; margin-left:8px;">🤝 ${expense.agentName}</span>` : '';
      
      row.innerHTML = `
        <td data-label="#" style="padding:12px; font-weight:600; color:#666;">${index + 1}</td>
        <td data-label="Дата" style="padding:12px; color:#666;">${dateStr}</td>
        <td data-label="Описание" style="padding:12px; color:#333;">
          ${expense.description}
          ${recurringBadge}
          ${agentBadge}
          ${daysInfo}
          ${expense.isVirtual ? '<span style="color:#888; font-size:12px; margin-left:8px;">(авто)</span>' : ''}
        </td>
        <td data-label="Сумма" style="padding:12px; text-align:right; font-weight:600; color:#dc3545;">${expense.amount.toFixed(2)} сом</td>
        <td data-label="Действия" style="padding:12px; text-align:center;">
          ${expense.isVirtual ? 
            `<button onclick="deleteExpense('${realExpenseId}')" style="padding:6px 12px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;" title="Удалить регулярный расход">🗑️</button>` : 
            expense.isAgentExpense ?
            `<button onclick="deleteAgentExpenseFromReport('${expense.id.replace('agent_', '')}')" style="padding:6px 12px; background:#ff9800; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">🗑️ Удалить</button>` :
            `<button onclick="deleteExpense('${realExpenseId}')" style="padding:6px 12px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">🗑️ Удалить</button>`
          }
        </td>
      `;
      
      tbody.appendChild(row);
    });
    
  } catch (error) {
    console.error('Ошибка загрузки расходов:', error);
    Swal.fire('Ошибка', 'Не удалось загрузить расходы', 'error');
  }
}

// Удалить расход
async function deleteExpense(expenseId) {
  const result = await Swal.fire({
    title: 'Удалить расход?',
    text: 'Это действие нельзя отменить',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  });
  
  if (result.isConfirmed) {
    try {
      await db.collection('expenses').doc(expenseId).delete();
      if (typeof _invalidateProfitReportCache === 'function') _invalidateProfitReportCache();
      Swal.fire('Удалено', 'Расход удален', 'success');
      loadExpensesReport();
    } catch (error) {
      console.error('Ошибка удаления расхода:', error);
      Swal.fire('Ошибка', 'Не удалось удалить расход', 'error');
    }
  }
}

// Удалить расход агента из отчёта
async function deleteAgentExpenseFromReport(expenseId) {
  const result = await Swal.fire({
    title: 'Удалить расход агента?',
    text: 'Это действие нельзя отменить',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#ff9800'
  });
  
  if (result.isConfirmed) {
    try {
      await db.collection('agentExpenses').doc(expenseId).delete();
      if (typeof _invalidateProfitReportCache === 'function') _invalidateProfitReportCache();
      Swal.fire('Удалено', 'Расход агента удален', 'success');
      loadExpensesReport();
    } catch (error) {
      console.error('Ошибка удаления расхода агента:', error);
      Swal.fire('Ошибка', 'Не удалось удалить расход', 'error');
    }
  }
}

// ==================== КОНЕЦ ФУНКЦИЙ РАСХОДОВ ====================
