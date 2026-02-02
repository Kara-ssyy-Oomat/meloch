// ===========================================
// Модуль нижней навигации (Bottom Navigation Bar)
// Простая версия без блокировки прокрутки
// ===========================================

document.addEventListener('DOMContentLoaded', function() {
  createBottomNavigation();
  updateNavCounts();
  // ОПТИМИЗАЦИЯ: Обновляем счётчики каждые 5 секунд вместо 1 секунды
  // Основное обновление происходит через событие cartUpdated
  setInterval(updateNavCounts, 5000);
});

// ОПТИМИЗАЦИЯ: Обновляем счётчик при изменении корзины через кастомное событие
window.addEventListener('cartUpdated', function() {
  updateNavCounts();
});

function createBottomNavigation() {
  if (document.getElementById('bottomNavBar')) return;
  
  const navBar = document.createElement('nav');
  navBar.id = 'bottomNavBar';
  navBar.innerHTML = `
    <div class="nav-main">
      <a href="index.html" class="nav-item active" data-nav="home">
        <svg class="nav-svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        <span class="nav-text">Главная</span>
      </a>
      <button onclick="navGoCategories()" class="nav-item" data-nav="categories">
        <svg class="nav-svg" viewBox="0 0 24 24"><path d="M3 5h6v6H3V5zm0 8h6v6H3v-6zm8-8h6v6h-6V5zm0 8h6v6h-6v-6zm8-8h2v6h-2V5zm0 8h2v6h-2v-6z"/></svg>
        <span class="nav-text">Меню</span>
      </button>
      <a href="cart.html" class="nav-item" data-nav="cart">
        <svg class="nav-svg" viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 14.6l.1-.1L8.2 12h7.4c.8 0 1.4-.4 1.7-1l3.9-7-1.7-1-3.9 7H8.5L4.3 2H1v2h2l3.6 7.6-1.4 2.5c-.7 1.3.3 2.9 1.8 2.9h12v-2H7.4c-.1 0-.2-.1-.2-.4z"/></svg>
        <span class="nav-text">Корзина</span>
        <span id="navCartBadge" class="nav-badge">0</span>
      </a>
      <a href="profile.html" class="nav-item" data-nav="profile">
        <svg class="nav-svg" viewBox="0 0 24 24"><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>
        <span class="nav-text">Профиль</span>
      </a>
    </div>
  `;
  
  addBottomNavStyles();
  document.body.appendChild(navBar);
  document.body.style.paddingBottom = '56px';
  hideOldFloatingButtons();
}

