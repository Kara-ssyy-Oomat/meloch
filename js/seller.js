// ===== SELLER MODULE =====
// Функции регистрации/входа продавцов, управление продавцами (админ)

// Текущий залогиненный продавец (перенесено сюда для доступа из других модулей)
// let currentSeller = null; // Объявляется в index.html

// ==================== ОКНО ПРОДАВЦА ====================

function openBecomeSellerWindow() {
  // Закрываем профиль если открыт
  const profileModal = document.getElementById('profileFullscreenModal');
  if (profileModal) profileModal.remove();
  
  setTimeout(() => {
    document.getElementById('becomeSellerWindow').style.display = 'flex';
    if (typeof lockPageScroll === 'function') lockPageScroll();
    history.pushState({ modal: 'becomeSeller' }, '', '');
    
    // Очистка форм
    document.getElementById('sellerName').value = '';
    document.getElementById('sellerPhone').value = '';
    document.getElementById('sellerPassword').value = '';
    document.getElementById('sellerCity').value = '';
    document.getElementById('sellerProducts').value = '';
    document.getElementById('sellerTelegramId').value = '';
    document.getElementById('sellerLoginPhone').value = '';
    document.getElementById('sellerLoginPassword').value = '';
    
    // По умолчанию вкладка регистрации
    switchSellerTab('register');
  }, 100);
}

function closeBecomeSellerWindow() {
  document.getElementById('becomeSellerWindow').style.display = 'none';
  if (typeof unlockPageScroll === 'function') unlockPageScroll();
}

function switchSellerTab(tab) {
  const registerTab = document.getElementById('sellerTabRegister');
  const loginTab = document.getElementById('sellerTabLogin');
  const registerForm = document.getElementById('sellerRegisterForm');
  const loginForm = document.getElementById('sellerLoginForm');
  
  if (tab === 'register') {
    registerTab.style.background = '#333';
    registerTab.style.color = 'white';
    loginTab.style.background = '#f5f5f5';
    loginTab.style.color = '#333';
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  } else {
    loginTab.style.background = '#333';
    loginTab.style.color = 'white';
    registerTab.style.background = '#f5f5f5';
    registerTab.style.color = '#333';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  }
}

// ==================== РЕГИСТРАЦИЯ/ВХОД ====================

// Регистрация продавца
async function registerSeller() {
  const name = document.getElementById('sellerName').value.trim();
  const phone = document.getElementById('sellerPhone').value.trim();
  const password = document.getElementById('sellerPassword').value.trim();
  const city = document.getElementById('sellerCity').value.trim();
  const products = document.getElementById('sellerProducts').value.trim();
  
  if (!name) {
    Swal.fire('Ошибка', 'Введите ваше имя или название компании', 'error');
    return;
  }
  
  if (!phone) {
    Swal.fire('Ошибка', 'Введите телефон для входа', 'error');
    return;
  }
  
  if (!password || password.length < 4) {
    Swal.fire('Ошибка', 'Пароль должен быть минимум 4 символа', 'error');
    return;
  }
  
  if (!city) {
    Swal.fire('Ошибка', 'Укажите ваш город или регион', 'error');
    return;
  }
  
  try {
    document.getElementById('sellerLoader').style.display = 'flex';
    document.getElementById('sellerSubmitBtn').disabled = true;
    
    // Проверяем, не занят ли телефон
    const existingCheck = await db.collection('sellers').where('phone', '==', phone).get();
    if (!existingCheck.empty) {
      document.getElementById('sellerLoader').style.display = 'none';
      document.getElementById('sellerSubmitBtn').disabled = false;
      Swal.fire('Ошибка', 'Этот номер телефона уже зарегистрирован. Используйте вход.', 'error');
      return;
    }
    
    // Получаем Telegram ID
    const telegramId = document.getElementById('sellerTelegramId').value.trim();
    
    // Сохраняем продавца в Firebase
    const sellerData = {
      name: name,
      phone: phone,
      password: password,
      city: city,
      products: products,
      telegramId: telegramId || null,
      registeredAt: new Date().toISOString(),
      createdAt: Date.now(),
      status: 'pending'
    };
    
    const docRef = await db.collection('sellers').add(sellerData);
    
    // Отправляем уведомление в Telegram
    let message = `🏪 *НОВАЯ ЗАЯВКА ПРОДАВЦА*\n\n` +
      `👤 *ФИО/Компания:* ${name}\n` +
      `📱 *Телефон:* ${phone}\n` +
      `📍 *Город/Регион:* ${city}\n` +
      `🏷️ *Товары:* ${products || 'не указаны'}\n\n` +
      `⏳ *Статус:* Ожидает одобрения\n` +
      `🕐 *Дата:* ${new Date().toLocaleString('ru-RU')}`;
    
    fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '5567924440',
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    document.getElementById('sellerLoader').style.display = 'none';
    document.getElementById('sellerSubmitBtn').disabled = false;
    
    closeBecomeSellerWindow();
    
    Swal.fire({
      icon: 'success',
      title: 'Заявка отправлена!',
      html: `<p>Ваша заявка на регистрацию продавца отправлена.</p><p style="color:#666;">После проверки администратором вы сможете войти и добавлять товары.</p>`,
      confirmButtonText: 'Понятно'
    });
    
  } catch (error) {
    document.getElementById('sellerLoader').style.display = 'none';
    document.getElementById('sellerSubmitBtn').disabled = false;
    console.error('Ошибка регистрации продавца:', error);
    Swal.fire('Ошибка', 'Не удалось зарегистрироваться. Попробуйте позже.', 'error');
  }
}

