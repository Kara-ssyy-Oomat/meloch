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
      password: password, // В реальном приложении нужно хешировать!
      city: city,
      products: products,
      telegramId: telegramId || null, // Для получения уведомлений о заказах
      registeredAt: new Date().toISOString(),
      status: 'active'
    };
    
    const docRef = await db.collection('sellers').add(sellerData);
    
    // Отправляем уведомление в Telegram
    let message = `🏪 *НОВЫЙ ПРОДАВЕЦ ЗАРЕГИСТРИРОВАЛСЯ*\n\n` +
      `👤 *ФИО/Компания:* ${name}\n` +
      `📱 *Телефон:* ${phone}\n` +
      `📍 *Город/Регион:* ${city}\n` +
      `🏷️ *Товары:* ${products || 'не указаны'}\n\n` +
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
    
    // Автоматически входим
    currentSeller = { id: docRef.id, ...sellerData };
    localStorage.setItem('currentSeller', JSON.stringify(currentSeller));
    
    // Устанавливаем роль
    userRole = 'seller';
    isAdmin = true; // Даём права на добавление товаров
    
    document.getElementById('sellerLoader').style.display = 'none';
    document.getElementById('sellerSubmitBtn').disabled = false;
    
    closeBecomeSellerWindow();
    updateSellerMenu();
    renderProducts(); // Обновляем отображение - показываем только товары этого продавца
    
    Swal.fire({
      icon: 'success',
      title: 'Добро пожаловать!',
      html: `Вы зарегистрированы как продавец!<br><br>Теперь вы можете добавлять свои товары через меню.`,
      confirmButtonText: 'Начать работу'
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
    
    // Проверка блокировки
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
  isAdmin = false;
  
  // Скрываем меню продавца
  document.getElementById('menuSellerLoggedIn').style.display = 'none';
  document.getElementById('menuAdminLogin').style.display = 'flex';
  
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
    document.getElementById('menuAdminLogin').style.display = 'none';
    document.getElementById('menuAdminLoggedIn').style.display = 'none';
    document.getElementById('menuKoreanManager').style.display = 'none';
    document.getElementById('menuAppliancesManager').style.display = 'none';
    document.getElementById('menuSellerLoggedIn').style.display = 'flex';
    document.getElementById('sellerDisplayName').textContent = currentSeller.name;
  }
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
      <h3 style="margin-bottom:15px;">📦 Ваши товары (${myProducts.length})</h3>
  `;
  
  if (myProducts.length === 0) {
    html += `<p style="color:#666; text-align:center; padding:30px;">У вас пока нет товаров.<br>Добавьте первый товар!</p>`;
  } else {
    myProducts.forEach(p => {
      html += `
        <div style="display:flex; gap:10px; padding:10px; border:1px solid #e0e0e0; border-radius:8px; margin-bottom:10px; align-items:center;">
          <img src="${p.image || 'https://via.placeholder.com/60'}" style="width:60px; height:60px; object-fit:cover; border-radius:6px;">
          <div style="flex:1;">
            <div style="font-weight:600; ">${p.title || 'Без названия'}</div>
            <div style="color:#e53935; font-weight:700;">${p.price || 0} сом</div>
            <div style="font-size:12px; color:#666;">Остаток: ${p.stock || 0} шт</div>
          </div>
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
      isAdmin = true;
      updateSellerMenu();
      // Товары будут отфильтрованы при следующем вызове renderProducts
    } catch (e) {
      localStorage.removeItem('currentSeller');
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