function addBottomNavStyles() {
  if (document.getElementById('bottomNavStyles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'bottomNavStyles';
  styles.textContent = `
    #bottomNavBar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 9600;
      background: #fff;
      display: flex;
      align-items: center;
      height: 56px;
      border-top: 1px solid #eee;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.08);
    }
    .nav-main {
      flex: 1;
      display: flex;
      justify-content: space-around;
      align-items: center;
      height: 100%;
    }
    .nav-item {
      flex: 1;
      background: none;
      border: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      height: 100%;
      cursor: pointer;
      position: relative;
      color: #9e9e9e;
      transition: color 0.2s;
      text-decoration: none;
    }
    .nav-item:active { background: #f5f5f5; }
    .nav-item.active { color: #333; }
    .nav-svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }
    .nav-text {
      font-size: 11px;
      font-weight: 500;
    }
    .nav-badge {
      position: absolute;
      top: 6px;
      right: calc(50% - 16px);
      background: #e53935;
      color: white;
      font-size: 10px;
      font-weight: 600;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    @media (min-width: 769px) {
      #bottomNavBar { display: none; }
      body { padding-bottom: 0 !important; }
    }
  `;
  document.head.appendChild(styles);
}

function hideOldFloatingButtons() {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      #cartFloatBtn, #customerAccountBtn { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

// Закрыть все модальные окна
function closeAllModals() {
  // Профиль
  const profileModal = document.getElementById('profileFullscreenModal');
  const ordersModal = document.getElementById('ordersFullscreenModal');
  if (profileModal) profileModal.remove();
  if (ordersModal) ordersModal.remove();
  
  // Корзина
  const cartPage = document.getElementById('cartPage');
  if (cartPage) cartPage.style.display = 'none';
  
  // Избранное
  const favoritesPage = document.getElementById('favoritesPage');
  if (favoritesPage) favoritesPage.style.display = 'none';
  
  // Чат
  const chatWindow = document.getElementById('chatWindow');
  if (chatWindow) chatWindow.style.display = 'none';
  
  // Жалоба, Предложить товар, Стать продавцом
  const complaintWindow = document.getElementById('complaintWindow');
  if (complaintWindow) complaintWindow.style.display = 'none';
  
  const suggestionWindow = document.getElementById('suggestionWindow');
  if (suggestionWindow) suggestionWindow.style.display = 'none';
  
  const becomeSellerWindow = document.getElementById('becomeSellerWindow');
  if (becomeSellerWindow) becomeSellerWindow.style.display = 'none';
  
  // Модальные окна агентов
  const agentProfitModal = document.getElementById('agentProfitModal');
  if (agentProfitModal) agentProfitModal.style.display = 'none';
  
  const agentsManagementModal = document.getElementById('agentsManagementModal');
  if (agentsManagementModal) agentsManagementModal.style.display = 'none';
  
  const agentClientsListModal = document.getElementById('agentClientsListModal');
  if (agentClientsListModal) agentClientsListModal.style.display = 'none';
  
  const clientsForAgentsModal = document.getElementById('clientsForAgentsModal');
  if (clientsForAgentsModal) clientsForAgentsModal.style.display = 'none';
  
  const agentAuthModal = document.getElementById('agentAuthModal');
  if (agentAuthModal) agentAuthModal.style.display = 'none';
  
  // Админ-окна
  const ordersManagementWindow = document.getElementById('ordersManagementWindow');
  if (ordersManagementWindow) ordersManagementWindow.style.display = 'none';
  
  const addProductWindow = document.getElementById('addProductWindow');
  if (addProductWindow) addProductWindow.style.display = 'none';
  
  const profitReportWindow = document.getElementById('profitReportWindow');
  if (profitReportWindow) profitReportWindow.style.display = 'none';
  
  const partnersOrdersWindow = document.getElementById('partnersOrdersWindow');
  if (partnersOrdersWindow) partnersOrdersWindow.style.display = 'none';
  
  const adminChatWindow = document.getElementById('adminChatWindow');
  if (adminChatWindow) adminChatWindow.style.display = 'none';
  
  const editProductModal = document.getElementById('editProductModal');
  if (editProductModal) editProductModal.style.display = 'none';
  
  const previewBlock = document.getElementById('previewBlock');
  if (previewBlock) previewBlock.style.display = 'none';
  
  // Закрываем Swal если открыт
  if (typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible()) {
    Swal.close();
  }
  
  // Разблокируем прокрутку
  if (typeof forceUnlockScroll === 'function') {
    forceUnlockScroll();
  }
  
  console.log('✅ closeAllModals() выполнен');
}

// Навигация
function navGoHome() {
  console.log('🏠 navGoHome() вызван');
  setActiveNavItem('home');
  closeCategoriesPanel();
  closeAllModals();
  
  // Закрываем модалки агентов
  if (typeof window.closeAllAgentModals === 'function') {
    window.closeAllAgentModals();
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navGoCategories() {
  setActiveNavItem('categories');
  closeAllModals();
  openCategoriesPanel();
}

function navGoCart() {
  setActiveNavItem('cart');
  closeCategoriesPanel();
  closeAllModals();
  if (typeof openCartPage === 'function') openCartPage();
  else if (typeof showCart === 'function') showCart();
}

function navGoChat() {
  setActiveNavItem('chat');
  closeCategoriesPanel();
  closeAllModals();
  if (typeof toggleChat === 'function') toggleChat();
}

function navGoProfile() {
  setActiveNavItem('profile');
  closeCategoriesPanel();
  closeAllModals();
  if (typeof openCustomerAccount === 'function') openCustomerAccount();
}

function setActiveNavItem(navName) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === navName);
  });
}

// Счётчики
function updateNavCounts() {
  const cartBadge = document.getElementById('navCartBadge');
  if (cartBadge && typeof cart !== 'undefined') {
    const count = Array.isArray(cart) ? cart.length : 0;
    cartBadge.textContent = count;
    cartBadge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// Панель категорий
let _savedScrollPos = 0;

function openCategoriesPanel() {
  _savedScrollPos = window.pageYOffset || 0;
  
  // Удаляем старую панель чтобы обновить категории
  const oldPanel = document.getElementById('categoriesPanel');
  if (oldPanel) oldPanel.remove();
  
  const panel = document.createElement('div');
  panel.id = 'categoriesPanel';
  
  // Получаем категории динамически со страницы
  const categories = getCategoriesFromPage();
  
  panel.innerHTML = `
    <div class="cat-overlay"></div>
    <div class="categories-panel-content">
      <div class="cat-header">
        <h3>📂 Категории</h3>
        <button class="cat-close">&times;</button>
      </div>
      <div class="cat-body">
        ${categories.map(c => `
          <button class="cat-btn" data-cat="${c.value}">
            <span class="cat-icon">${c.icon}</span>
            <span class="cat-name">${c.name}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  addCategoriesPanelStyles();
  document.body.appendChild(panel);
  
  panel.querySelector('.cat-overlay').onclick = closeCategoriesPanel;
  panel.querySelector('.cat-close').onclick = closeCategoriesPanel;
  panel.querySelectorAll('.cat-btn').forEach(btn => {
    btn.onclick = () => selectCategory(btn.dataset.cat);
  });
  
  requestAnimationFrame(() => {
    panel.style.opacity = '1';
    panel.querySelector('.categories-panel-content').style.transform = 'translateY(0)';
  });
}

// Получить категории со страницы
function getCategoriesFromPage() {
  const categories = [];
  const defaultIcons = {
    'все': '🏪',
    'ножницы': '✂️',
    'скотч': '📦',
    'нож': '🔪',
    'корейские': '🇰🇷',
    'часы': '⌚',
    'электроника': '🔌',
    'бытовые': '🏠'
  };
  
  // Получаем категории из кнопок на странице
  const buttons = document.querySelectorAll('.category-btn[data-category]');
  
  buttons.forEach(btn => {
    const value = btn.dataset.category;
    if (!value) return;
    
    // Проверяем, не добавлена ли уже
    if (categories.find(c => c.value === value)) return;
    
    let name = btn.textContent.trim();
    // Убираем эмодзи из начала названия если есть
    name = name.replace(/^[^\w\sа-яёА-ЯЁ]+\s*/, '').trim() || value;
    
    const icon = defaultIcons[value.toLowerCase()] || '📁';
    
    categories.push({ value, name, icon });
  });
  
  // Если кнопок нет - используем стандартные
  if (categories.length === 0) {
    return [
      { value: 'все', name: 'Все товары', icon: '🏪' },
      { value: 'ножницы', name: 'Ножницы', icon: '✂️' },
      { value: 'скотч', name: 'Скотч', icon: '📦' },
      { value: 'нож', name: 'Ножи', icon: '🔪' },
      { value: 'корейские', name: 'Корейские товары', icon: '🇰🇷' },
      { value: 'часы', name: 'Часы', icon: '⌚' },
      { value: 'электроника', name: 'Электроника', icon: '🔌' },
      { value: 'бытовые', name: 'Бытовые техники', icon: '🏠' }
    ];
  }
  
  return categories;
}

function closeCategoriesPanel() {
  const panel = document.getElementById('categoriesPanel');
  if (!panel) return;
  panel.style.opacity = '0';
  const content = panel.querySelector('.categories-panel-content');
  if (content) content.style.transform = 'translateY(100%)';
  setTimeout(() => { panel.style.display = 'none'; }, 300);
  setActiveNavItem('home');
}

function selectCategory(value) {
  const panel = document.getElementById('categoriesPanel');
  if (panel) panel.remove();
  setActiveNavItem('home');
  
  if (typeof filterByCategory === 'function') {
    filterByCategory(value);
  }
  
  // Прокручиваем на самый верх при выборе новой категории
  setTimeout(() => {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }, 100);
}

function addCategoriesPanelStyles() {
  if (document.getElementById('catPanelStyles')) return;
  const s = document.createElement('style');
  s.id = 'catPanelStyles';
  s.textContent = `
    #categoriesPanel {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 9700;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .cat-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
    }
    .categories-panel-content {
      position: absolute;
      bottom: 44px; left: 0; right: 0;
      background: white;
      border-radius: 20px 20px 0 0;
      max-height: 70vh;
      transform: translateY(100%);
      transition: transform 0.3s;
    }
    .cat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      border-radius: 20px 20px 0 0;
    }
    .cat-header h3 { margin: 0; font-size: 18px; }
    .cat-close {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 32px; height: 32px;
      border-radius: 50%;
      font-size: 20px;
      cursor: pointer;
    }
    .cat-body {
      padding: 15px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      max-height: calc(70vh - 60px);
      overflow-y: auto;
    }
    .cat-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 12px 8px;
      border: none;
      background: #f5f5f5;
      border-radius: 10px;
      cursor: pointer;
      color: #333;
    }
    .cat-btn:active { background: #667eea; color: white; }
    .cat-icon { font-size: 24px; }
    .cat-name { font-size: 11px; text-align: center; color: #333; }
  `;
  document.head.appendChild(s);
}
