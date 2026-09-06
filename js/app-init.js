// ===================================================================
// КЕРБЕН B2B Market — App Initialization (инициализация приложения)
// ===================================================================

// ОПТИМИЗАЦИЯ: Debounce для предотвращения частых вызовов
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Функция переключения режима редактирования
function toggleEditorMode() {
  isEditorMode = !isEditorMode;
  const btn = document.getElementById('editorModeBtn');
  const bulkBtn = document.getElementById('bulkSelectBtn');
  if (btn) {
    if (isEditorMode) {
      btn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
      btn.innerHTML = '✅ Редактор ВКЛ';
      if (bulkBtn) bulkBtn.style.display = 'flex';
    } else {
      btn.style.background = 'linear-gradient(135deg, #6c757d, #495057)';
      btn.innerHTML = '✏️ Редактор';
      
      // Сбрасываем режим выделения
      if (bulkBtn) {
        bulkBtn.style.display = 'none';
        bulkBtn.style.background = 'linear-gradient(135deg, #9c27b0, #7b1fa2)';
        bulkBtn.innerHTML = '☑️ Выделить';
      }
      isBulkSelectMode = false;
      bulkSelectedProducts.clear();
      const bar = document.getElementById('bulkActionBar');
      if (bar) bar.style.display = 'none';
      
      // ВАЖНО: Принудительная очистка при выходе из режима редактора
      if (globalImageObserver) {
        globalImageObserver.disconnect();
        globalImageObserver = null;
      }
    }
  }
  renderProducts();
}

// Функция переключения режима покупки по коробкам
function toggleBoxPurchaseMode() {
  boxPurchaseMode = !boxPurchaseMode;
  const btn = document.getElementById('boxModeBtn');
  if (btn) {
    const spanEl = btn.querySelector('span');
    if (boxPurchaseMode) {
      btn.classList.add('active');
      if (spanEl) spanEl.textContent = '📦 По коробкам: ВКЛ';
      btn.style.background = 'linear-gradient(135deg, #2e7d32, #4caf50)';
    } else {
      btn.classList.remove('active');
      if (spanEl) spanEl.textContent = '📦 По коробкам: ВЫКЛ';
      btn.style.background = 'linear-gradient(135deg, #757575, #9e9e9e)';
    }
  }
  // Перерисовываем карточки товаров
  renderProducts();
  
  Swal.fire({
    title: boxPurchaseMode ? '📦 Режим коробок ВКЛ' : '📌 Режим коробок ВЫКЛ',
    text: boxPurchaseMode ? 'Теперь каждое нажатие + добавляет целую коробку' : 'Теперь каждое нажатие + добавляет 1 пачку',
    icon: 'info',
    toast: true,
    position: 'top',
    timer: 2500,
    showConfirmButton: false
  });
}

// Функция фильтрации по категориям
function filterByCategory(category, btn) {
  currentCategory = category;
  
  // Обновляем активную кнопку
  const buttons = document.querySelectorAll('.category-btn');
  buttons.forEach(b => b.classList.remove('active'));
  
  // Если передана кнопка напрямую - используем её
  // Иначе ищем кнопку по data-category
  if (btn && btn.classList) {
    btn.classList.add('active');
  } else if (typeof event !== 'undefined' && event && event.target) {
    event.target.classList.add('active');
  } else {
    // Ищем кнопку по категории
    const targetBtn = document.querySelector(`.category-btn[data-category="${category}"]`);
    if (targetBtn) targetBtn.classList.add('active');
  }
  
  // Перерисовываем товары
  renderProducts();
  
  // Принудительно прокручиваем страницу на самый верх
  setTimeout(() => {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
  }, 50);
}

// Автозаполнение данных пользователя из localStorage
const userData = JSON.parse(localStorage.getItem('userData') || '{}');
if (userData.name) document.getElementById('name').value = userData.name;
if (userData.phone) document.getElementById('phone').value = userData.phone;
if (userData.address) document.getElementById('address').value = userData.address;
if (userData.driverName) document.getElementById('driverName').value = userData.driverName;
if (userData.driverPhone) document.getElementById('driverPhone').value = userData.driverPhone;