// Вход продавца
async function loginSeller() {
  const phone = document.getElementById('sellerLoginPhone').value.trim();
  const password = document.getElementById('sellerLoginPassword').value.trim();
  
  if (!phone) {
    Swal.fire('Ошибка', 'Введите телефон', 'error');
    return;
  }
  
  if (!password) {
    Swal.fire('Ошибка', 'Введите пароль', 'error');
    return;
  }
  
  try {
    document.getElementById('sellerLoader').style.display = 'flex';
    
    const snapshot = await db.collection('sellers').where('phone', '==', phone).get();
    
    if (snapshot.empty) {
      document.getElementById('sellerLoader').style.display = 'none';
      Swal.fire('Ошибка', 'Продавец с таким телефоном не найден', 'error');
      return;
    }
    
    const sellerDoc = snapshot.docs[0];
    const sellerData = sellerDoc.data();
    
    // Проверка статуса
    if (sellerData.status === 'blocked') {
      document.getElementById('sellerLoader').style.display = 'none';
      Swal.fire({
        icon: 'error',
        title: '🚫 Доступ запрещён',
        text: 'Ваш аккаунт заблокирован администратором. Обратитесь в поддержку.',
        confirmButtonText: 'Понятно'
      });
      return;
    }
    
    if (sellerData.status === 'pending') {
      document.getElementById('sellerLoader').style.display = 'none';
      Swal.fire({
        icon: 'info',
        title: '⏳ Заявка на рассмотрении',
        text: 'Ваша заявка ещё не одобрена администратором. Дождитесь проверки.',
        confirmButtonText: 'Понятно'
      });
      return;
    }
    
    if (sellerData.password !== password) {
      document.getElementById('sellerLoader').style.display = 'none';
      Swal.fire('Ошибка', 'Неверный пароль', 'error');
      return;
    }
    
    // Успешный вход
    currentSeller = { id: sellerDoc.id, ...sellerData };
    localStorage.setItem('currentSeller', JSON.stringify(currentSeller));
    
    userRole = 'seller';
    isAdmin = true;
    
    document.getElementById('sellerLoader').style.display = 'none';
    
    closeBecomeSellerWindow();
    updateSellerMenu();
    renderProducts(); // Обновляем отображение - показываем только товары этого продавца
    
    Swal.fire({
      icon: 'success',
      title: 'Добро пожаловать!',
      text: `Вы вошли как ${sellerData.name}`,
      confirmButtonText: 'OK'
    });
    
  } catch (error) {
    document.getElementById('sellerLoader').style.display = 'none';
    console.error('Ошибка входа продавца:', error);
    Swal.fire('Ошибка', 'Не удалось войти. Попробуйте позже.', 'error');
  }
}

