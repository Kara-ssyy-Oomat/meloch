// ===== SIDE MENU MODULE =====
// Боковое меню и открытие окон

// ==================== ФУНКЦИИ БОКОВОГО МЕНЮ ====================

// Сохраняем позицию скролла
let menuSavedScrollY = 0;

// Переключение бокового меню
function toggleSideMenu() {
  const sideMenu = document.getElementById('sideMenu');
  const menuOverlay = document.getElementById('menuOverlay');
  
  if (sideMenu.style.left === '0px') {
    // Закрываем меню
    sideMenu.style.left = '-300px';
    menuOverlay.style.display = 'none';
    
    // Разблокируем прокрутку
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, menuSavedScrollY);
  } else {
    // Сохраняем позицию скролла
    menuSavedScrollY = window.scrollY;
    
    // Открываем меню
    sideMenu.style.left = '0px';
    menuOverlay.style.display = 'block';
    
    // Блокируем прокрутку страницы
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${menuSavedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    
    // Прокручиваем меню вверх чтобы поле пароля было видно
    sideMenu.scrollTop = 0;
    
    // Проверяем статус входа админа
    updateAdminMenuState();
  }
}

// Обновление состояния админ-секции в меню
function updateAdminMenuState() {
  if (isAdmin && userRole === 'admin') {
    // Полный администратор
    document.getElementById('menuAdminLogin').style.display = 'none';
    document.getElementById('menuAdminLoggedIn').style.display = 'flex';
    document.getElementById('menuKoreanManager').style.display = 'none';
    document.getElementById('menuAppliancesManager').style.display = 'none';
  } else if (isAdmin && userRole === 'korean') {
    // Корейский менеджер
    document.getElementById('menuAdminLogin').style.display = 'none';
    document.getElementById('menuAdminLoggedIn').style.display = 'none';
    document.getElementById('menuKoreanManager').style.display = 'flex';
    document.getElementById('menuAppliancesManager').style.display = 'none';
  } else if (isAdmin && userRole === 'appliances') {
    // Менеджер бытовых техник
    document.getElementById('menuAdminLogin').style.display = 'none';
    document.getElementById('menuAdminLoggedIn').style.display = 'none';
    document.getElementById('menuKoreanManager').style.display = 'none';
    document.getElementById('menuAppliancesManager').style.display = 'flex';
  } else {
    // Гость (не вошел)
    document.getElementById('menuAdminLogin').style.display = 'flex';
    document.getElementById('menuAdminLoggedIn').style.display = 'none';
    document.getElementById('menuKoreanManager').style.display = 'none';
    document.getElementById('menuAppliancesManager').style.display = 'none';
  }
}

// Закрытие меню при нажатии Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const sideMenu = document.getElementById('sideMenu');
    if (sideMenu.style.left === '0px') {
      toggleSideMenu();
    }
  }
});

// Открытие чата из бокового меню
function openChatFromMenu() {
  // Закрываем боковое меню
  toggleSideMenu();
  
  // Открываем чат через небольшую задержку для плавности
  setTimeout(() => {
    const chatWindow = document.getElementById('chatWindow');
    if (chatWindow.style.display !== 'flex') {
      toggleChat();
    }
  }, 300);
}

// Открытие полноэкранного окна админского чата
async function openAdminChatWindow() {
  // Закрываем боковое меню
  toggleSideMenu();
  
  // Открываем окно админского чата
  setTimeout(async () => {
    const adminChatWindow = document.getElementById('adminChatWindow');
    adminChatWindow.style.display = 'flex';
    lockPageScroll(); // Блокируем скролл
    
    // Загружаем список клиентов
    await loadAdminFullChat();
  }, 300);
}

