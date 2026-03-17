// ===================================================================
// КЕРБЕН B2B Market — Client Identity & Partner System
// ===================================================================

// ==================== СИСТЕМА УНИКАЛЬНЫХ ID КЛИЕНТОВ ====================

// Генерация или получение уникального ID клиента
let clientId = localStorage.getItem('chatClientId');
let clientName = localStorage.getItem('chatClientName');

// ==================== СИСТЕМА ПАРТНЕРОВ ====================

// Получаем реферальный код из URL (например: ?ref=partner1)
let partnerRef = null;
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.has('ref')) {
  partnerRef = urlParams.get('ref');
  
  // Сохраняем в sessionStorage + localStorage
  const partnerData = {
    name: partnerRef,
    timestamp: Date.now()
  };
  sessionStorage.setItem('partnerData', JSON.stringify(partnerData));
  try {
    localStorage.setItem('partnerData', JSON.stringify(partnerData));
  } catch(e) {}
  
  // Показываем уведомление о партнере
  setTimeout(() => {
    Swal.fire({
      icon: 'info',
      title: 'Добро пожаловать! 🤝',
      html: `Вы перешли по партнерской ссылке <strong>${partnerRef}</strong>.<br><br>Все ваши заказы будут закреплены за этим партнером!`,
      timer: 5000,
      showConfirmButton: true,
      confirmButtonText: 'Понятно'
    });
  }, 1000);
} else {
  // Проверяем есть ли сохраненный партнер
  let savedData = sessionStorage.getItem('partnerData');
  if (!savedData) {
    try { savedData = localStorage.getItem('partnerData'); } catch(e) {}
  }
  
  if (savedData) {
    try {
      const partnerData = JSON.parse(savedData);
      const daysPassed = (Date.now() - partnerData.timestamp) / (1000 * 60 * 60 * 24);
      
      if (daysPassed <= 30) {
        partnerRef = partnerData.name;
      } else {
        sessionStorage.removeItem('partnerData');
        try { localStorage.removeItem('partnerData'); } catch(e) {}
      }
    } catch (e) {
      sessionStorage.removeItem('partnerData');
      try { localStorage.removeItem('partnerData'); } catch(e) {}
    }
  }
}

// Функция для получения текущего партнера (поддержка агентской системы)
function getCurrentPartner() {
  // Сначала проверяем URL параметр ref (агентская ссылка)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      // Сохраняем в localStorage чтобы не потерять при перезагрузке
      localStorage.setItem('referralPartner', ref);
      return ref;
    }
  } catch(e) {}
  
  // Проверяем сохранённого реферального партнера
  try {
    const savedRef = localStorage.getItem('referralPartner');
    if (savedRef) return savedRef;
  } catch(e) {}
  
  // Старая система партнеров (partnerData)
  let savedData = sessionStorage.getItem('partnerData');
  if (!savedData) {
    try { savedData = localStorage.getItem('partnerData'); } catch(e) {}
  }
  if (!savedData) return null;
  
  try {
    const partnerData = JSON.parse(savedData);
    const daysPassed = (Date.now() - partnerData.timestamp) / (1000 * 60 * 60 * 24);
    
    if (daysPassed <= 30) {
      return partnerData.name;
    } else {
      sessionStorage.removeItem('partnerData');
      try { localStorage.removeItem('partnerData'); } catch(e) {}
      return null;
    }
  } catch (e) {
    sessionStorage.removeItem('partnerData');
    try { localStorage.removeItem('partnerData'); } catch(e) {}
    return null;
  }
}

if (!clientId) {
  // Генерируем уникальный ID для нового клиента
  clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('chatClientId', clientId);
  console.log('Создан новый clientId:', clientId);
}

