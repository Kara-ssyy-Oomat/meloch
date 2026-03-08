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
  if (btn) {
    if (isEditorMode) {
      btn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
      btn.innerHTML = '✅ Редактор ВКЛ';
    } else {
      btn.style.background = 'linear-gradient(135deg, #6c757d, #495057)';
      btn.innerHTML = '✏️ Редактор';
      
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
  
  // Автозаполнение поля "Кто порекомендовал"
  const referredByInput = document.getElementById('referredBy');
  if (referredByInput) {
    try {
      const savedReferredBy = localStorage.getItem('savedReferredBy');
      if (savedReferredBy && !getCurrentPartner()) {
        referredByInput.value = savedReferredBy;
        referredByInput.style.borderColor = '#28a745';
        referredByInput.style.background = '#f0fff4';
      }
    } catch(e) {}
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