// Инициализация корзины и привязки при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing...');
  
  // ===== БЛОКИРОВКА ЗУМА НА iOS =====
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  if (isIOS) {
    document.addEventListener('gesturestart', function(e) {
      if (e.target.closest('.swal2-container')) return;
      e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('gesturechange', function(e) {
      if (e.target.closest('.swal2-container')) return;
      e.preventDefault();
    }, { passive: false });
    
    document.addEventListener('gestureend', function(e) {
      if (e.target.closest('.swal2-container')) return;
      e.preventDefault();
    }, { passive: false });
  }
  // ===== КОНЕЦ БЛОКИРОВКИ ЗУМА =====
  
  // Загрузка списка агентов в выпадающий список "Кто порекомендовал"
  const referredBySelect = document.getElementById('referredBy');
  if (referredBySelect) {
    const AGENTS_CACHE_KEY = 'kerbenAgentsList_v1';
    const AGENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 сутки

    function renderAgentsIntoSelect(agents) {
      // Удаляем ранее добавленные опции (кроме первой — placeholder)
      while (referredBySelect.options.length > 1) referredBySelect.remove(1);
      agents = (agents || []).slice().sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), 'ru');
      });
      agents.forEach(function (a) {
        if (!a || !a.name) return;
        const opt = document.createElement('option');
        opt.value = a.name;
        opt.textContent = a.name;
        referredBySelect.appendChild(opt);
      });
      // Автовыбор сохранённого агента
      try {
        const savedReferredBy = localStorage.getItem('savedReferredBy');
        const urlPartner = typeof getCurrentPartner === 'function' ? getCurrentPartner() : null;
        const preselect = urlPartner || savedReferredBy;
        if (preselect) {
          for (let i = 0; i < referredBySelect.options.length; i++) {
            if (referredBySelect.options[i].value === preselect) {
              referredBySelect.value = preselect;
              referredBySelect.style.borderColor = '#28a745';
              referredBySelect.style.background = '#f0fff4';
              break;
            }
          }
        }
      } catch(e) {}
    }

    // 1) Мгновенно рисуем из кэша localStorage — даже если Firebase Auth ещё
    //    не готов или сеть недоступна, пользователь сразу видит список.
    try {
      const raw = localStorage.getItem(AGENTS_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && Array.isArray(cached.agents) && cached.agents.length > 0) {
          renderAgentsIntoSelect(cached.agents);
          console.log('[Agents] Показан кэш из localStorage:', cached.agents.length);
        }
      }
    } catch(e) {}

    // 2) Параллельно тянем свежий список из Firestore с большими retry
    (async function loadAgentsIntoSelect(attempt) {
      attempt = attempt || 1;
      try {
        if (typeof db === 'undefined' || !db) {
          if (attempt < 15) return setTimeout(function () { loadAgentsIntoSelect(attempt + 1); }, 1000);
          return;
        }
        // Ждём Firebase Auth до 8 сек — иначе rules 'isRegularAuthed' откажут.
        // По умолчанию kerbenWaitForAuth ждёт 3 сек, но на медленной сети
        // (3G, реконнект PWA) этого мало.
        if (typeof kerbenWaitForAuth === 'function') {
          await kerbenWaitForAuth(8000).catch(function () {});
        }

        const snap = await db.collection('agents').get();
        const agents = [];
        snap.forEach(function (doc) {
          const d = doc.data() || {};
          if (d.name && d.active !== false) {
            agents.push({ id: doc.id, name: d.name });
          }
        });

        renderAgentsIntoSelect(agents);
        console.log('[Agents] Загружено с сервера:', agents.length);

        // Сохраняем в кэш для следующего открытия / offline
        try {
          localStorage.setItem(AGENTS_CACHE_KEY, JSON.stringify({
            agents: agents,
            ts: Date.now()
          }));
        } catch(e) {}
      } catch(e) {
        console.error('[Agents] Ошибка загрузки (попытка ' + attempt + '):', e && e.message ? e.message : e);
        // До 5 попыток с экспоненциальной паузой (2с, 4с, 8с, 16с)
        if (attempt < 5) {
          const delay = Math.min(16000, 2000 * Math.pow(2, attempt - 1));
          setTimeout(function () { loadAgentsIntoSelect(attempt + 1); }, delay);
        }
      }
    })();
  }

  try {
    // Восстанавливаем продавца до загрузки товаров (показываем кнопку редактора)
    if (typeof checkSavedSeller === 'function') checkSavedSeller();

    loadProducts().then(() => {
      // renderProducts() уже вызван внутри loadProducts() — не вызываем повторно!
      loadSellerCategories(); // Загружаем категории продавцов
      updateCart(); // Обновляем корзину ПОСЛЕ загрузки товаров
      updateFavoritesCount(); // Обновляем счётчик избранного
      
      // splash уже скрыт из product-loader.js при первом показе товаров
      
      // Повторно проверяем продавца (на случай если defer-скрипт seller.js ещё не был загружен ранее)
      if (typeof checkSavedSeller === 'function' && !currentSeller && localStorage.getItem('currentSeller')) {
        checkSavedSeller();
      }
      
      // Инициализируем калькулятор прибыли
      if (typeof setupProfitCalculator === 'function') setupProfitCalculator();
      
      // Заполняем форму заказа данными авторизованного клиента
      if (typeof fillOrderFormWithCustomerData === 'function') fillOrderFormWithCustomerData();
      
      // Загружаем админ-библиотеки если пользователь — администратор
      if (isAdmin && typeof loadAdminLibraries === 'function') loadAdminLibraries();
    });
    
    // Если уже был вход как админ (например, после обновления), показать панель
    if (isAdmin) {
      const adminPanel = document.getElementById('adminPanel');
      if (adminPanel) adminPanel.style.display = '';
    }
    
    // Обработчик кнопки выхода из профиля
    const logoutBtn = document.getElementById('logoutUser');
    if (logoutBtn) {
      console.log('Кнопка выхода найдена, привязываем обработчик');
      logoutBtn.addEventListener('click', function() {
        console.log('Клик по кнопке выхода');
        isAdmin = false;
        
        // Безопасная работа с элементами - проверяем существование
        const adminAddProduct = document.getElementById('adminAddProduct');
        if (adminAddProduct) adminAddProduct.style.display = 'none';
        
        const adminAuth = document.getElementById('adminAuth');
        if (adminAuth) adminAuth.style.display = 'block';
        
        const managementHeader = document.getElementById('managementHeader');
        if (managementHeader) managementHeader.style.display = 'none';
        
        const adminPassword = document.getElementById('adminPassword');
        if (adminPassword) adminPassword.value = '';
        
        localStorage.removeItem('userData');
        
        const nameField = document.getElementById('name');
        if (nameField) nameField.value = '';
        
        const phoneField = document.getElementById('phone');
        if (phoneField) phoneField.value = '';
        
        const addressField = document.getElementById('address');
        if (addressField) addressField.value = '';
        
        Swal.fire('Вы вышли из профиля');
        renderProducts();
        
        // Скрываем админ-панель
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) adminPanel.style.display = 'none';
      });
    } else {
      console.log('Кнопка выхода НЕ найдена');
    }
  } catch (error) {
    console.error('Error during initialization:', error);
    Swal.fire('Ошибка', 'Ошибка при загрузке страницы: ' + error.message, 'error');
  }
});