// Открытие окна добавления товара
async function openAddProductWindow() {
  // Закрываем боковое меню
  toggleSideMenu();
  
  // Открываем окно добавления товара БЕЗ задержки для быстроты
  const addProductWindow = document.getElementById('addProductWindow');
  
  // Сначала показываем окно
  addProductWindow.style.display = 'flex';
  lockPageScroll();
  
  // Инициализируем редактор вариантов
  if (typeof renderVariantEditor === 'function') {
    renderVariantEditor();
  }
  
  // Очищаем форму синхронно
  const newTitle = document.getElementById('newTitle');
  const newCostPrice = document.getElementById('newCostPrice');
  const newPrice = document.getElementById('newPrice');
  const newOptPrice = document.getElementById('newOptPrice');
  const newOptQty = document.getElementById('newOptQty');
  const newMinQty = document.getElementById('newMinQty');
  const imageFile = document.getElementById('imageFile');
  const newImage = document.getElementById('newImage');
  const imagePreview = document.getElementById('imagePreview');
  const profitDisplay = document.getElementById('profitDisplay');
  
  newTitle.value = '';
  newCostPrice.value = '';
  newPrice.value = '';
  newOptPrice.value = '';
  newOptQty.value = '';
  newMinQty.value = '';
  imageFile.value = '';
  newImage.value = '';
  imagePreview.style.display = 'none';
  profitDisplay.style.display = 'none';
  
  // Категории и роли загружаем в следующем цикле событий
  setTimeout(() => {
    
    const categorySelect = document.getElementById('newCategory');
    
    // ОПТИМИЗАЦИЯ: Используем кэшированные категории вместо загрузки из Firebase
    // Категории загружаются один раз при старте в loadSellerCategoriesCache()
    try {
      const standardCategories = ['все', 'ножницы', 'скотч', 'нож', 'корейские', 'часы', 'электроника', 'бытовые'];
      
      // Берём категории из кэша (cachedSellerCategories загружается при старте)
      const allSellerCategories = cachedSellerCategories || [];
      
      // Удаляем старые категории продавцов из списка (оставляем только стандартные)
      const optionsToRemove = [];
      for (let i = 0; i < categorySelect.options.length; i++) {
        if (categorySelect.options[i].dataset.sellerCategory === 'true') {
          optionsToRemove.push(categorySelect.options[i]);
        }
      }
      optionsToRemove.forEach(opt => opt.remove());
      
      // Добавляем категории продавцов в список (без проверки через Array.from каждый раз)
      const existingValues = new Set();
      for (let i = 0; i < categorySelect.options.length; i++) {
        existingValues.add(categorySelect.options[i].value.toLowerCase());
      }
      
      allSellerCategories.forEach(catName => {
        if (!existingValues.has(catName.toLowerCase())) {
          const option = document.createElement('option');
          option.value = catName.toLowerCase();
          option.textContent = `🏪 ${catName}`;
          option.dataset.sellerCategory = 'true';
          categorySelect.appendChild(option);
        }
      });
      
      console.log('Категории из кэша:', allSellerCategories.length);
    } catch (e) {
      console.log('Ошибка загрузки категорий:', e);
    }
    
    // Для корейского менеджера - показываем только корейские товары, часы и электронику
    if (userRole === 'korean') {
      Array.from(categorySelect.options).forEach(option => {
        if (option.value !== 'корейские' && option.value !== 'часы' && option.value !== 'электроника' && option.value !== '') {
          option.style.display = 'none';
        } else {
          option.style.display = 'block';
        }
      });
      categorySelect.value = 'корейские';
      categorySelect.disabled = false;
    } else if (userRole === 'seller') {
      // Для продавца - показываем все категории + возможность создать новую
      console.log('Seller role detected, showing all categories including new');
      for (let i = 0; i < categorySelect.options.length; i++) {
        categorySelect.options[i].style.display = '';
        categorySelect.options[i].style.visibility = 'visible';
        categorySelect.options[i].hidden = false;
      }
      categorySelect.value = '';
      categorySelect.disabled = false;
    } else {
      // Для админа - показываем все категории
      console.log('Admin/other role, showing all categories');
      for (let i = 0; i < categorySelect.options.length; i++) {
        categorySelect.options[i].style.display = '';
        categorySelect.options[i].style.visibility = 'visible';
        categorySelect.options[i].hidden = false;
      }
      categorySelect.value = '';
      categorySelect.disabled = false;
    }
  }, 50); // Уменьшена задержка для быстрого открытия
}

// Закрытие окна добавления товара
function closeAddProductWindow() {
  const addProductWindow = document.getElementById('addProductWindow');
  addProductWindow.style.display = 'none';
  unlockPageScroll(); // Разблокируем скролл
  
  // ОПТИМИЗАЦИЯ: включаем обратно MutationObserver
  if (globalScrollObserver) {
    globalScrollObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    globalScrollObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
}

// Открытие окна управления заказами
function openOrdersManagementWindow() {
  toggleSideMenu();
  
  setTimeout(() => {
    const ordersWindow = document.getElementById('ordersManagementWindow');
    ordersWindow.style.display = 'flex';
    lockPageScroll(); // Блокируем скролл
    loadOrdersManagement();
  }, 300);
}

// Закрытие окна управления заказами
function closeOrdersManagementWindow() {
  const ordersWindow = document.getElementById('ordersManagementWindow');
  ordersWindow.style.display = 'none';
  unlockPageScroll(); // Разблокируем скролл
}
