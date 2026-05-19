// ===========================================
// Модуль авторизации клиентов
// ===========================================

// Текущий авторизованный клиент
let currentCustomer = null;

// ==================== ДАННЫЕ АДМИНИСТРАТОРА ====================
// Пароль не хранится в открытом виде. В коде лежит только SHA-256-хеш.
// При входе введённый пароль хешируется и сравнивается с этим значением.
const ADMIN_CUSTOMER_DATA = {
  phone: '0559009860',
  // SHA-256 от настоящего пароля (сам пароль в коде не появляется)
  passwordHash: '974f80606b985a1f8428d58d3eb6df3ba98277734d7bed5263d00256ece33f93',
  name: 'Адахамжон'
};

async function _sha256(text) {
  const buf = new TextEncoder().encode(text || '');
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// =====================================================================
// PBKDF2 — хеширование пароля клиента с «солью» (нормализованный телефон).
// Раньше пароли клиентов лежали в Firestore ОТКРЫТЫМ ТЕКСТОМ — если бы
// атакующий выкачал коллекцию customers, он бы получил все пароли сразу.
// Теперь храним только passwordHash; даже при утечке БД пароли остаются
// неизвлекаемыми (PBKDF2 + соль + 100k итераций ~ 100мс на попытку).
//
// 100 000 итераций — компромисс между безопасностью и временем входа.
// На современном телефоне это ~80-150мс, на ПК ~30-80мс.
// =====================================================================
async function _hashCustomerPassword(password, phoneSalt) {
  if (!password) return '';
  try {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(String(password)),
      { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: enc.encode('kerben_v1:' + (phoneSalt || '')),
      iterations: 100000,
      hash: 'SHA-256'
    }, baseKey, 256);
    return 'pbkdf2$' + Array.from(new Uint8Array(bits))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    console.warn('[Auth] PBKDF2 недоступен, используем SHA-256-fallback:', e && e.message);
    return 'sha256$' + await _sha256(String(password) + ':' + (phoneSalt || ''));
  }
}

// Проверка пароля клиента: совпадает ли passwordHash из БД с хешем
// от введённого пароля. Если в документе только старый «plaintext»
// password — разрешаем вход и одновременно мигрируем в hash.
async function _verifyCustomerPassword(customerData, inputPassword, normalizedPhone) {
  if (!customerData) return { ok: false, needsMigration: false };

  // Современный путь: храним только passwordHash
  if (customerData.passwordHash && typeof customerData.passwordHash === 'string') {
    const candidate = await _hashCustomerPassword(inputPassword, normalizedPhone);
    return { ok: candidate === customerData.passwordHash, needsMigration: false };
  }

  // Legacy: старый клиент с plaintext-паролем. Разрешаем вход, но
  // помечаем для миграции (хеш сохранится после успешного входа).
  if (typeof customerData.password === 'string') {
    return {
      ok: customerData.password === inputPassword,
      needsMigration: true
    };
  }

  return { ok: false, needsMigration: false };
}

// Заменить legacy plaintext-пароль клиента в БД на passwordHash.
// Одновременно (в ОДНОМ update) привязываем firebaseUid — иначе
// строгие rules не пропустят запрос: они требуют либо
// firebaseUid==auth.uid, либо одновременной привязки firebaseUid.
async function _migrateCustomerPasswordToHash(customerId, plaintextPassword, normalizedPhone) {
  if (!customerId || typeof db === 'undefined' || !db) return;
  const passwordHash = await _hashCustomerPassword(plaintextPassword, normalizedPhone);

  let uidToBind = null;
  try {
    if (typeof kerbenWaitForAuth === 'function') await kerbenWaitForAuth();
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const cur = firebase.auth().currentUser;
      if (cur && cur.uid) uidToBind = cur.uid;
    }
  } catch (e) {}

  const update = {
    passwordHash: passwordHash,
    password: firebase.firestore.FieldValue.delete()
  };
  if (uidToBind) update.firebaseUid = uidToBind;
  await db.collection('customers').doc(customerId).update(update);
}

// Привязать документ клиента к Firebase auth.uid.
// Используется отдельно (без миграции пароля) — например, для тех клиентов,
// у кого уже есть passwordHash, но ещё нет firebaseUid (например, новый
// клиент создан до этой защиты).
async function _bindCustomerDocToFirebaseUid(customerId, customerData) {
  if (!customerId || typeof db === 'undefined' || !db) return;
  if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return;
  // Уже привязан — не перезаписываем (иначе любой залогиненный аноним
  // мог бы перепривязать чужой документ к своему uid).
  if (customerData && typeof customerData.firebaseUid === 'string' && customerData.firebaseUid.length > 0) {
    return;
  }
  try {
    if (typeof kerbenWaitForAuth === 'function') {
      await kerbenWaitForAuth();
    }
    const cur = firebase.auth().currentUser;
    if (!cur || !cur.uid) return;
    await db.collection('customers').doc(customerId).update({
      firebaseUid: cur.uid
    });
  } catch (e) {
    // не критично — клиент сможет работать и без привязки
  }
}
// ===============================================================

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  initCustomerAuth();
});

// Вспомогательная функция: сохранить профиль во все хранилища
function _saveCustomerData() {
  if (!currentCustomer) return;
  try { localStorage.setItem('customerData', JSON.stringify(currentCustomer)); } catch(e) {}
  if (window.PersistProfile) window.PersistProfile.save(currentCustomer);
}

// Восстановить профиль из Firestore по телефону (если localStorage очищен)
async function _restoreCustomerFromCloud(cookieData) {
  if (!cookieData || !cookieData.phone) return null;
  if (typeof db === 'undefined' || !db) return null;

  try {
    // Ждём Firebase Auth (чтобы запрос ушёл с auth-токеном — нужно
    // когда rules требуют request.auth != null для customers).
    if (typeof kerbenWaitForAuth === 'function') {
      await kerbenWaitForAuth();
    }
    const normalizedPhone = normalizePhone(cookieData.phone);
    const snapshot = await db.collection('customers')
      .where('phone', '==', normalizedPhone)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data() || {};

    // Если имя есть в cookie и не совпадает с базой, не восстанавливаем
    const cookieName = (cookieData.name || '').trim().toLowerCase();
    const dbName = (data.name || '').trim().toLowerCase();
    if (cookieName && dbName && cookieName !== dbName) return null;

    return {
      id: doc.id,
      name: data.name || cookieData.name || '',
      phone: data.phone || normalizedPhone,
      address: data.address || '',
      createdAt: data.createdAt,
      ordersCount: data.ordersCount || 0,
      totalSpent: data.totalSpent || 0,
      isAdmin: !!data.isAdmin
    };
  } catch (error) {
    console.error('[Auth] Ошибка восстановления из Firestore:', error);
    return null;
  }
}

// Инициализация системы авторизации
function initCustomerAuth() {
  // Используем PersistProfile для надёжного восстановления (localStorage → IndexedDB → cookie)
  if (window.PersistProfile) {
    window.PersistProfile.load(async function(data) {
      if (!data) return;

      if (data._restoredFromCookie) {
        const cloudData = await _restoreCustomerFromCloud(data);
        if (cloudData) {
          _initWithCustomerData(cloudData);
          return;
        }
      }

      _initWithCustomerData(data);
    });
  } else {
    // Fallback: обычный localStorage
    const savedCustomer = localStorage.getItem('customerData');
    if (savedCustomer) {
      try {
        _initWithCustomerData(JSON.parse(savedCustomer));
      } catch (e) {
        localStorage.removeItem('customerData');
      }
    }
  }
}

// Применить загруженные данные клиента
function _initWithCustomerData(data) {
  if (!data || !data.phone) return;
  currentCustomer = data;
  
  // Если данные восстановлены из cookie — нужно перелогиниться полноценно
  if (data._restoredFromCookie) {
    console.log('[Auth] ⚠️ Данные из cookie-бэкапа, авто-логин по телефону...');
    delete currentCustomer._restoredFromCookie;
  }

  // Фоном подвязываем документ клиента к Firebase auth.uid (если ещё нет).
  // Это нужно чтобы новые rules (update только владельцу) пропускали
  // последующие правки профиля у уже залогиненных клиентов.
  if (currentCustomer && currentCustomer.id) {
    _bindCustomerDocToFirebaseUid(currentCustomer.id, currentCustomer)
      .catch(e => console.warn('[Auth] auto-bind firebaseUid failed (не критично):', e && e.message));
  }
  
  updateCustomerUI();
  console.log('👤 Клиент авторизован:', currentCustomer.name);
  
  // Проверяем, является ли клиент админом (по телефону)
  // НЕ активируем админ-режим если уже залогинен продавец
  const hasSavedSeller = !!localStorage.getItem('currentSeller');
  const normalizedPhone = normalizePhone(currentCustomer.phone);
  const adminPhone = normalizePhone(ADMIN_CUSTOMER_DATA.phone);
  
  if (!hasSavedSeller) {
    if (normalizedPhone === adminPhone) {
      currentCustomer.isAdmin = true;
      _saveCustomerData();
      activateAdminMode();
      console.log('🔐 Автоматический вход админа по телефону');
    } else if (currentCustomer.isAdmin) {
      activateAdminMode();
    }
  }
  
  // Убеждаемся что данные сохранены во всех хранилищах
  _saveCustomerData();
}