// Выход продавца
function logoutSeller() {
  currentSeller = null;
  localStorage.removeItem('currentSeller');
  userRole = 'guest';
  isEditorMode = false;
  
  // Скрываем кнопку редактора
  const editorBtnContainer = document.getElementById('editorBtnContainer');
  if (editorBtnContainer) editorBtnContainer.style.display = 'none';
  
  // Обновляем кнопку редактора
  const editorModeBtn = document.getElementById('editorModeBtn');
  if (editorModeBtn) {
    editorModeBtn.style.background = 'linear-gradient(135deg, #6c757d, #495057)';
    editorModeBtn.innerHTML = '✏️ Редактор';
  }
  
  renderProducts();
  
  Swal.fire('Выход', 'Вы вышли из аккаунта продавца', 'info');
}

// ==================== НАСТРОЙКИ ПРОДАВЦА ====================

// Настройки уведомлений для продавца
async function openSellerSettingsWindow() {
  
  if (!currentSeller) {
    Swal.fire('Ошибка', 'Вы не авторизованы как продавец', 'error');
    return;
  }
  
  // Получаем актуальные данные продавца из Firebase
  try {
    const sellerDoc = await db.collection('sellers').doc(currentSeller.id).get();
    const sellerData = sellerDoc.exists ? sellerDoc.data() : currentSeller;
    
    const { value: formValues } = await Swal.fire({
      title: '⚙️ Настройки уведомлений',
      html: `
        <div style="text-align:left; padding:10px 0;">
          <label style="display:block; margin-bottom:8px; font-weight:600; color:#333;">Telegram ID для получения заказов:</label>
          <input type="text" id="swal-telegram-id" value="${sellerData.telegramId || ''}" placeholder="Например: 123456789" style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px;  box-sizing:border-box;">
          <p style="margin:8px 0 0; font-size:12px; color:#888;">
            📱 Чтобы узнать свой ID, напишите боту <a href="https://t.me/userinfobot" target="_blank" style="color:#007bff;">@userinfobot</a> в Telegram
          </p>
          <div style="margin-top:15px; padding:12px; background:#e3f2fd; border-radius:8px; border-left:4px solid #2196f3;">
            <p style="margin:0; font-size:13px; color:#1565c0;">
              💡 После указания Telegram ID вы будете получать уведомления о новых заказах, содержащих ваши товары!
            </p>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: '💾 Сохранить',
      cancelButtonText: 'Отмена',
      confirmButtonColor: '#4caf50',
      preConfirm: () => {
        return {
          telegramId: document.getElementById('swal-telegram-id').value.trim()
        };
      }
    });
    
    if (formValues) {
      // Обновляем данные в Firebase
      await db.collection('sellers').doc(currentSeller.id).update({
        telegramId: formValues.telegramId || null
      });
      
      // Обновляем локальные данные
      currentSeller.telegramId = formValues.telegramId || null;
      localStorage.setItem('currentSeller', JSON.stringify(currentSeller));
      
      // Отправляем тестовое сообщение если указан ID
      if (formValues.telegramId) {
        try {
          const testResponse = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: formValues.telegramId,
              text: `✅ Настройки сохранены!\n\n🏪 ${currentSeller.name}, теперь вы будете получать уведомления о заказах ваших товаров на этот аккаунт Telegram.`,
              parse_mode: 'Markdown'
            })
          });
          
          const testData = await testResponse.json();
          if (testData.ok) {
            Swal.fire({
              icon: 'success',
              title: 'Настройки сохранены!',
              html: 'Тестовое сообщение отправлено в ваш Telegram.<br>Проверьте, что оно пришло.',
              confirmButtonText: 'Отлично!'
            });
          } else {
            Swal.fire({
              icon: 'warning',
              title: 'Настройки сохранены',
              html: `Но не удалось отправить тестовое сообщение.<br><br>Проверьте правильность ID и убедитесь, что вы начали диалог с ботом.<br><br>Ошибка: ${testData.description || 'неизвестная'}`,
              confirmButtonText: 'Понятно'
            });
          }
        } catch (err) {
          Swal.fire('Сохранено', 'Настройки сохранены, но не удалось отправить тестовое сообщение', 'warning');
        }
      } else {
        Swal.fire('Сохранено', 'Telegram ID удалён. Вы не будете получать уведомления о заказах.', 'info');
      }
    }
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
    Swal.fire('Ошибка', 'Не удалось сохранить настройки', 'error');
  }
}

// Обновление меню продавца
function updateSellerMenu() {
  if (currentSeller) {
    // Показываем кнопку редактора (чтобы продавец мог включить режим редактирования своих товаров)
    const editorBtnContainer = document.getElementById('editorBtnContainer');
    if (editorBtnContainer) editorBtnContainer.style.display = 'flex';

    console.log('🏪 Продавец активирован:', currentSeller.name);
  }
}

// Панель инструментов продавца (кнопки "Мои товары", "Добавить товар", "Настройки", "Выход")
function showSellerToolbar() {
  // Удаляем старую панель, если есть
  const existing = document.getElementById('sellerToolbar');
  if (existing) existing.remove();

  const toolbar = document.createElement('div');
  toolbar.id = 'sellerToolbar';
  toolbar.style.cssText = 'display:flex; gap:8px; justify-content:center; flex-wrap:wrap; padding:8px 10px; background:linear-gradient(135deg,#e8f5e9,#c8e6c9); border-radius:10px; margin:8px 10px;';
  toolbar.innerHTML = `
    <div style="width:100%; text-align:center; font-size:13px; font-weight:700; color:#2e7d32; margin-bottom:4px;">🏪 Продавец: ${currentSeller.name}</div>
    <button onclick="openSellerAddProduct()" style="flex:1; min-width:120px; background:linear-gradient(135deg,#28a745,#218838); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">➕ Добавить товар</button>
    <button onclick="openMyProductsWindow()" style="flex:1; min-width:120px; background:linear-gradient(135deg,#007bff,#0056b3); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">📦 Мои товары</button>
    <button onclick="openSellerSettingsWindow()" style="flex:1; min-width:80px; background:linear-gradient(135deg,#ff9800,#f57c00); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">⚙️ Настройки</button>
    <button onclick="logoutSeller()" style="flex:1; min-width:80px; background:linear-gradient(135deg,#dc3545,#c82333); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">🚪 Выход</button>
  `;

  // Вставляем после editorBtnContainer или перед productTable
  const editorBtnContainer = document.getElementById('editorBtnContainer');
  const searchContainer = document.querySelector('.search-container');
  if (editorBtnContainer) {
    editorBtnContainer.insertAdjacentElement('afterend', toolbar);
  } else if (searchContainer) {
    searchContainer.insertAdjacentElement('beforebegin', toolbar);
  } else {
    document.body.prepend(toolbar);
  }
}

// Скрыть панель продавца
function hideSellerToolbar() {
  const toolbar = document.getElementById('sellerToolbar');
  if (toolbar) toolbar.remove();
}

// Окно "Мои товары" для продавца
function openMyProductsWindow() {
  if (!currentSeller) {
    Swal.fire('Ошибка', 'Вы не авторизованы как продавец', 'error');
    return;
  }
  
  // Фильтруем товары текущего продавца
  const myProducts = products.filter(p => p.sellerId === currentSeller.id);
  
  let html = `
    <div style="max-height:70vh; overflow-y:auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 style="margin:0;">📦 Ваши товары (${myProducts.length})</h3>
        <button onclick="Swal.close(); setTimeout(() => openSellerAddProduct(), 200);" style="background:linear-gradient(135deg,#28a745,#218838); color:white; border:none; padding:10px 16px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">➕ Добавить</button>
      </div>
  `;
  
  if (myProducts.length === 0) {
    html += `<p style="color:#666; text-align:center; padding:30px;">У вас пока нет товаров.<br>Нажмите «➕ Добавить» чтобы добавить первый товар!</p>`;
  } else {
    myProducts.forEach(p => {
      html += `
        <div style="display:flex; gap:10px; padding:10px; border:1px solid #e0e0e0; border-radius:8px; margin-bottom:10px; align-items:center;">
          <img src="${p.image || 'https://via.placeholder.com/60'}" style="width:60px; height:60px; object-fit:cover; border-radius:6px;">
          <div style="flex:1;">
            <div style="font-weight:600; ">${p.title || 'Без названия'}</div>
            <div style="color:#e53935; font-weight:700;">${p.price || 0} сом</div>
            <div style="font-size:12px; color:#666;">Остаток: ${typeof p.stock === 'number' ? p.stock : '∞'} шт</div>
          </div>
          <button onclick="Swal.close(); setTimeout(() => openEditProductModal('${p.id}'), 200);" style="background:linear-gradient(135deg,#007bff,#0056b3); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:12px;">✏️</button>
        </div>
      `;
    });
  }
  
  html += '</div>';
  
  Swal.fire({
    title: '',
    html: html,
    showConfirmButton: true,
    confirmButtonText: 'Закрыть',
    width: '90%',
    maxWidth: '500px'
  });
}

// Проверка сохранённого продавца при загрузке
function checkSavedSeller() {
  const savedSeller = localStorage.getItem('currentSeller');
  if (savedSeller) {
    try {
      currentSeller = JSON.parse(savedSeller);
      userRole = 'seller';
      isEditorMode = false;
      updateSellerMenu();
      console.log('🏪 Продавец восстановлен:', currentSeller.name);
    } catch (e) {
      localStorage.removeItem('currentSeller');
      currentSeller = null;
    }
  }
}

// Загрузка категорий продавцов из Firebase
async function loadSellerCategories() {
  try {
    const container = document.getElementById('sellerCategoriesContainer');
    if (!container) return;
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Получаем уникальные категории из товаров
    const existingCategories = ['все', 'ножницы', 'скотч', 'нож', 'корейские', 'часы', 'электроника', 'бытовые'];
    const sellerCategories = new Set();
    
    // Собираем категории из товаров продавцов
    products.forEach(p => {
      if (p.category && p.sellerId && !existingCategories.includes(p.category.toLowerCase())) {
        sellerCategories.add(p.category.toLowerCase());
      }
    });
    
    // Также загружаем из коллекции seller_categories
    try {
      const snapshot = await db.collection('seller_categories').get();
      snapshot.forEach(doc => {
        const cat = doc.data();
        if (cat.name && !existingCategories.includes(cat.name.toLowerCase())) {
          sellerCategories.add(cat.name.toLowerCase());
        }
      });
    } catch (e) {
      console.log('Коллекция seller_categories не найдена или пуста');
    }
    
    // Создаём кнопки для каждой категории продавца
    sellerCategories.forEach(catName => {
      const btn = document.createElement('button');
      btn.className = 'category-btn';
      btn.setAttribute('data-category', catName);
      btn.onclick = () => filterByCategory(catName);
      btn.innerHTML = `🏪 ${catName.charAt(0).toUpperCase() + catName.slice(1)}`;
      container.appendChild(btn);
    });
    
  } catch (error) {
    console.error('Ошибка загрузки категорий продавцов:', error);
  }
}

// ==================== УПРАВЛЕНИЕ ПРОДАВЦАМИ ====================
// Функции управления продавцами перенесены в admin-sellers.html

// ==================== ДОБАВЛЕНИЕ ТОВАРА ПРОДАВЦОМ ====================

// Открытие формы добавления товара для продавца
async function openSellerAddProduct() {
  if (!currentSeller) {
    Swal.fire('Ошибка', 'Вы не авторизованы как продавец', 'error');
    return;
  }

  // Гарантируем загрузку категорий перед открытием формы
  if (typeof ensureSellerCategoriesLoaded === 'function') {
    await ensureSellerCategoriesLoaded();
  }

  const categoryOptions = typeof generateCategoryOptions === 'function' ? generateCategoryOptions('все') : '<option value="все">Все товары</option>';

  const { value: formValues } = await Swal.fire({
    title: '➕ Добавить товар',
    html: `
      <div style="text-align:left; max-height:65vh; overflow-y:auto; padding:5px;">
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📷 Фото товара</label>
          <input type="file" id="swal-product-image" accept="image/*" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:8px; box-sizing:border-box; background:white;">
          <div id="swal-image-preview" style="margin-top:8px; text-align:center;"></div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📝 Название *</label>
          <input type="text" id="swal-product-title" placeholder="Название товара" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📁 Категория</label>
          <select id="swal-product-category" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
            ${categoryOptions}
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📄 Описание</label>
          <textarea id="swal-product-desc" rows="3" placeholder="Описание товара..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box; resize:vertical;"></textarea>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1;">
            <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">💵 Цена (сом)</label>
            <input type="number" id="swal-product-price" placeholder="0" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
          <div style="flex:1;">
            <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📦 Остаток (шт)</label>
            <input type="number" id="swal-product-stock" placeholder="Без лимита" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1;">
            <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">💰 Опт. цена</label>
            <input type="number" id="swal-product-optprice" placeholder="0" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
          <div style="flex:1;">
            <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📊 Опт от (шт)</label>
            <input type="number" id="swal-product-optqty" placeholder="0" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1;">
            <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">🔢 Мин. кол-во</label>
            <input type="number" id="swal-product-minqty" value="1" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
          </div>
        </div>
      </div>
    `,
    width: '95%',
    maxWidth: '500px',
    showCancelButton: true,
    confirmButtonText: '💾 Добавить товар',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#28a745',
    didOpen: () => {
      const fileInput = document.getElementById('swal-product-image');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const preview = document.getElementById('swal-image-preview');
              if (preview) {
                preview.innerHTML = '<img src="' + ev.target.result + '" style="max-width:150px; max-height:150px; border-radius:8px; border:2px solid #ddd;">';
              }
            };
            reader.readAsDataURL(file);
          }
        });
      }
    },
    preConfirm: () => {
      const title = document.getElementById('swal-product-title').value.trim();
      if (!title) {
        Swal.showValidationMessage('Введите название товара');
        return false;
      }
      const price = parseFloat(document.getElementById('swal-product-price').value);
      if (!price || price <= 0) {
        Swal.showValidationMessage('Введите цену товара');
        return false;
      }
      return {
        title: title,
        category: document.getElementById('swal-product-category').value,
        description: document.getElementById('swal-product-desc').value.trim(),
        price: price,
        stock: document.getElementById('swal-product-stock').value.trim(),
        optPrice: document.getElementById('swal-product-optprice').value.trim(),
        optQty: document.getElementById('swal-product-optqty').value.trim(),
        minQty: parseInt(document.getElementById('swal-product-minqty').value) || 1,
        imageFile: document.getElementById('swal-product-image').files[0] || null
      };
    }
  });

  if (!formValues) return;

  try {
    Swal.fire({ title: 'Сохранение...', text: 'Добавляем товар...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    let imageUrl = '';
    // Загружаем изображение, если выбрано
    if (formValues.imageFile) {
      if (typeof uploadToFirebaseStorage === 'function') {
        imageUrl = await uploadToFirebaseStorage(formValues.imageFile, 'products');
      }
    }

    const productData = {
      title: formValues.title,
      category: formValues.category,
      description: formValues.description || '',
      price: formValues.price,
      minQty: formValues.minQty,
      image: imageUrl,
      sellerId: currentSeller.id,
      sellerName: currentSeller.name,
      createdAt: Date.now(),
      blocked: false
    };

    // Остаток
    if (formValues.stock !== '') {
      productData.stock = parseInt(formValues.stock);
    }

    // Оптовая цена
    if (formValues.optPrice !== '' && formValues.optQty !== '') {
      productData.optPrice = parseFloat(formValues.optPrice);
      productData.optQty = parseInt(formValues.optQty);
    }

    const docRef = await db.collection('products').add(productData);
    productData.id = docRef.id;

    // Добавляем в локальный массив
    products.push(productData);
    renderProducts();

    Swal.fire({
      icon: 'success',
      title: 'Товар добавлен!',
      text: `«${formValues.title}» успешно добавлен в каталог`,
      confirmButtonText: 'OK'
    });

  } catch (error) {
    console.error('Ошибка добавления товара:', error);
    Swal.fire('Ошибка', 'Не удалось добавить товар: ' + error.message, 'error');
  }
}
