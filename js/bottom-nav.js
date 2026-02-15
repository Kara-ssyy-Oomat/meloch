// ===========================================
// Модуль нижней навигации (Bottom Navigation Bar)
// Единое меню для ВСЕХ страниц сайта
// ===========================================

(function() {
  'use strict';

  // Не создаём меню если страница загружена внутри iframe
  if (window.parent !== window) {
    return;
  }

  // Удаляем все старые inline .bottom-nav элементы (на случай если остались в HTML)
  function removeOldInlineNavs() {
    document.querySelectorAll('nav.bottom-nav, .bottom-nav').forEach(function(el) {
      if (el.id !== 'bottomNavBar') {
        el.remove();
      }
    });
  }

  // Определяем текущую страницу
  function getCurrentPage() {
    var path = window.location.pathname;
    var page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return page.toLowerCase();
  }

  // Это index.html? (главная страница с товарами)
  function isIndexPage() {
    var page = getCurrentPage();
    return page === 'index.html' || page === '' || page === '/';
  }

  // Определяем активную вкладку по имени страницы
  function getActiveTab() {
    var page = getCurrentPage();
    if (page === 'index.html' || page === '' || page === '/') return 'home';
    if (page === 'cart.html') return 'cart';
    if (page === 'chat.html') return 'chat';
    if (page === 'profile.html') return 'profile';
    // Все admin/agent страницы — профиль (они открываются из профиля)
    return 'profile';
  }

  // ============ СТИЛИ (единые для всех страниц) ============
  function addBottomNavStyles() {
    if (document.getElementById('bottomNavStyles')) return;
    var styles = document.createElement('style');
    styles.id = 'bottomNavStyles';
    styles.textContent = 
      '#bottomNavBar {' +
      '  position: fixed;' +
      '  bottom: 0; left: 0; right: 0;' +
      '  z-index: 99999;' +
      '  background: #fff;' +
      '  display: flex;' +
      '  align-items: center;' +
      '  height: 56px;' +
      '  border-top: 1px solid #eee;' +
      '  box-shadow: 0 -2px 10px rgba(0,0,0,0.08);' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '#bottomNavBar .bnav-main {' +
      '  flex: 1;' +
      '  display: flex;' +
      '  justify-content: space-around;' +
      '  align-items: center;' +
      '  height: 100%;' +
      '}' +
      '#bottomNavBar .bnav-item {' +
      '  flex: 1;' +
      '  background: none;' +
      '  border: none;' +
      '  display: flex;' +
      '  flex-direction: column;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  gap: 3px;' +
      '  height: 100%;' +
      '  cursor: pointer;' +
      '  position: relative;' +
      '  color: #9e9e9e;' +
      '  transition: color 0.2s;' +
      '  touch-action: manipulation;' +
      '  -webkit-tap-highlight-color: transparent;' +
      '  user-select: none;' +
      '  -webkit-user-select: none;' +
      '  padding: 0;' +
      '  text-decoration: none;' +
      '}' +
      '#bottomNavBar .bnav-item:active { background: #f5f5f5; }' +
      '#bottomNavBar .bnav-item.active { color: #4CAF50; }' +
      '#bottomNavBar .bnav-svg {' +
      '  width: 24px;' +
      '  height: 24px;' +
      '  fill: currentColor;' +
      '}' +
      '#bottomNavBar .bnav-text {' +
      '  font-size: 11px;' +
      '  font-weight: 500;' +
      '}' +
      '#bottomNavBar .bnav-badge {' +
      '  position: absolute;' +
      '  top: 6px;' +
      '  right: calc(50% - 16px);' +
      '  background: #e53935;' +
      '  color: white;' +
      '  font-size: 10px;' +
      '  font-weight: 600;' +
      '  min-width: 16px;' +
      '  height: 16px;' +
      '  border-radius: 8px;' +
      '  display: none;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  padding: 0 4px;' +
      '}' +
      'body { padding-bottom: 56px !important; }';
    document.head.appendChild(styles);
  }

  // ============ СОЗДАНИЕ НАВИГАЦИИ ============
  function createBottomNavigation() {
    // Если уже создана — не дублируем
    if (document.getElementById('bottomNavBar')) return;

    // Удаляем любые старые inline навигации
    removeOldInlineNavs();

    var activeTab = getActiveTab();
    var onIndex = isIndexPage();

    var navBar = document.createElement('nav');
    navBar.id = 'bottomNavBar';

    // SVG-иконки
    var icons = {
      home: '<svg class="bnav-svg" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
      categories: '<svg class="bnav-svg" viewBox="0 0 24 24"><path d="M3 5h6v6H3V5zm0 8h6v6H3v-6zm8-8h6v6h-6V5zm0 8h6v6h-6v-6zm8-8h2v6h-2V5zm0 8h2v6h-2v-6z"/></svg>',
      cart: '<svg class="bnav-svg" viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 14.6l.1-.1L8.2 12h7.4c.8 0 1.4-.4 1.7-1l3.9-7-1.7-1-3.9 7H8.5L4.3 2H1v2h2l3.6 7.6-1.4 2.5c-.7 1.3.3 2.9 1.8 2.9h12v-2H7.4c-.1 0-.2-.1-.2-.4z"/></svg>',
      chat: '<svg class="bnav-svg" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>',
      profile: '<svg class="bnav-svg" viewBox="0 0 24 24"><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>'
    };

    if (onIndex) {
      // На index.html — используем кнопки с JS-навигацией (iframe)
      navBar.innerHTML =
        '<div class="bnav-main">' +
          '<button class="bnav-item' + (activeTab === 'home' ? ' active' : '') + '" data-nav="home">' +
            icons.home + '<span class="bnav-text">Главная</span></button>' +
          '<button class="bnav-item' + (activeTab === 'categories' ? ' active' : '') + '" data-nav="categories">' +
            icons.categories + '<span class="bnav-text">Меню</span></button>' +
          '<button class="bnav-item' + (activeTab === 'cart' ? ' active' : '') + '" data-nav="cart">' +
            icons.cart + '<span class="bnav-text">Корзина</span>' +
            '<span id="navCartBadge" class="bnav-badge">0</span></button>' +
          '<button class="bnav-item' + (activeTab === 'chat' ? ' active' : '') + '" data-nav="chat">' +
            icons.chat + '<span class="bnav-text">Чат</span>' +
            '<span id="navChatBadge" class="bnav-badge" style="display:none">!</span></button>' +
          '<button class="bnav-item' + (activeTab === 'profile' ? ' active' : '') + '" data-nav="profile">' +
            icons.profile + '<span class="bnav-text">Профиль</span></button>' +
        '</div>';
    } else {
      // На всех остальных страницах — обычные ссылки <a>
      navBar.innerHTML =
        '<div class="bnav-main">' +
          '<a href="index.html" class="bnav-item' + (activeTab === 'home' ? ' active' : '') + '">' +
            icons.home + '<span class="bnav-text">Главная</span></a>' +
          '<a href="index.html#categories" class="bnav-item' + (activeTab === 'categories' ? ' active' : '') + '">' +
            icons.categories + '<span class="bnav-text">Меню</span></a>' +
          '<a href="cart.html" class="bnav-item' + (activeTab === 'cart' ? ' active' : '') + '">' +
            icons.cart + '<span class="bnav-text">Корзина</span>' +
            '<span id="navCartBadge" class="bnav-badge">0</span></a>' +
          '<a href="chat.html" class="bnav-item' + (activeTab === 'chat' ? ' active' : '') + '">' +
            icons.chat + '<span class="bnav-text">Чат</span></a>' +
          '<a href="profile.html" class="bnav-item' + (activeTab === 'profile' ? ' active' : '') + '">' +
            icons.profile + '<span class="bnav-text">Профиль</span></a>' +
        '</div>';
    }

    addBottomNavStyles();
    document.body.appendChild(navBar);

    // На index.html — привязываем JS-обработчики
    if (onIndex) {
      navBar.querySelector('[data-nav="home"]').addEventListener('click', navGoHome);
      navBar.querySelector('[data-nav="categories"]').addEventListener('click', navGoCategories);
      navBar.querySelector('[data-nav="cart"]').addEventListener('click', navGoCart);
      navBar.querySelector('[data-nav="chat"]').addEventListener('click', navGoChat);
      navBar.querySelector('[data-nav="profile"]').addEventListener('click', navGoProfile);
    }

    // Обновляем badge корзины
    updateNavCounts();
  }

  // ============ НАВИГАЦИЯ (только для index.html) ============
  var _navBusy = false;

  function navGoHome() {
    if (_navBusy) return;
    _navBusy = true; setTimeout(function() { _navBusy = false; }, 300);
    setActiveNavItem('home');
    closePageFrame();
    closeCategoriesPanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navGoCategories() {
    if (_navBusy) return;
    _navBusy = true; setTimeout(function() { _navBusy = false; }, 300);
    closePageFrame();
    setActiveNavItem('categories');
    openCategoriesPanel();
  }

  function navGoCart() {
    if (_navBusy) return;
    _navBusy = true; setTimeout(function() { _navBusy = false; }, 300);
    setActiveNavItem('cart');
    closeCategoriesPanel();
    openPageInFrame('cart.html');
  }

  function navGoChat() {
    if (_navBusy) return;
    _navBusy = true; setTimeout(function() { _navBusy = false; }, 300);
    setActiveNavItem('chat');
    closeCategoriesPanel();
    var badge = document.getElementById('navChatBadge');
    if (badge) badge.style.display = 'none';
    openPageInFrame('chat.html');
  }

  function navGoProfile() {
    if (_navBusy) return;
    _navBusy = true; setTimeout(function() { _navBusy = false; }, 300);
    setActiveNavItem('profile');
    closeCategoriesPanel();
    openPageInFrame('profile.html');
  }

  // ============ IFRAME КЭШИРОВАНИЕ (только для index.html) ============
  var navSavedScrollPos = 0;
  var _frameCache = {};
  var _currentFrameUrl = null;
  var _framesPreloaded = false;

  function openPageInFrame(url) {
    navSavedScrollPos = window.scrollY || window.pageYOffset;

    Object.keys(_frameCache).forEach(function(key) {
      if (key !== url && _frameCache[key]) {
        _frameCache[key].style.display = 'none';
        _frameCache[key].style.pointerEvents = 'none';
      }
    });

    if (_frameCache[url]) {
      _frameCache[url].style.display = 'block';
      _frameCache[url].style.pointerEvents = 'auto';
      _currentFrameUrl = url;
      if (url === 'cart.html') {
        try { _frameCache[url].contentWindow.postMessage('refreshCart', '*'); } catch(e) {}
      }
      return;
    }

    var frame = document.createElement('iframe');
    frame.className = 'page-frame-cached';
    frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:calc(100% - 56px);z-index:99998;border:none;background:#fff;';
    frame.src = url;
    document.body.appendChild(frame);
    _frameCache[url] = frame;
    _currentFrameUrl = url;
  }

  function closePageFrame() {
    Object.keys(_frameCache).forEach(function(key) {
      if (_frameCache[key]) {
        _frameCache[key].style.display = 'none';
        _frameCache[key].style.pointerEvents = 'none';
      }
    });
    _currentFrameUrl = null;

    var oldFrame = document.getElementById('pageFrame');
    if (oldFrame) {
      oldFrame.style.display = 'none';
      oldFrame.src = 'about:blank';
    }

    setTimeout(function() {
      window.scrollTo(0, navSavedScrollPos);
    }, 0);
  }

  function preloadPageFrames() {
    if (_framesPreloaded) return;
    _framesPreloaded = true;
    var pages = ['cart.html', 'chat.html', 'profile.html'];
    var delay = 0;
    pages.forEach(function(url) {
      if (_frameCache[url]) return;
      delay += 1500;
      setTimeout(function() {
        var frame = document.createElement('iframe');
        frame.className = 'page-frame-cached';
        frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:calc(100% - 56px);z-index:99998;border:none;background:#fff;display:none;pointer-events:none;';
        frame.src = url;
        document.body.appendChild(frame);
        _frameCache[url] = frame;
      }, delay);
    });
  }

  // ============ АКТИВНАЯ ВКЛАДКА ============
  function setActiveNavItem(navName) {
    var bar = document.getElementById('bottomNavBar');
    if (!bar) return;
    bar.querySelectorAll('.bnav-item').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-nav') === navName);
    });
  }

  // ============ СЧЁТЧИКИ ============
  function updateNavCounts() {
    var cartBadge = document.getElementById('navCartBadge');
    var cartData = [];
    try { cartData = JSON.parse(localStorage.getItem('cart') || '[]'); } catch(e) {}
    var count = Array.isArray(cartData) ? cartData.length : 0;
    if (cartBadge) {
      cartBadge.textContent = count;
      cartBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  // ============ ПАНЕЛЬ КАТЕГОРИЙ (только index.html) ============
  function openCategoriesPanel() {
    var oldPanel = document.getElementById('categoriesPanel');
    if (oldPanel) oldPanel.remove();

    var panel = document.createElement('div');
    panel.id = 'categoriesPanel';

    var categories = getCategoriesFromPage();
    var buttonsHtml = categories.map(function(c) {
      return '<button class="cat-btn" data-cat="' + c.value + '">' +
        '<span class="cat-icon">' + c.icon + '</span>' +
        '<span class="cat-name">' + c.name + '</span></button>';
    }).join('');

    panel.innerHTML =
      '<div class="cat-overlay"></div>' +
      '<div class="categories-panel-content">' +
        '<div class="cat-header">' +
          '<h3>\ud83d\udcc2 Категории</h3>' +
          '<button class="cat-close">&times;</button>' +
        '</div>' +
        '<div class="cat-body">' + buttonsHtml + '</div>' +
      '</div>';

    addCategoriesPanelStyles();
    document.body.appendChild(panel);

    panel.querySelector('.cat-overlay').onclick = closeCategoriesPanel;
    panel.querySelector('.cat-close').onclick = closeCategoriesPanel;
    panel.querySelectorAll('.cat-btn').forEach(function(btn) {
      btn.onclick = function() { selectCategory(btn.dataset.cat); };
    });

    requestAnimationFrame(function() {
      panel.style.opacity = '1';
      panel.querySelector('.categories-panel-content').style.transform = 'translateY(0)';
    });
  }

  function getCategoriesFromPage() {
    var categories = [];
    var defaultIcons = {
      'все': '\ud83c\udfea', 'ножницы': '\u2702\ufe0f', 'скотч': '\ud83d\udce6', 'нож': '\ud83d\udd2a',
      'корейские': '\ud83c\uddf0\ud83c\uddf7', 'часы': '\u231a', 'электроника': '\ud83d\udd0c', 'бытовые': '\ud83c\udfe0'
    };
    var buttons = document.querySelectorAll('.category-btn[data-category]');
    buttons.forEach(function(btn) {
      var value = btn.dataset.category;
      if (!value || categories.find(function(c) { return c.value === value; })) return;
      var name = btn.textContent.trim().replace(/^[^\w\sа-яёА-ЯЁ]+\s*/, '').trim() || value;
      categories.push({ value: value, name: name, icon: defaultIcons[value.toLowerCase()] || '\ud83d\udcc1' });
    });
    if (categories.length === 0) {
      return [
        { value: 'все', name: 'Все товары', icon: '\ud83c\udfea' },
        { value: 'ножницы', name: 'Ножницы', icon: '\u2702\ufe0f' },
        { value: 'скотч', name: 'Скотч', icon: '\ud83d\udce6' },
        { value: 'нож', name: 'Ножи', icon: '\ud83d\udd2a' }
      ];
    }
    return categories;
  }

  function closeCategoriesPanel() {
    var panel = document.getElementById('categoriesPanel');
    if (!panel) return;
    panel.style.opacity = '0';
    var content = panel.querySelector('.categories-panel-content');
    if (content) content.style.transform = 'translateY(100%)';
    setTimeout(function() { panel.remove(); }, 300);
    setActiveNavItem('home');
  }

  function selectCategory(value) {
    closeCategoriesPanel();
    if (typeof filterByCategory === 'function') {
      filterByCategory(value);
    }
    setTimeout(function() { window.scrollTo(0, 0); }, 100);
  }

  function addCategoriesPanelStyles() {
    if (document.getElementById('catPanelStyles')) return;
    var s = document.createElement('style');
    s.id = 'catPanelStyles';
    s.textContent =
      '#categoriesPanel {' +
      '  position: fixed; top: 0; left: 0; right: 0; bottom: 0;' +
      '  z-index: 99997; opacity: 0; transition: opacity 0.3s;' +
      '}' +
      '.cat-overlay {' +
      '  position: absolute; top: 0; left: 0; right: 0; bottom: 0;' +
      '  background: rgba(0,0,0,0.5);' +
      '}' +
      '.categories-panel-content {' +
      '  position: absolute; bottom: 56px; left: 0; right: 0;' +
      '  background: white; border-radius: 20px 20px 0 0;' +
      '  max-height: 70vh; transform: translateY(100%); transition: transform 0.3s;' +
      '}' +
      '.cat-header {' +
      '  display: flex; justify-content: space-between; align-items: center;' +
      '  padding: 15px 20px; background: linear-gradient(135deg, #667eea, #764ba2);' +
      '  color: white; border-radius: 20px 20px 0 0;' +
      '}' +
      '.cat-header h3 { margin: 0; font-size: 18px; }' +
      '.cat-close {' +
      '  background: rgba(255,255,255,0.2); border: none; color: white;' +
      '  width: 32px; height: 32px; border-radius: 50%; font-size: 20px; cursor: pointer;' +
      '}' +
      '.cat-body {' +
      '  padding: 15px; display: grid; grid-template-columns: repeat(3, 1fr);' +
      '  gap: 10px; max-height: calc(70vh - 60px); overflow-y: auto;' +
      '}' +
      '.cat-btn {' +
      '  display: flex; flex-direction: column; align-items: center; gap: 6px;' +
      '  padding: 12px 8px; border: none; background: #f5f5f5;' +
      '  border-radius: 10px; cursor: pointer; color: #333;' +
      '}' +
      '.cat-btn:active { background: #667eea; color: white; }' +
      '.cat-icon { font-size: 24px; }' +
      '.cat-name { font-size: 11px; text-align: center; }';
    document.head.appendChild(s);
  }

  // ============ ИНИЦИАЛИЗАЦИЯ ============
  // Экспортируем нужные функции глобально
  window.openPageInFrame = openPageInFrame;
  window.closePageFrame = closePageFrame;
  window.setActiveNavItem = setActiveNavItem;
  window.updateNavCounts = updateNavCounts;
  window.closeCategoriesPanel = closeCategoriesPanel;

  // Слушаем события
  window.addEventListener('cartUpdated', updateNavCounts);
  window.addEventListener('storage', function(e) {
    if (e.key === 'cart') updateNavCounts();
  });

  // Слушаем сообщения от iframe
  window.addEventListener('message', function(e) {
    if (e.data === 'cartUpdated') updateNavCounts();
    if (e.data === 'closeIframe') {
      closePageFrame();
      setActiveNavItem('home');
    }
  });

  // Запуск при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      removeOldInlineNavs();
      createBottomNavigation();
      updateNavCounts();
      setInterval(updateNavCounts, 5000);
    });
  } else {
    // DOM уже загружен
    removeOldInlineNavs();
    createBottomNavigation();
    updateNavCounts();
    setInterval(updateNavCounts, 5000);
  }

  // Предзагрузка iframe только на index.html
  if (isIndexPage()) {
    window.addEventListener('load', function() {
      setTimeout(preloadPageFrames, 3000);
    });
  }

})();