// Активировать режим администратора
function activateAdminMode() {
  // Устанавливаем глобальные переменные админа
  if (typeof isAdmin !== 'undefined') {
    isAdmin = true;
  } else {
    window.isAdmin = true;
  }
  
  if (typeof userRole !== 'undefined') {
    userRole = 'admin';
  } else {
    window.userRole = 'admin';
  }
  
  // Показываем админ-элементы в интерфейсе
  const managementHeader = document.getElementById('managementHeader');
  if (managementHeader) managementHeader.style.display = 'table-cell';
  
  // Показываем кнопку редактора товаров
  const editorBtnContainer = document.getElementById('editorBtnContainer');
  if (editorBtnContainer) editorBtnContainer.style.display = 'flex';
  
  // ОПТИМИЗАЦИЯ: Загружаем тяжёлые admin-библиотеки (jsPDF, XLSX, Chart.js, EXIF)
  if (typeof loadAdminLibraries === 'function') loadAdminLibraries();
  
  console.log('🔐 Режим администратора активирован');
}

// Проверить, является ли клиент администратором (телефон + хеш пароля)
async function checkIfAdmin(phone, password) {
  const normalizedPhone = normalizePhone(phone);
  const adminPhone = normalizePhone(ADMIN_CUSTOMER_DATA.phone);
  if (normalizedPhone !== adminPhone) return false;
  const hash = await _sha256(password || '');
  return hash === ADMIN_CUSTOMER_DATA.passwordHash;
}

// Открыть окно авторизации/личного кабинета
function openCustomerAccount() {
  if (currentCustomer) {
    // Показываем личный кабинет
    showCustomerDashboard();
  } else {
    // Показываем форму входа/регистрации
    showLoginRegisterForm();
  }
}