// Привязка рассылочных сообщений (cust_) к chatClientId зарегистрированного клиента
(function migrateBroadcastMessages() {
  try {
    const savedCustomer = localStorage.getItem('customerData');
    if (!savedCustomer || typeof db === 'undefined') return;
    const customer = JSON.parse(savedCustomer);
    if (!customer.id) return;
    
    const custAltId = 'cust_' + customer.id;
    // Проверяем — есть ли сообщения по cust_ ID
    db.collection('chatMessages')
      .where('clientId', '==', custAltId)
      .get()
      .then(snap => {
        if (snap.empty) return;
        // Переносим сообщения на реальный clientId
        const batch = db.batch();
        snap.forEach(doc => {
          batch.update(doc.ref, { clientId: clientId, clientName: customer.name || clientName || 'Клиент' });
        });
        // Также обновляем chatClients: удаляем cust_ и обновляем реальный
        batch.delete(db.collection('chatClients').doc(custAltId));
        batch.set(db.collection('chatClients').doc(clientId), {
          name: customer.name || clientName || 'Клиент',
          lastActive: firebase.firestore.FieldValue.serverTimestamp(),
          hasUnread: false
        }, { merge: true });
        return batch.commit();
      })
      .then(() => {
        // Привязываем chatClientId к customers если ещё не привязан
        if (customer.id && clientId) {
          db.collection('customers').doc(customer.id).update({ chatClientId: clientId }).catch(() => {});
        }
      })
      .catch(e => console.log('Миграция broadcast:', e));
  } catch(e) {}
})();

// Функция запроса имени клиента при первом открытии чата
async function ensureClientName() {
  // Сначала пробуем взять данные из профиля покупателя
  const savedCustomer = localStorage.getItem('customerData');
  if (savedCustomer) {
    try {
      const customer = JSON.parse(savedCustomer);
      if (customer.name) {
        clientName = customer.name;
        localStorage.setItem('chatClientName', customer.name);
        
        // Сохраняем клиента в базе данных
        try {
          if (typeof db !== 'undefined') {
            await db.collection('chatClients').doc(clientId).set({
              name: clientName,
              phone: customer.phone || '',
              lastActive: firebase.firestore.FieldValue.serverTimestamp(),
              hasUnread: false
            }, { merge: true });
            console.log('Клиент из профиля сохранен в чате:', clientName);
          }
        } catch (error) {
          console.error('Ошибка сохранения клиента:', error);
        }
        
        return clientName;
      }
    } catch (e) {
      console.error('Ошибка чтения профиля:', e);
    }
  }
  
  // Если профиля нет - предлагаем войти или представиться
  if (!clientName) {
    const result = await Swal.fire({
      title: 'Для чата нужно войти',
      text: 'Войдите в профиль или представьтесь',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Войти в профиль',
      cancelButtonText: 'Продолжить как гость',
      confirmButtonColor: '#333'
    });
    
    if (result.isConfirmed) {
      // Открываем форму входа
      if (typeof showLoginRegisterForm === 'function') {
        showLoginRegisterForm();
      }
      return null;
    } else {
      // Запрашиваем имя гостя
      const { value: name } = await Swal.fire({
        title: 'Представьтесь, пожалуйста',
        input: 'text',
        inputPlaceholder: 'Введите ваше имя',
        showCancelButton: false,
        allowOutsideClick: false,
        confirmButtonText: 'Продолжить',
        confirmButtonColor: '#333',
        inputValidator: (value) => {
          if (!value) {
            return 'Пожалуйста, введите ваше имя!';
          }
        }
      });
      
      if (name) {
        clientName = name;
        localStorage.setItem('chatClientName', name);
        
        // Сохраняем клиента в базе данных
        try {
          if (typeof db !== 'undefined') {
            await db.collection('chatClients').doc(clientId).set({
              name: clientName,
              lastActive: firebase.firestore.FieldValue.serverTimestamp(),
              hasUnread: false
            });
            console.log('Гость сохранен в базе:', clientName);
          }
        } catch (error) {
          console.error('Ошибка сохранения клиента:', error);
        }
      }
    }
  }
  return clientName;
}

// Обновление активности клиента
async function updateClientActivity() {
  if (typeof db !== 'undefined' && clientId) {
    try {
      await db.collection('chatClients').doc(clientId).set({
        name: clientName || 'Клиент',
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        hasUnread: true
      }, { merge: true });
    } catch (error) {
      console.error('Ошибка обновления активности:', error);
    }
  }
}

// Пароли
const ADMIN_PASSWORD = "13082007"; // Полный админ (синхронизирован с ADMIN_CUSTOMER_DATA в customer-auth.js)
const KOREAN_PASSWORD = "556655"; // Только корейские товары
const APPLIANCES_PASSWORD = "777888"; // Только бытовые техники

// Роль пользователя
let userRole = 'guest'; // 'guest', 'admin', 'korean', 'appliances'

// Текущая выбранная категория (по умолчанию "все" = показываем только мелочь)
let currentCategory = 'все';