// Форма входа/регистрации
function showLoginRegisterForm() {
  Swal.fire({
    title: '👤 Вход в личный кабинет',
    html: `
      <div style="text-align:left;">
        <div id="loginTab" style="margin-bottom:20px;">
          <div style="display:flex; gap:10px; margin-bottom:20px;">
            <button onclick="switchAuthTab('login')" id="tabLoginBtn" style="flex:1; padding:12px; background:#4CAF50; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Вход</button>
            <button onclick="switchAuthTab('register')" id="tabRegisterBtn" style="flex:1; padding:12px; background:#e0e0e0; color:#333; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Регистрация</button>
          </div>
          
          <!-- Форма входа -->
          <div id="loginForm">
            <div style="margin-bottom:15px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">📱 Номер телефона:</label>
              <input type="tel" id="loginPhone" placeholder="+996 XXX XXX XXX" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">🔒 Пароль:</label>
              <input type="password" id="loginPassword" placeholder="Введите пароль" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
          </div>
          
          <!-- Форма регистрации -->
          <div id="registerForm" style="display:none;">
            <div style="margin-bottom:12px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">👤 Ваше имя:</label>
              <input type="text" id="regName" placeholder="Как вас зовут?" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">📱 Номер телефона:</label>
              <input type="tel" id="regPhone" placeholder="+996 XXX XXX XXX" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">📍 Адрес доставки:</label>
              <input type="text" id="regAddress" placeholder="Город, улица, дом" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">🔒 Придумайте пароль:</label>
              <input type="password" id="regPassword" placeholder="Минимум 4 символа" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">🔒 Повторите пароль:</label>
              <input type="password" id="regPassword2" placeholder="Повторите пароль" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
            </div>
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Войти',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#4CAF50',
    width: '400px',
    preConfirm: () => {
      const isLogin = document.getElementById('loginForm').style.display !== 'none';
      
      if (isLogin) {
        const phone = document.getElementById('loginPhone').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!phone) {
          Swal.showValidationMessage('Введите номер телефона');
          return false;
        }
        if (!password) {
          Swal.showValidationMessage('Введите пароль');
          return false;
        }
        
        return { action: 'login', phone, password };
      } else {
        const name = document.getElementById('regName').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const address = document.getElementById('regAddress').value.trim();
        const password = document.getElementById('regPassword').value;
        const password2 = document.getElementById('regPassword2').value;
        
        if (!name) {
          Swal.showValidationMessage('Введите ваше имя');
          return false;
        }
        if (!phone) {
          Swal.showValidationMessage('Введите номер телефона');
          return false;
        }
        if (!password || password.length < 4) {
          Swal.showValidationMessage('Пароль должен быть минимум 4 символа');
          return false;
        }
        if (password !== password2) {
          Swal.showValidationMessage('Пароли не совпадают');
          return false;
        }
        
        return { action: 'register', name, phone, address, password };
      }
    },
    didOpen: () => {
      // Обновляем текст кнопки при переключении табов
      window.switchAuthTab = function(tab) {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const tabLoginBtn = document.getElementById('tabLoginBtn');
        const tabRegisterBtn = document.getElementById('tabRegisterBtn');
        const confirmBtn = Swal.getConfirmButton();
        
        if (tab === 'login') {
          loginForm.style.display = 'block';
          registerForm.style.display = 'none';
          tabLoginBtn.style.background = '#4CAF50';
          tabLoginBtn.style.color = 'white';
          tabRegisterBtn.style.background = '#e0e0e0';
          tabRegisterBtn.style.color = '#333';
          confirmBtn.textContent = 'Войти';
        } else {
          loginForm.style.display = 'none';
          registerForm.style.display = 'block';
          tabRegisterBtn.style.background = '#4CAF50';
          tabRegisterBtn.style.color = 'white';
          tabLoginBtn.style.background = '#e0e0e0';
          tabLoginBtn.style.color = '#333';
          confirmBtn.textContent = 'Зарегистрироваться';
        }
      };
    }
  }).then(async (result) => {
    if (result.isConfirmed && result.value) {
      if (result.value.action === 'login') {
        await loginCustomer(result.value.phone, result.value.password);
      } else {
        await registerCustomer(result.value);
      }
    }
  });
}

// Вход клиента
async function loginCustomer(phone, password) {
  try {
    Swal.fire({
      title: 'Проверка...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    // Ждём Firebase Auth — после новых rules чтение customers требует
    // request.auth != null (включая анонимный auth).
    if (typeof kerbenWaitForAuth === 'function') {
      try { await kerbenWaitForAuth(); } catch (e) {}
    }

    // Нормализуем телефон
    const normalizedPhone = normalizePhone(phone);
    
    // Проверяем, является ли это админом
    const isAdminLogin = await checkIfAdmin(phone, password);
    
    // Ищем клиента в базе
    const snapshot = await db.collection('customers')
      .where('phone', '==', normalizedPhone)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      Swal.fire({
        icon: 'error',
        title: 'Клиент не найден',
        text: 'Проверьте номер телефона или зарегистрируйтесь',
        confirmButtonColor: '#4CAF50'
      });
      return;
    }
    
    const customerDoc = snapshot.docs[0];
    const customerData = customerDoc.data();
    
    // Проверяем пароль:
    // - для админ-телефона авторитетом является SHA-256 хеш (см. checkIfAdmin)
    // - для обычных клиентов — PBKDF2-хеш (passwordHash) ИЛИ legacy plaintext
    //   с автоматической миграцией на хеш при первом успешном входе.
    const _adminPhone = normalizePhone(ADMIN_CUSTOMER_DATA.phone);
    const _isAdminPhoneAttempt = normalizedPhone === _adminPhone;
    let _legacyPasswordToMigrate = false;
    if (_isAdminPhoneAttempt) {
      if (!isAdminLogin) {
        Swal.fire({
          icon: 'error',
          title: 'Неверный пароль',
          text: 'Попробуйте ещё раз',
          confirmButtonColor: '#4CAF50'
        });
        return;
      }
      // Хеш совпал — пропускаем дальше без проверки Firestore-пароля
    } else {
      const verify = await _verifyCustomerPassword(customerData, password, normalizedPhone);
      if (!verify.ok) {
        Swal.fire({
          icon: 'error',
          title: 'Неверный пароль',
          text: 'Попробуйте ещё раз',
          confirmButtonColor: '#4CAF50'
        });
        return;
      }
      _legacyPasswordToMigrate = verify.needsMigration;
    }
    
    // Успешный вход
    currentCustomer = {
      id: customerDoc.id,
      name: customerData.name,
      phone: customerData.phone,
      address: customerData.address || '',
      createdAt: customerData.createdAt,
      isAdmin: isAdminLogin  // Сохраняем флаг админа
    };
    
    // Сохраняем сессию (localStorage + IndexedDB + cookie)
    _saveCustomerData();

    // Миграция legacy plaintext-пароля → PBKDF2-хеш.
    // Вызывается ОДИН раз при первом входе старого клиента после
    // обновления сайта. После этого password в БД удаляется, а
    // passwordHash сохраняется. Если что-то упало — не блокируем вход.
    if (_legacyPasswordToMigrate && !_isAdminPhoneAttempt) {
      _migrateCustomerPasswordToHash(customerDoc.id, password, normalizedPhone)
        .then(() => console.log('[Auth] ✅ password мигрирован в hash:', customerDoc.id))
        .catch(e => console.warn('[Auth] migrate failed (не критично):', e && e.message));
    }

    // Привязываем документ клиента к Firebase auth.uid (если ещё не привязан).
    // Это позволит в Firestore Rules разрешать update только владельцу
    // документа, а не любому посетителю с известным id.
    _bindCustomerDocToFirebaseUid(customerDoc.id, customerData)
      .catch(e => console.warn('[Auth] bind firebaseUid failed:', e && e.message));

    // Если это админ - активируем админ-режим + Firebase Auth
    if (isAdminLogin) {
      activateAdminMode();
      try {
        if (typeof kerbenSignInAsAdmin === 'function') {
          await kerbenSignInAsAdmin(window.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local', password);
          // Запоминаем пароль локально, чтобы при потере Firebase Auth сессии
          // (Safari ITP / перезапуск браузера) сайт мог тихо восстановить её
          // без диалога. Действует 30 дней. Очищается при выходе из аккаунта.
          try { _storeAdminCredentialsLocally(password); } catch (_) {}
        }
      } catch (e) {
        console.warn('[Admin] Firebase Auth не активен:', e && e.message);
        try {
          Swal.fire({
            icon: 'warning',
            title: '⚠️ Админ-вход неполный',
            html: 'Вы вошли локально, но <b>Firebase Auth не подключился</b>.<br><br>'
                + '<b>Что делать:</b><br>'
                + '1. Откройте Firebase Console → Authentication → Users<br>'
                + '2. Удалите <code>admin@kerben.local</code> (если есть)<br>'
                + '3. Вернитесь на сайт, выйдите и войдите снова админом — '
                + 'аккаунт пересоздастся <b>автоматически</b> с правильным паролем.<br><br>'
                + '<small>Подробности ошибки: ' + (e && e.message ? e.message : '—') + '</small>',
            confirmButtonText: 'Понятно',
            confirmButtonColor: '#dc3545'
          });
        } catch (_) {}
      }
    }
    
    // Обновляем UI
    updateCustomerUI();
    
    // Заполняем форму заказа данными клиента
    fillOrderFormWithCustomerData();
    
    Swal.fire({
      icon: 'success',
      title: `Добро пожаловать, ${currentCustomer.name}!`,
      text: 'Вы успешно вошли в личный кабинет',
      timer: 2000,
      showConfirmButton: false
    });
    
  } catch (error) {
    console.error('Ошибка входа:', error);
    Swal.fire('Ошибка', 'Не удалось войти: ' + error.message, 'error');
  }
}

// Регистрация клиента
async function registerCustomer(data) {
  try {
    Swal.fire({
      title: 'Регистрация...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    // Ждём Firebase Auth для возможности чтения customers.
    if (typeof kerbenWaitForAuth === 'function') {
      try { await kerbenWaitForAuth(); } catch (e) {}
    }

    const normalizedPhone = normalizePhone(data.phone);
    
    // Проверяем, не зарегистрирован ли уже этот номер
    const existing = await db.collection('customers')
      .where('phone', '==', normalizedPhone)
      .limit(1)
      .get();
    
    if (!existing.empty) {
      Swal.fire({
        icon: 'warning',
        title: 'Номер уже зарегистрирован',
        text: 'Попробуйте войти с этим номером',
        confirmButtonColor: '#4CAF50'
      });
      return;
    }
    
    // Проверяем, является ли это админом
    const isAdminRegister = await checkIfAdmin(data.phone, data.password);

    // Хешируем пароль PBKDF2 — в БД сохраняем только passwordHash,
    // открытый пароль никогда не покидает клиента.
    const passwordHash = await _hashCustomerPassword(data.password, normalizedPhone);

    // Привязка к Firebase auth.uid (для строгих rules: update только владельцем)
    let _currentUid = null;
    try {
      if (typeof kerbenWaitForAuth === 'function') await kerbenWaitForAuth();
      _currentUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
    } catch (e) {}

    // Создаём клиента
    const customerRef = await db.collection('customers').add({
      name: data.name,
      phone: normalizedPhone,
      address: data.address || '',
      passwordHash: passwordHash,
      createdAt: Date.now(),
      ordersCount: 0,
      totalSpent: 0,
      isAdmin: isAdminRegister,
      firebaseUid: _currentUid || null
    });
    
    // Автоматический вход после регистрации
    currentCustomer = {
      id: customerRef.id,
      name: data.name,
      phone: normalizedPhone,
      address: data.address || '',
      createdAt: Date.now(),
      isAdmin: isAdminRegister  // Сохраняем флаг админа
    };
    
    _saveCustomerData();
    updateCustomerUI();
    fillOrderFormWithCustomerData();
    
    // Если это админ - активируем админ-режим + Firebase Auth
    if (isAdminRegister) {
      activateAdminMode();
      try {
        if (typeof kerbenSignInAsAdmin === 'function') {
          await kerbenSignInAsAdmin(window.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local', data.password);
          try { _storeAdminCredentialsLocally(data.password); } catch (_) {}
        }
      } catch (e) {
        console.warn('[Admin] Firebase Auth не активен:', e && e.message);
      }
    }
    
    Swal.fire({
      icon: 'success',
      title: 'Регистрация успешна!',
      html: `
        <div style="text-align:center;">
          <p>Добро пожаловать, <strong>${data.name}</strong>!</p>
          ${isAdminRegister ? '<p style="color:#28a745; font-weight:bold;">🔐 Вы вошли как администратор!</p>' : ''}
          <p style="color:#666; font-size:14px;">Теперь вы можете отслеживать заказы и получать персональные скидки.</p>
        </div>
      `,
      confirmButtonText: 'Отлично!',
      confirmButtonColor: '#4CAF50'
    });
    
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    Swal.fire('Ошибка', 'Не удалось зарегистрироваться: ' + error.message, 'error');
  }
}

// Автоматическая регистрация после первого заказа
async function autoRegisterAfterOrder(name, phone, address) {
  // Если клиент уже авторизован - открываем профиль для отслеживания заказа
  if (currentCustomer) {
    const trackResult = await Swal.fire({
      icon: 'info',
      title: 'Заказ принят!',
      html: `<p style="color:#666; font-size:14px;">Откройте профиль, чтобы отслеживать статус заказа.</p>`,
      confirmButtonText: 'Открыть профиль',
      showCancelButton: true,
      cancelButtonText: 'Закрыть',
      confirmButtonColor: '#4CAF50',
      allowOutsideClick: false,
      allowEscapeKey: false
    });
    if (trackResult.isConfirmed) {
      if (typeof navGoProfile === 'function') {
        navGoProfile();
      } else {
        showCustomerDashboard();
      }
    }
    return;
  }
  
  try {
    // Ждём Firebase Auth для чтения customers (новые rules требуют isAuthed)
    if (typeof kerbenWaitForAuth === 'function') {
      try { await kerbenWaitForAuth(); } catch (e) {}
    }

    const normalizedPhone = normalizePhone(phone);
    
    // Проверяем, есть ли уже такой клиент
    const existing = await db.collection('customers')
      .where('phone', '==', normalizedPhone)
      .limit(1)
      .get();
    
    if (!existing.empty) {
      // Клиент существует - автоматический вход
      const doc = existing.docs[0];
      currentCustomer = { id: doc.id, ...doc.data() };
      _saveCustomerData();
      updateCustomerUI();
      
      // Проверяем, является ли админом
      if (currentCustomer.isAdmin) {
        activateAdminMode();
      }
      
      // Открываем профиль
      const welcomeResult = await Swal.fire({
        icon: 'success',
        title: 'Добро пожаловать!',
        html: `<p>Рады видеть вас снова, <strong>${currentCustomer.name}</strong>!</p>
               <p style="color:#666; font-size:14px;">Ваш заказ принят. Нажмите "Профиль" чтобы отслеживать заказы.</p>`,
        confirmButtonText: 'Открыть профиль',
        showCancelButton: true,
        cancelButtonText: 'Закрыть',
        confirmButtonColor: '#4CAF50',
        allowOutsideClick: false,
        allowEscapeKey: false
      });
      if (welcomeResult.isConfirmed) {
        // Открываем профиль через навигацию нижнего меню (iframe), а не overlay
        if (typeof navGoProfile === 'function') {
          navGoProfile();
        } else {
          showCustomerDashboard();
        }
      }
      return;
    }
    
    // Генерируем простой пароль (последние 4 цифры телефона)
    const autoPassword = normalizedPhone.slice(-4);
    
    // Проверяем, является ли это админом
    const isAdminRegister = await checkIfAdmin(normalizedPhone, autoPassword);

    // Хеш для авто-зарегистрированного клиента (в БД нет plaintext)
    const passwordHash = await _hashCustomerPassword(autoPassword, normalizedPhone);

    // Привязка к Firebase auth.uid
    let _currentUid = null;
    try {
      if (typeof kerbenWaitForAuth === 'function') await kerbenWaitForAuth();
      _currentUid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
    } catch (e) {}

    // Создаём нового клиента
    const customerRef = await db.collection('customers').add({
      name: name,
      phone: normalizedPhone,
      address: address || '',
      passwordHash: passwordHash,
      createdAt: Date.now(),
      ordersCount: 1, // Уже есть первый заказ
      totalSpent: 0,
      isAdmin: isAdminRegister,
      firebaseUid: _currentUid || null
    });
    
    // Автоматический вход
    currentCustomer = {
      id: customerRef.id,
      name: name,
      phone: normalizedPhone,
      address: address || '',
      createdAt: Date.now(),
      ordersCount: 1,
      isAdmin: isAdminRegister
    };
    
    _saveCustomerData();
    updateCustomerUI();
    
    // Если это админ - активируем админ-режим
    if (isAdminRegister) {
      activateAdminMode();
    }
    
    // Показываем сообщение об автоматической регистрации и открываем профиль
    const regResult = await Swal.fire({
      icon: 'success',
      title: '🎉 Профиль создан!',
      html: `
        <div style="text-align:center;">
          <p>Добро пожаловать, <strong>${name}</strong>!</p>
          <p style="color:#666; font-size:14px;">Ваш профиль создан автоматически.</p>
          <div style="background:#f0f8ff; padding:15px; border-radius:10px; margin:15px 0;">
            <p style="margin:0; font-weight:bold; color:#333;">🔐 Ваш пароль для входа:</p>
            <p style="margin:5px 0 0; font-size:24px; color:#4CAF50; font-weight:bold;">${autoPassword}</p>
            <p style="margin:5px 0 0; font-size:12px; color:#999;">Это последние 4 цифры вашего номера</p>
          </div>
          <p style="color:#666; font-size:13px;">Теперь вы можете отслеживать заказы и получать скидки!</p>
        </div>
      `,
      confirmButtonText: 'Открыть профиль',
      showCancelButton: true,
      cancelButtonText: 'Закрыть',
      confirmButtonColor: '#4CAF50',
      allowOutsideClick: false,
      allowEscapeKey: false
    });
    if (regResult.isConfirmed) {
      // Открываем профиль через навигацию нижнего меню (iframe), а не overlay
      if (typeof navGoProfile === 'function') {
        navGoProfile();
      } else {
        showCustomerDashboard();
      }
    }
    
  } catch (error) {
    console.error('Ошибка автоматической регистрации:', error);
    // Не показываем ошибку пользователю - заказ уже оформлен
  }
}

// Личный кабинет клиента
async function showCustomerDashboard() {
  if (!currentCustomer) {
    showLoginRegisterForm();
    return;
  }
  
  // Удаляем старое окно если есть
  const existingModal = document.getElementById('profileFullscreenModal');
  if (existingModal) existingModal.remove();
  
  // Блокируем прокрутку фона
  if (typeof lockPageScroll === 'function') lockPageScroll();
  
  // Показываем загрузку
  const loadingModal = document.createElement('div');
  loadingModal.id = 'profileFullscreenModal';
  loadingModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:44px;background:#f5f5f5;z-index:99990;display:flex;align-items:center;justify-content:center;overscroll-behavior:contain;';
  loadingModal.innerHTML = '<div style="text-align:center;"><div style="font-size:40px;margin-bottom:10px;">⏳</div><div>Загрузка...</div></div>';
  document.body.appendChild(loadingModal);
  
  // Загружаем заказы клиента из Firebase
  let orders = [];
  let stats = { ordersCount: 0, totalSpent: 0 };
  
  try {
    // Ждём Firebase Auth (после новых rules orders.read требуют isAuthed())
    if (typeof kerbenWaitForAuth === 'function') {
      try { await kerbenWaitForAuth(); } catch (e) {}
    }
    // Запрос без orderBy чтобы избежать необходимости создания индекса
    const ordersSnapshot = await db.collection('orders')
      .where('phone', '==', currentCustomer.phone)
      .limit(100)
      .get();
    
    ordersSnapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    
    // Сортируем на стороне клиента (новые сверху)
    orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Ограничиваем до 50
    orders = orders.slice(0, 50);
    
    // Считаем статистику
    stats.ordersCount = orders.length;
    stats.totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    
  } catch (error) {
    console.error('Ошибка загрузки заказов:', error);
    // Берём из localStorage если Firebase недоступен
    orders = getOrderHistory().filter(o => normalizePhone(o.phone) === currentCustomer.phone);
  }
  
  let ordersHtml = '';
  if (orders.length === 0) {
    ordersHtml = `
      <div style="text-align:center; padding:40px 20px; color:#666;">
        <div style="font-size:60px; margin-bottom:15px;">📦</div>
        <div style="font-size:18px; font-weight:600;">У вас пока нет заказов</div>
        <div style="font-size:14px; margin-top:10px;">Добавьте товары в корзину и оформите первый заказ!</div>
      </div>
    `;
  } else {
    ordersHtml = orders.slice(0, 20).map(order => {
      const date = order.time || new Date(order.timestamp).toLocaleDateString('ru-RU');
      const statusColors = {
        'Новый': '#17a2b8',
        'В обработке': '#ffc107',
        'Доставляется': '#007bff',
        'Доставлен': '#28a745',
        'Выполнен': '#28a745',
        'Отменён': '#dc3545'
      };
      const color = statusColors[order.status] || '#666';
      const itemsCount = order.items ? order.items.length : 0;
      
      return `
        <div style="background:white; border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:0 2px 10px rgba(0,0,0,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-weight:700; color:#333; font-size:15px;">#${order.id ? order.id.slice(-6).toUpperCase() : 'N/A'}</span>
            <span style="font-size:12px; padding:5px 12px; background:${color}; color:white; border-radius:15px; font-weight:600;">${order.status || 'Новый'}</span>
          </div>
          <div style="font-size:14px; color:#666; margin-bottom:5px;">📅 ${date}</div>
          <div style="font-size:14px; color:#666; margin-bottom:8px;">📦 ${itemsCount} товар(ов)</div>
          <div style="font-size:18px; font-weight:700; color:#4CAF50;">${(order.total || 0).toLocaleString()} сом</div>
          <button onclick="showOrderDetails('${order.id}')" style="margin-top:10px; width:100%; padding:10px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border:none; border-radius:8px; cursor:pointer; font-size:14px; color:white; font-weight:600;">
            👁️ Подробнее
          </button>
        </div>
      `;
    }).join('');
    
    if (orders.length > 20) {
      ordersHtml += `<div style="text-align:center; color:#666; padding:15px;">... и ещё ${orders.length - 20} заказ(ов)</div>`;
    }
  }
  
  // Создаём полноэкранное окно
  loadingModal.innerHTML = `
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;background:#f5f5f5;border-radius:0;">
      <!-- Прокручиваемый контент -->
      <div style="flex:1; overflow-y:auto; padding-bottom:20px;">
        <!-- Профиль пользователя -->
        <div style="background:#fff; padding:20px; border-bottom:1px solid #e0e0e0;">
          <div style="display:flex; align-items:center; gap:15px;">
            <div onclick="editCustomerProfile()" style="width:60px; height:60px; background:#f0f0f0; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:28px; cursor:pointer;">
              👤
            </div>
            <div style="flex:1; cursor:pointer;" onclick="editCustomerProfile()">
              <div style="font-size:17px; font-weight:600; color:#333; display:flex; align-items:center; gap:6px;">
                ${currentCustomer.name} <span style="font-size:12px; color:#999;">✎</span>
              </div>
              <div style="font-size:14px; color:#666; margin-top:2px;">${currentCustomer.phone}</div>
            </div>
            <button onclick="event.stopPropagation(); logoutCustomer();" style="background:none; border:1px solid #ddd; color:#666; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:13px; white-space:nowrap;">
              Выйти
            </button>
          </div>
        </div>
        
        <!-- Статистика -->
        <div style="display:flex; gap:1px; background:#e0e0e0; margin:0;">
          <div style="flex:1; background:#fff; padding:20px; text-align:center;">
            <div style="font-size:24px; font-weight:600; color:#333;">${stats.ordersCount}</div>
            <div style="font-size:12px; color:#888; margin-top:4px;">Заказов</div>
          </div>
          <div style="flex:1; background:#fff; padding:20px; text-align:center;">
            <div style="font-size:24px; font-weight:600; color:#333;">${stats.totalSpent.toLocaleString()}</div>
            <div style="font-size:12px; color:#888; margin-top:4px;">Потрачено</div>
          </div>
        </div>
        
        <!-- Меню -->
        <div style="background:#fff; margin-top:10px;">
          <div onclick="openMyOrdersPage()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">📋</span>
              <span style="font-size:15px; color:#333;">Мои заказы</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:13px; color:#888;">${stats.ordersCount}</span>
              <span style="color:#ccc;">›</span>
            </div>
          </div>
          
          <div onclick="openFavoritesFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">❤️</span>
              <span style="font-size:15px; color:#333;">Избранное</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openComplaintWindow()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">⚠️</span>
              <span style="font-size:15px; color:#333;">Жалоба</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openSuggestionWindow()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">💡</span>
              <span style="font-size:15px; color:#333;">Предложить товар</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openAgentProfitFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">💰</span>
              <span style="font-size:15px; color:#333;">Моя прибыль (агент)</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openBecomeSellerWindow()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">🏪</span>
              <span style="font-size:15px; color:#333;">Стать продавцом</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openAdminLoginFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">🔐</span>
              <span style="font-size:15px; color:#333;">Вход для админа</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
        </div>
        
        <!-- Панель администратора (видна только админам) -->
        <div id="adminPanelInProfile" style="display:none; background:#fff; margin-top:10px;">
          <div style="padding:16px 20px; border-bottom:1px solid #f0f0f0;">
            <div style="font-size:15px; font-weight:600; color:#28a745;">🔐 Панель администратора</div>
          </div>
          
          <div onclick="openAddProductFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">➕</span>
              <span style="font-size:15px; color:#333;">Добавить товар</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openOrdersManagementFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">📦</span>
              <span style="font-size:15px; color:#333;">Заказы клиентов</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openPartnersOrdersFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">🤝</span>
              <span style="font-size:15px; color:#333;">Заказы от партнеров</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openAdminChatFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">💬</span>
              <span style="font-size:15px; color:#333;">Чат с клиентами</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openProfitReportFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">💰</span>
              <span style="font-size:15px; color:#333;">Отчет по прибыли</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openSellersManagementFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">🏪</span>
              <span style="font-size:15px; color:#333;">Управление продавцами</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openCategoriesManagementFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">📁</span>
              <span style="font-size:15px; color:#333;">Управление категориями</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openPriceRoundingFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">🔢</span>
              <span style="font-size:15px; color:#333;">Округление цен</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div onclick="openAgentsManagementFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">🤝</span>
              <span style="font-size:15px; color:#333;">Управление агентами</span>
            </div>
            <span style="color:#ccc;">›</span>
          </div>
          
          <div id="boxModeBtnProfile" onclick="toggleBoxPurchaseModeFromProfile()" style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; cursor:pointer; background: ${typeof boxPurchaseMode !== 'undefined' && boxPurchaseMode ? 'linear-gradient(135deg, #2e7d32, #4caf50)' : 'linear-gradient(135deg, #757575, #9e9e9e)'};">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:18px;">📦</span>
              <span style="font-size:15px; color:#fff;">${typeof boxPurchaseMode !== 'undefined' && boxPurchaseMode ? 'По коробкам: ВКЛ' : 'По коробкам: ВЫКЛ'}</span>
            </div>
            <span style="color:#fff;">⟳</span>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Сохраняем заказы для отображения
  window._customerOrders = orders;
  
  // Показываем админ-панель если пользователь - админ
  setTimeout(() => showAdminPanelInProfile(), 100);
}

// Открыть избранное из профиля
function openFavoritesFromProfile() {
  // Закрываем профиль
  const profileModal = document.getElementById('profileFullscreenModal');
  if (profileModal) profileModal.remove();
  
  // Открываем страницу избранного
  if (typeof openFavoritesPage === 'function') {
    openFavoritesPage();
  } else if (typeof showFavorites === 'function') {
    showFavorites();
  }
}

// Открыть прибыль агента из профиля
function openAgentProfitFromProfile() {
  // Закрываем профиль
  const profileModal = document.getElementById('profileFullscreenModal');
  if (profileModal) profileModal.remove();
  
  // Открываем окно прибыли агента
  if (typeof openAgentProfitModal === 'function') {
    openAgentProfitModal();
  } else if (typeof openAgentModal === 'function') {
    // Если агент не авторизован, откроется окно входа
    openAgentModal();
  }
}

// Открыть окно входа для админа из профиля
function openAdminLoginFromProfile() {
  Swal.fire({
    title: '🔐 Вход для администратора',
    html: `
      <div style="text-align:left;">
        <div style="margin-bottom:15px;">
          <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">🔒 Пароль администратора:</label>
          <input type="password" id="adminPasswordInput" placeholder="Введите пароль" style="width:100%; padding:14px; border:2px solid #ddd; border-radius:10px; font-size:16px; box-sizing:border-box;">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Войти',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#28a745',
    preConfirm: () => {
      const password = document.getElementById('adminPasswordInput').value;
      if (!password) {
        Swal.showValidationMessage('Введите пароль');
        return false;
      }
      return password;
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      const password = result.value;
      
      // Проверяем пароль через SHA-256 хеш (открытого пароля в коде нет)
      const inputHash = await _sha256(password);
      if (inputHash === ADMIN_CUSTOMER_DATA.passwordHash) {
        // Проверяем, совпадает ли телефон текущего пользователя с телефоном админа
        if (!currentCustomer) {
          Swal.fire({
            title: '❌ Доступ запрещён',
            text: 'Вы не авторизованы. Войдите в аккаунт администратора.',
            icon: 'error',
            confirmButtonColor: '#dc3545'
          });
          return;
        }
        
        const userPhone = normalizePhone(currentCustomer.phone);
        const adminPhone = normalizePhone(ADMIN_CUSTOMER_DATA.phone);
        
        if (userPhone !== adminPhone) {
          // Телефон не совпадает с админом - отклоняем
          Swal.fire({
            title: '❌ Доступ запрещён',
            text: 'Ваши данные не совпадают с данными администратора. Доступ запрещён.',
            icon: 'error',
            confirmButtonColor: '#dc3545'
          });
          return;
        }
        
        // Телефон и пароль совпали - успешный вход админа
        currentCustomer.isAdmin = true;
        _saveCustomerData();
        
        activateAdminMode();

        // FIREBASE AUTH: если у админа в Firebase Auth есть email-аккаунт
        // (admin@kerben.local) с ТЕМ ЖЕ паролем — войти под ним.
        // Это даёт `request.auth.token.email` в правилах и закрывает доступ
        // к чувствительным коллекциям только админу.
        try {
          if (typeof kerbenSignInAsAdmin === 'function') {
            await kerbenSignInAsAdmin(window.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local', password);
            try { _storeAdminCredentialsLocally(password); } catch (_) {}
          }
        } catch (e) {
          console.warn('[Admin] Firebase Auth не активен:', e && e.message);
          try {
            Swal.fire({
              icon: 'warning',
              title: '⚠️ Админ-вход неполный',
              html: 'Вы вошли локально, но <b>Firebase Auth не подключился</b>.<br><br>'
                  + '<b>Что делать:</b><br>'
                  + '1. Откройте Firebase Console → Authentication → Users<br>'
                  + '2. Удалите <code>admin@kerben.local</code> (если есть)<br>'
                  + '3. Вернитесь на сайт, выйдите и войдите снова админом — '
                  + 'аккаунт пересоздастся <b>автоматически</b> с правильным паролем.<br><br>'
                  + '<small>Подробности ошибки: ' + (e && e.message ? e.message : '—') + '</small>',
              confirmButtonText: 'Понятно',
              confirmButtonColor: '#dc3545'
            });
          } catch (_) {}
        }
        
        Swal.fire({
          title: '✅ Успешный вход',
          text: 'Вы вошли как администратор!',
          icon: 'success',
          confirmButtonColor: '#28a745',
          timer: 1500,
          showConfirmButton: false
        }).then(() => {
          // Обновляем профиль
          showCustomerDashboard();
        });
      } else {
        Swal.fire({
          title: '❌ Ошибка',
          text: 'Неверный пароль администратора',
          icon: 'error',
          confirmButtonColor: '#dc3545'
        });
      }
    }
  });
}

// ==================== ФУНКЦИИ АДМИН-ПАНЕЛИ ИЗ ПРОФИЛЯ ====================

function closeProfileAndRun(callback) {
  const profileModal = document.getElementById('profileFullscreenModal');
  if (profileModal) {
    profileModal.remove();
    if (typeof unlockPageScroll === 'function') unlockPageScroll();
  }
  if (typeof callback === 'function') callback();
}

function openAddProductFromProfile() {
  closeProfileAndRun(() => {
    if (typeof openAddProductWindow === 'function') openAddProductWindow();
  });
}

function openOrdersManagementFromProfile() {
  closeProfileAndRun(() => {
    if (typeof openOrdersManagementWindow === 'function') openOrdersManagementWindow();
  });
}

function openPartnersOrdersFromProfile() {
  closeProfileAndRun(() => {
    if (typeof openPartnersOrdersWindow === 'function') openPartnersOrdersWindow();
  });
}

function openAdminChatFromProfile() {
  closeProfileAndRun(() => {
    if (typeof openAdminChatWindow === 'function') openAdminChatWindow();
  });
}

function openProfitReportFromProfile() {
  closeProfileAndRun(() => {
    window.location.href = 'admin-profit.html';
  });
}

function openSellersManagementFromProfile() {
  closeProfileAndRun(() => {
    window.location.href = 'admin-sellers.html';
  });
}

function openCategoriesManagementFromProfile() {
  closeProfileAndRun(() => {
    window.location.href = 'admin-categories.html';
  });
}

function openPriceRoundingFromProfile() {
  closeProfileAndRun(() => {
    window.location.href = 'admin-rounding.html';
  });
}

function openAgentsManagementFromProfile() {
  closeProfileAndRun(() => {
    if (typeof openAgentsManagement === 'function') openAgentsManagement();
  });
}

// Переключение режима "По коробкам" из профиля
function toggleBoxPurchaseModeFromProfile() {
  if (typeof toggleBoxPurchaseMode === 'function') {
    toggleBoxPurchaseMode();
  }
  // Обновляем кнопку в профиле
  const btn = document.getElementById('boxModeBtnProfile');
  if (btn) {
    const isOn = typeof boxPurchaseMode !== 'undefined' && boxPurchaseMode;
    btn.style.background = isOn ? 'linear-gradient(135deg, #2e7d32, #4caf50)' : 'linear-gradient(135deg, #757575, #9e9e9e)';
    const spanEl = btn.querySelector('span:nth-child(2)');
    if (spanEl) spanEl.textContent = isOn ? 'По коробкам: ВКЛ' : 'По коробкам: ВЫКЛ';
  }
}

// Показать админ-панель в профиле если пользователь - админ
function showAdminPanelInProfile() {
  const adminPanel = document.getElementById('adminPanelInProfile');
  if (!adminPanel) return;
  
  // Проверяем несколько условий для показа админ-панели
  const isAdminGlobal = typeof isAdmin !== 'undefined' && isAdmin && typeof userRole !== 'undefined' && userRole === 'admin';
  const isAdminCustomer = currentCustomer && currentCustomer.isAdmin;
  
  if (isAdminGlobal || isAdminCustomer) {
    adminPanel.style.display = 'block';
    
    // Также активируем админ-режим если ещё не активирован
    if (isAdminCustomer && !isAdminGlobal) {
      activateAdminMode();
    }
  }
}

// ==================== КОНЕЦ ФУНКЦИЙ АДМИН-ПАНЕЛИ ====================

// Открыть страницу заказов
function openMyOrdersPage() {
  const orders = window._customerOrders || [];
  
  let ordersHtml = '';
  if (orders.length === 0) {
    ordersHtml = `
      <div style="text-align:center; padding:60px 20px; color:#999;">
        <div style="font-size:48px; margin-bottom:15px;">📦</div>
        <div style="font-size:16px;">У вас пока нет заказов</div>
      </div>
    `;
  } else {
    ordersHtml = orders.map(order => {
      const date = order.time || new Date(order.timestamp).toLocaleDateString('ru-RU');
      const statusColors = {
        'Новый': '#2196F3',
        'В обработке': '#FF9800',
        'Доставляется': '#9C27B0',
        'Доставлен': '#4CAF50',
        'Выполнен': '#4CAF50',
        'Отменён': '#f44336'
      };
      const color = statusColors[order.status] || '#666';
      const itemsCount = order.items ? order.items.length : 0;
      
      return `
        <div onclick="showOrderDetails('${order.id}')" style="background:#fff; padding:15px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:14px; font-weight:600; color:#333;">#${order.id ? order.id.slice(-6).toUpperCase() : 'N/A'}</span>
            <span style="font-size:11px; padding:4px 8px; background:${color}; color:white; border-radius:4px;">${order.status || 'Новый'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:13px; color:#888;">${date} · ${itemsCount} товар(ов)</div>
            <div style="font-size:15px; font-weight:600; color:#333;">${(order.total || 0).toLocaleString()} с</div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // Создаём окно заказов
  const ordersModal = document.createElement('div');
  ordersModal.id = 'ordersFullscreenModal';
  ordersModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:44px;background:#f5f5f5;z-index:9550;display:flex;flex-direction:column;';
  ordersModal.innerHTML = `
    <!-- Шапка -->
    <div style="background:#fff; padding:15px 20px; border-bottom:1px solid #e0e0e0; display:flex; align-items:center; gap:15px; flex-shrink:0;">
      <button onclick="closeOrdersModal()" style="background:none; border:none; color:#333; font-size:20px; cursor:pointer; padding:5px;">←</button>
      <div style="font-size:17px; font-weight:600; color:#333;">Мои заказы</div>
    </div>
    
    <!-- Список заказов -->
    <div style="flex:1; overflow-y:auto; background:#fff; padding-bottom:20px;">
      ${ordersHtml}
    </div>
  `;
  
  document.body.appendChild(ordersModal);
  if (typeof lockPageScroll === 'function') lockPageScroll();
}

// Закрыть окно заказов
function closeOrdersModal() {
  const modal = document.getElementById('ordersFullscreenModal');
  if (modal) {
    modal.remove();
    if (typeof unlockPageScroll === 'function') unlockPageScroll();
  }
}

// Закрыть окно профиля
function closeProfileModal() {
  const modal = document.getElementById('profileFullscreenModal');
  if (modal) {
    modal.remove();
    if (typeof unlockPageScroll === 'function') unlockPageScroll();
  }
}

// Уровни клиентов (отключены)
function getCustomerLevel(totalSpent) {
  // Система уровней отключена
  return { name: 'Клиент', icon: '👤', color: '#4CAF50', discount: 0 };
}

// Показать детали заказа
async function showOrderDetails(orderId) {
  try {
    let order = null;
    
    // Пробуем загрузить из Firebase
    try {
      const doc = await db.collection('orders').doc(orderId).get();
      if (doc.exists) {
        order = { id: doc.id, ...doc.data() };
      }
    } catch (e) {
      // Ищем в localStorage
      const history = getOrderHistory();
      order = history.find(o => o.id === orderId);
    }
    
    if (!order) {
      Swal.fire('Ошибка', 'Заказ не найден', 'error');
      return;
    }
    
    const date = order.time || new Date(order.timestamp).toLocaleDateString('ru-RU');
    const statusColors = {
      'Новый': '#17a2b8',
      'В обработке': '#ffc107',
      'Доставляется': '#007bff',
      'Доставлен': '#28a745',
      'Выполнен': '#28a745',
      'Отменён': '#dc3545'
    };
    const color = statusColors[order.status] || '#666';
    
    let itemsHtml = '';
    if (order.items && order.items.length > 0) {
      itemsHtml = order.items.map(item => `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;">
          <div style="flex:1;">
            <div style="font-weight:500;">${item.title}${item.variant ? ` (${item.variant})` : ''}</div>
            <div style="font-size:12px; color:#666;">${item.qty} × ${item.price} сом</div>
          </div>
          <div style="font-weight:600; color:#333;">${item.qty * item.price} сом</div>
        </div>
      `).join('');
    }
    
    Swal.fire({
      title: `Заказ #${orderId.slice(-6).toUpperCase()}`,
      html: `
        <div style="text-align:left;">
          <div style="margin-bottom:15px; padding:10px; background:#f8f9fa; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:#666;">Статус:</span>
              <span style="padding:4px 12px; background:${color}; color:white; border-radius:12px; font-size:13px;">${order.status || 'Новый'}</span>
            </div>
            <div style="margin-top:8px; color:#666; font-size:13px;">📅 ${date}</div>
            <div style="margin-top:5px; color:#666; font-size:13px;">📍 ${order.address || 'Не указан'}</div>
          </div>
          
          <div style="font-weight:600; margin-bottom:10px;">Товары:</div>
          <div style="max-height:200px; overflow-y:auto;">
            ${itemsHtml}
          </div>
          
          <div style="margin-top:15px; padding-top:15px; border-top:2px solid #4CAF50; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:16px; font-weight:600;">Итого:</span>
            <span style="font-size:20px; font-weight:700; color:#4CAF50;">${(order.total || 0).toLocaleString()} сом</span>
          </div>
        </div>
      `,
      confirmButtonText: 'Закрыть',
      confirmButtonColor: '#4CAF50',
      showCancelButton: order.status === 'Новый',
      cancelButtonText: '❌ Отменить заказ',
      cancelButtonColor: '#dc3545'
    }).then(async (result) => {
      if (result.dismiss === Swal.DismissReason.cancel && order.status === 'Новый') {
        // Отмена заказа
        const confirm = await Swal.fire({
          title: 'Отменить заказ?',
          text: 'Это действие нельзя отменить',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Да, отменить',
          cancelButtonText: 'Нет',
          confirmButtonColor: '#dc3545'
        });
        
        if (confirm.isConfirmed) {
          try {
            await db.collection('orders').doc(orderId).update({ status: 'cancelled' });
            Swal.fire('Заказ отменён', '', 'success');
            showCustomerDashboard(); // Обновляем список
          } catch (e) {
            Swal.fire('Ошибка', 'Не удалось отменить заказ', 'error');
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Ошибка загрузки заказа:', error);
    Swal.fire('Ошибка', 'Не удалось загрузить детали заказа', 'error');
  }
}

// Редактирование профиля
function editCustomerProfile() {
  if (!currentCustomer) return;
  
  Swal.fire({
    title: '✏️ Редактировать профиль',
    html: `
      <div style="text-align:left;">
        <div style="margin-bottom:15px;">
          <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">👤 Имя:</label>
          <input type="text" id="editName" value="${currentCustomer.name}" style="width:100%; padding:12px; border:2px solid #ddd; border-radius:8px; font-size:16px; box-sizing:border-box;">
        </div>
        <div style="margin-bottom:15px;">
          <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">📍 Адрес доставки:</label>
          <input type="text" id="editAddress" value="${currentCustomer.address || ''}" style="width:100%; padding:12px; border:2px solid #ddd; border-radius:8px; font-size:16px; box-sizing:border-box;">
        </div>
        <div style="padding:10px; background:#fff3e0; border-radius:8px; font-size:13px; color:#e65100;">
          💡 Номер телефона нельзя изменить, так как он используется для входа
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Сохранить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#4CAF50',
    preConfirm: () => {
      const name = document.getElementById('editName').value.trim();
      const address = document.getElementById('editAddress').value.trim();
      
      if (!name) {
        Swal.showValidationMessage('Введите имя');
        return false;
      }
      
      return { name, address };
    }
  }).then(async (result) => {
    if (result.isConfirmed && result.value) {
      try {
        // Привязка к Firebase auth.uid (для новых rules: update только владельцу)
        try {
          await _bindCustomerDocToFirebaseUid(currentCustomer.id, currentCustomer);
        } catch (e) {}

        // Обновляем в Firebase
        await db.collection('customers').doc(currentCustomer.id).update({
          name: result.value.name,
          address: result.value.address
        });
        
        // Обновляем локально
        currentCustomer.name = result.value.name;
        currentCustomer.address = result.value.address;
        _saveCustomerData();
        
        updateCustomerUI();
        fillOrderFormWithCustomerData();
        
        Swal.fire({
          icon: 'success',
          title: 'Профиль обновлён!',
          timer: 1500,
          showConfirmButton: false
        }).then(() => {
          showCustomerDashboard();
        });
        
      } catch (error) {
        console.error('Ошибка обновления:', error);
        Swal.fire('Ошибка', 'Не удалось обновить профиль', 'error');
      }
    }
  });
}

// Выход из аккаунта
function logoutCustomer() {
  Swal.fire({
    title: 'Выйти из аккаунта?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Да, выйти',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  }).then((result) => {
    if (result.isConfirmed) {
      currentCustomer = null;
      // Удаляем из всех хранилищ (localStorage + IndexedDB + cookie)
      if (window.PersistProfile) window.PersistProfile.remove();
      try { localStorage.removeItem('customerData'); } catch(e) {}
      // Стираем сохранённый локально пароль админа (если был) — важно для
      // безопасности: пользователь явно «вышел», устройство может быть общим.
      try {
        if (typeof window.kerbenClearStoredAdminCreds === 'function') {
          window.kerbenClearStoredAdminCreds();
        }
      } catch(e) {}
      // Выходим из Firebase Auth и возвращаемся к анонимному пользователю.
      try {
        if (typeof kerbenSignOut === 'function') kerbenSignOut();
      } catch(e) {}

      // Сбрасываем флаги администратора
      if (typeof isAdmin !== 'undefined') {
        window.isAdmin = false;
      }
      if (typeof userRole !== 'undefined') {
        window.userRole = 'guest';
      }
      
      // Скрываем админ-элементы в интерфейсе
      const managementHeader = document.getElementById('managementHeader');
      if (managementHeader) managementHeader.style.display = 'none';
      
      const editorBtnContainer = document.getElementById('editorBtnContainer');
      if (editorBtnContainer) editorBtnContainer.style.display = 'none';
      
      // Закрываем окно профиля если открыто
      const profileModal = document.getElementById('profileFullscreenModal');
      if (profileModal) profileModal.remove();
      
      updateCustomerUI();
      
      Swal.fire({
        icon: 'success',
        title: 'Вы вышли из аккаунта',
        timer: 1500,
        showConfirmButton: false
      });
    }
  });
}

// Обновление UI для авторизованного/неавторизованного клиента
function updateCustomerUI() {
  const accountBtn = document.getElementById('customerAccountBtn');
  const menuAccountBtn = document.getElementById('menuCustomerAccountBtn');
  
  if (currentCustomer) {
    // Авторизован
    if (accountBtn) {
      accountBtn.innerHTML = `👤 ${currentCustomer.name.split(' ')[0]}`;
      accountBtn.style.background = 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)';
    }
    if (menuAccountBtn) {
      menuAccountBtn.innerHTML = `
        <span style="font-size:20px;">👤</span>
        <span>Мой кабинет (${currentCustomer.name.split(' ')[0]})</span>
      `;
      menuAccountBtn.style.background = 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)';
    }
  } else {
    // Не авторизован
    if (accountBtn) {
      accountBtn.innerHTML = '👤 Войти';
      accountBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
    if (menuAccountBtn) {
      menuAccountBtn.innerHTML = `
        <span style="font-size:20px;">👤</span>
        <span>Войти / Регистрация</span>
      `;
      menuAccountBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  }
}

// Заполнение формы заказа данными клиента
function fillOrderFormWithCustomerData() {
  if (!currentCustomer) return;
  
  const nameInput = document.getElementById('name');
  const phoneInput = document.getElementById('phone');
  const addressInput = document.getElementById('address');
  
  if (nameInput && !nameInput.value) nameInput.value = currentCustomer.name;
  if (phoneInput && !phoneInput.value) phoneInput.value = currentCustomer.phone;
  if (addressInput && !addressInput.value && currentCustomer.address) addressInput.value = currentCustomer.address;
}

// Нормализация телефона
function normalizePhone(phone) {
  // Убираем всё кроме цифр и +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Если начинается с 0, заменяем на +996
  if (normalized.startsWith('0')) {
    normalized = '+996' + normalized.substring(1);
  }
  
  // Если нет +, добавляем
  if (!normalized.startsWith('+')) {
    if (normalized.startsWith('996')) {
      normalized = '+' + normalized;
    } else {
      normalized = '+996' + normalized;
    }
  }
  
  return normalized;
}

// =====================================================================
// АВТОМАТИЧЕСКОЕ ВОССТАНОВЛЕНИЕ АДМИН-СЕССИИ FIREBASE AUTH
//
// Проблема: на iOS Safari (и иногда на десктопе) Firebase Auth «забывает»
// админ-сессию через несколько часов или после перезапуска браузера.
// Без этой сессии правила Firestore блокируют любые изменения заказов:
// админ видит «Ошибка / Не удалось сохранить изменения» через какое-то
// время после успешного входа.
//
// Решение: после первого успешного входа админа сохраняем пароль в
// localStorage в обфусцированном виде (НЕ открытый текст — простой XOR
// от поверхностного взгляда; настоящая защита — PIN/Face ID устройства).
// При потере Firebase Auth сессии сайт ТИХО восстанавливает её, не
// дёргая админа диалогами. Так пароль вводится один раз на 30 дней.
//
// Использование в админ-страницах:
//   const ok = await kerbenReAuthAdminIfNeeded();
//   if (!ok) return; // не админ или восстановление не удалось
// =====================================================================

const _ADMIN_CREDS_KEY = 'kerbenAdminCreds_v1';
const _ADMIN_CREDS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

// Обфускация — НЕ настоящее шифрование. Защищает только от случайного
// взгляда в DevTools → Application → Local Storage. От настоящей атаки
// защищает PIN/Face ID/Touch ID устройства + домен GitHub Pages (HTTPS).
function _obfuscatePassword(text) {
  try {
    const key = 'kerben_admin_local_obfusc_2026';
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(unescape(encodeURIComponent(out)));
  } catch (e) { return null; }
}

function _deobfuscatePassword(b64) {
  try {
    const key = 'kerben_admin_local_obfusc_2026';
    const text = decodeURIComponent(escape(atob(b64)));
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return out;
  } catch (e) { return null; }
}

function _storeAdminCredentialsLocally(password) {
  try {
    const obf = _obfuscatePassword(password);
    if (!obf) return;
    localStorage.setItem(_ADMIN_CREDS_KEY, JSON.stringify({
      p: obf, ts: Date.now()
    }));
  } catch (e) {}
}

function _getStoredAdminPassword() {
  try {
    const raw = localStorage.getItem(_ADMIN_CREDS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.p || !data.ts) return null;
    if (Date.now() - data.ts > _ADMIN_CREDS_TTL_MS) {
      localStorage.removeItem(_ADMIN_CREDS_KEY);
      return null;
    }
    return _deobfuscatePassword(data.p);
  } catch (e) { return null; }
}

window.kerbenClearStoredAdminCreds = function () {
  try { localStorage.removeItem(_ADMIN_CREDS_KEY); } catch (e) {}
};

window.kerbenReAuthAdminIfNeeded = async function () {
  if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
    return false;
  }
  const adminEmail = (window.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local').toLowerCase();
  try {
    const fbUser = firebase.auth().currentUser;
    if (fbUser && fbUser.email && fbUser.email.toLowerCase() === adminEmail) {
      return true; // Уже админ — ничего делать не нужно
    }
  } catch (e) {}

  // Проверяем, есть ли в localStorage пометка «я админ» с тем же телефоном.
  // Если её нет — значит это не админ, ничего не показываем.
  let isAdminLocally = false;
  try {
    const saved = localStorage.getItem('currentCustomer');
    if (saved) {
      const data = JSON.parse(saved);
      const adminPhoneNorm = normalizePhone(ADMIN_CUSTOMER_DATA.phone);
      if (data && data.isAdmin && normalizePhone(data.phone || '') === adminPhoneNorm) {
        isAdminLocally = true;
      }
    }
  } catch (e) {}
  if (!isAdminLocally) return false;

  // 1) ТИХИЙ ВХОД: пробуем восстановить сессию через сохранённый ранее
  // пароль. Если получилось — админ даже не заметит, что сессия истекла.
  const storedPassword = _getStoredAdminPassword();
  if (storedPassword) {
    try {
      if (typeof kerbenSignInAsAdmin === 'function') {
        await kerbenSignInAsAdmin(
          window.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local',
          storedPassword
        );
        console.log('[Admin] сессия Firebase Auth тихо восстановлена из сохранённого пароля');
        return true;
      }
    } catch (e) {
      // Пароль больше не подходит (например, пересоздали аккаунт в Console).
      // Чистим сохранённое, чтобы при следующем входе пересохранилось.
      console.warn('[Admin] сохранённый пароль не подошёл:', e && e.message);
      try { window.kerbenClearStoredAdminCreds(); } catch (_) {}
    }
  }

  // 2) Тихий путь не сработал — спрашиваем пароль вручную (один раз)
  let password;
  try {
    const res = await Swal.fire({
      title: '🔐 Подтвердите пароль админа',
      html: 'Сайт запомнит вас на этом устройстве на 30 дней.<br>'
          + '<small>Пароль хранится <b>только в этом браузере</b>, '
          + 'не отправляется на сервер.</small>',
      input: 'password',
      inputAttributes: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' },
      showCancelButton: true,
      confirmButtonText: 'Запомнить меня',
      cancelButtonText: 'Отмена',
      confirmButtonColor: '#28a745',
      allowOutsideClick: false,
      inputValidator: (val) => { if (!val) return 'Введите пароль'; }
    });
    if (!res.isConfirmed) return false;
    password = res.value;
  } catch (e) { return false; }

  try {
    const inputHash = await _sha256(password);
    if (inputHash !== ADMIN_CUSTOMER_DATA.passwordHash) {
      Swal.fire('Ошибка', 'Неверный пароль администратора', 'error');
      return false;
    }
  } catch (e) {
    Swal.fire('Ошибка', 'Не удалось проверить пароль', 'error');
    return false;
  }

  try {
    if (typeof kerbenSignInAsAdmin !== 'function') {
      throw new Error('kerbenSignInAsAdmin недоступен (js/auth.js не загружен?)');
    }
    await kerbenSignInAsAdmin(window.KERBEN_ADMIN_AUTH_EMAIL || 'admin@kerben.local', password);
    // Запоминаем пароль локально, чтобы дальше входить тихо без диалогов.
    _storeAdminCredentialsLocally(password);
    Swal.fire({
      icon: 'success',
      title: 'Сессия восстановлена',
      text: 'Запомнили вас на 30 дней',
      timer: 1500,
      showConfirmButton: false
    });
    return true;
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'Не удалось войти в Firebase Auth',
      html: (e && e.message ? e.message : 'Неизвестная ошибка')
          + '<br><br><small>Если ошибка повторится: удалите admin@kerben.local '
          + 'в Firebase Console → Authentication → Users и войдите ещё раз — '
          + 'аккаунт пересоздастся автоматически.</small>',
      confirmButtonColor: '#dc3545'
    });
    return false;
  }
};

// Обновление статистики клиента после заказа
async function updateCustomerStats(total) {
  if (!currentCustomer) return;
  
  try {
    // Сначала подвязываем документ к firebaseUid (если ещё не привязан).
    // Без этого новые rules не пропустят update — требуется чтобы
    // owner == auth.uid. Делаем await чтобы запрос статистики ушёл уже
    // после привязки.
    try {
      await _bindCustomerDocToFirebaseUid(currentCustomer.id, currentCustomer);
    } catch (e) {}

    await db.collection('customers').doc(currentCustomer.id).update({
      ordersCount: firebase.firestore.FieldValue.increment(1),
      totalSpent: firebase.firestore.FieldValue.increment(total),
      lastOrderAt: Date.now()
    });
  } catch (error) {
    console.error('Ошибка обновления статистики клиента:', error);
  }
}
