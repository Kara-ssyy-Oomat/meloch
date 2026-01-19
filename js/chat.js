// ===== CHAT MODULE =====
// Чат с продавцом, уведомления, жалобы и предложения

// Переключение видимости окна чата
async function toggleChat() {
  const chatWindow = document.getElementById('chatWindow');
  
  if (chatWindow.style.display === 'none' || !chatWindow.style.display) {
    // СНАЧАЛА запрашиваем имя клиента
    await ensureClientName();
    
    chatWindow.style.display = 'flex';
    lockPageScroll(); // Блокируем скролл
    resetChatBadge(); // Сбрасываем счетчик при открытии
    
    // Отображаем имя клиента в заголовке
    updateClientNameDisplay();
    
    // Загружаем сообщения для этого клиента
    await loadChatMessages();
    
    // Прокрутка к последнему сообщению
    setTimeout(() => {
      const messagesDiv = document.getElementById('chatMessages');
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 100);
  } else {
    chatWindow.style.display = 'none';
    unlockPageScroll(); // Разблокируем скролл
  }
}

// Обновление отображения имени клиента в заголовке
function updateClientNameDisplay() {
  const nameDisplay = document.getElementById('clientNameDisplay');
  if (nameDisplay && clientName) {
    nameDisplay.innerHTML = `
      <span>👤 ${clientName}</span>
      <span style="opacity:0.7; font-size:11px;">• ID: ${clientId.substring(7, 15)}</span>
    `;
  }
}

// Изменение имени клиента
async function changeClientName() {
  const { value: newName } = await Swal.fire({
    title: 'Изменить имя',
    input: 'text',
    inputLabel: 'Введите новое имя',
    inputValue: clientName || '',
    showCancelButton: true,
    confirmButtonText: 'Сохранить',
    cancelButtonText: 'Отмена',
    inputValidator: (value) => {
      if (!value) {
        return 'Пожалуйста, введите имя!';
      }
    }
  });
  
  if (newName && newName !== clientName) {
    clientName = newName;
    localStorage.setItem('chatClientName', newName);
    
    // Обновляем имя в базе данных
    try {
      if (typeof db !== 'undefined') {
        await db.collection('chatClients').doc(clientId).update({
          name: newName,
          lastActive: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Обновляем имя в заголовке
        updateClientNameDisplay();
        
        Swal.fire({
          icon: 'success',
          title: 'Имя изменено!',
          text: `Теперь вы: ${newName}`,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
      }
    } catch (error) {
      console.error('Ошибка обновления имени:', error);
      Swal.fire('Ошибка', 'Не удалось обновить имя', 'error');
    }
  }
}

// Отправка сообщения от клиента
async function sendChatMessage() {
  // Проверяем имя клиента
  await ensureClientName();
  
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  const messagesDiv = document.getElementById('chatMessages');
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  // Добавляем сообщение клиента
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = 'background:#667eea; color:white; padding:12px; border-radius:12px 12px 4px 12px; max-width:80%; align-self:flex-end; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
  messageDiv.innerHTML = `
    <div style="">${escapeHtml(message)}</div>
    <div style="font-size:11px; opacity:0.9; margin-top:4px; text-align:right;">Вы • ${timeStr}</div>
  `;
  messagesDiv.appendChild(messageDiv);
  
  // Сохраняем сообщение в Firebase с clientId
  await saveChatMessage(message, 'client', now);
  
  // Очищаем поле ввода
  input.value = '';
  
  // Прокручиваем к последнему сообщению
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  // Показываем уведомление "печатает..."
  showTypingIndicator();
}

// Показать индикатор "печатает..."
function showTypingIndicator() {
  const messagesDiv = document.getElementById('chatMessages');
  const typingDiv = document.createElement('div');
  typingDiv.id = 'typingIndicator';
  typingDiv.style.cssText = 'background:white; padding:12px; border-radius:12px 12px 12px 4px; max-width:80%; align-self:flex-start; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
  typingDiv.innerHTML = `
    <div style=" color:#666;">
      <span style="animation:blink 1.4s infinite;">.</span>
      <span style="animation:blink 1.4s infinite 0.2s;">.</span>
      <span style="animation:blink 1.4s infinite 0.4s;">.</span>
    </div>
  `;
  messagesDiv.appendChild(typingDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  // Добавляем стили анимации если их еще нет
  if (!document.getElementById('chatAnimationStyle')) {
    const style = document.createElement('style');
    style.id = 'chatAnimationStyle';
    style.textContent = `
      @keyframes blink {
        0%, 60%, 100% { opacity: 0; }
        30% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Сохранение сообщения в Firebase
async function saveChatMessage(text, sender, timestamp) {
  if (typeof db === 'undefined') return;
  
  try {
    const messageData = {
      text: text,
      sender: sender, // 'client' или 'admin'
      clientId: clientId, // Уникальный ID клиента
      clientName: clientName || 'Клиент',
      timestamp: firebase.firestore.Timestamp.fromDate(timestamp),
      read: false
    };
    
    await db.collection('chatMessages').add(messageData);
    console.log('Сообщение сохранено с clientId:', clientId);
    
    // Обновляем активность клиента
    if (sender === 'client') {
      await updateClientActivity();
    }
  } catch (error) {
    console.error('Ошибка сохранения сообщения:', error);
  }
}

// Загрузка сообщений из Firebase (только для текущего клиента)
async function loadChatMessages() {
  if (typeof db === 'undefined') return;
  
  // Запрашиваем имя при первом открытии
  await ensureClientName();
  
  try {
    // Загружаем только сообщения текущего клиента
    const querySnapshot = await db.collection('chatMessages')
      .where('clientId', '==', clientId)
      .get();
    
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML = ''; // Очищаем
    
    if (querySnapshot.empty) {
      // Показываем приветственное сообщение
      messagesDiv.innerHTML = `
        <div style="background:white; padding:12px; border-radius:12px 12px 12px 4px; max-width:80%; align-self:flex-start; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <div style=" color:#333;">Здравствуйте, ${clientName}! Чем могу помочь?</div>
          <div style="font-size:11px; color:#999; margin-top:4px;">Продавец • только что</div>
        </div>
      `;
    } else {
      // Сортируем сообщения по времени вручную
      const messages = [];
      querySnapshot.forEach((doc) => {
        const msg = doc.data();
        messages.push({
          text: msg.text,
          sender: msg.sender,
          timestamp: msg.timestamp.toDate()
        });
      });
      
      // Сортируем по timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);
      
      // Добавляем в UI
      messages.forEach(msg => {
        addChatMessageToUI(msg.text, msg.sender, msg.timestamp);
      });
    }
    
    // Прокрутка к последнему сообщению
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Подписываемся на новые сообщения
    subscribeToChatMessages();
  } catch (error) {
    console.error('Ошибка загрузки сообщений:', error);
  }
}

// Добавление сообщения в UI
function addChatMessageToUI(text, sender, timestamp) {
  const messagesDiv = document.getElementById('chatMessages');
  const timeStr = timestamp.getHours().toString().padStart(2, '0') + ':' + timestamp.getMinutes().toString().padStart(2, '0');
  
  const messageDiv = document.createElement('div');
  
  if (sender === 'client') {
    messageDiv.style.cssText = 'background:#667eea; color:white; padding:12px; border-radius:12px 12px 4px 12px; max-width:80%; align-self:flex-end; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
    messageDiv.innerHTML = `
      <div style="">${escapeHtml(text)}</div>
      <div style="font-size:11px; opacity:0.9; margin-top:4px; text-align:right;">Вы • ${timeStr}</div>
    `;
  } else {
    messageDiv.style.cssText = 'background:white; padding:12px; border-radius:12px 12px 12px 4px; max-width:80%; align-self:flex-start; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
    messageDiv.innerHTML = `
      <div style=" color:#333;">${escapeHtml(text)}</div>
      <div style="font-size:11px; color:#999; margin-top:4px;">Продавец • ${timeStr}</div>
    `;
  }
  
  messagesDiv.appendChild(messageDiv);
}

// Подписка на новые сообщения в реальном времени (только для текущего клиента)
function subscribeToChatMessages() {
  if (typeof db === 'undefined') return;
  
  db.collection('chatMessages')
    .where('clientId', '==', clientId) // Только сообщения текущего клиента
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          // Если сообщение от админа и чат закрыт, показываем уведомление
          if (msg.sender === 'admin' && msg.clientId === clientId) {
            const chatWindow = document.getElementById('chatWindow');
            if (chatWindow.style.display === 'none' || !chatWindow.style.display) {
              showChatNotification();
            }
            // Убираем индикатор "печатает..."
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
              typingIndicator.remove();
            }
            // Добавляем новое сообщение
            addChatMessageToUI(msg.text, msg.sender, msg.timestamp.toDate());
            // Прокрутка
            const messagesDiv = document.getElementById('chatMessages');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        }
      });
    });
}

// Показать уведомление о новом сообщении
function showChatNotification() {
  // Увеличиваем счетчик непрочитанных
  const chatBtn = document.querySelector('[onclick="toggleChat()"]');
  let badge = document.getElementById('chatBadge');
  if (!badge && chatBtn) {
    badge = document.createElement('span');
    badge.id = 'chatBadge';
    badge.style.cssText = 'position:absolute; top:-5px; right:-5px; background:#ff3b30; color:white; border-radius:50%; width:20px; height:20px; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center; animation:pulse 1s infinite;';
    badge.textContent = '1';
    chatBtn.style.position = 'relative';
    chatBtn.appendChild(badge);
  } else if (badge) {
    badge.textContent = parseInt(badge.textContent || '0') + 1;
  }
  
  // Воспроизводим звук уведомления
  playChatNotificationSound();
  
  // Показываем визуальное всплывающее уведомление
  showVisualNotification();
  
  // Браузерное уведомление (если разрешено)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Новое сообщение от продавца', {
      body: 'У вас есть новое сообщение в чате',
      icon: 'photo_5294190093549636589_y.jpg',
      tag: 'chat-message',
      requireInteraction: false
    });
  }
}

// Звук уведомления
function playChatNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log('Звук уведомления недоступен:', error);
  }
}

// Визуальное всплывающее уведомление
function showVisualNotification() {
  const notification = document.createElement('div');
  notification.style.cssText = 'position:fixed; top:20px; right:20px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; padding:16px 20px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.3); z-index:10003; animation:slideInRight 0.3s ease-out; cursor:pointer; max-width:300px;';
  notification.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px;">💬 Новое сообщение</div>
    <div style="font-size:13px; opacity:0.9;">Продавец ответил вам</div>
  `;
  
  notification.onclick = () => {
    toggleChat();
    notification.remove();
  };
  
  document.body.appendChild(notification);
  
  // Автоматически убираем через 5 секунд
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Сброс счетчика при открытии чата
function resetChatBadge() {
  const badge = document.getElementById('chatBadge');
  if (badge) {
    badge.remove();
  }
}

// ===== COMPLAINT FUNCTIONS =====

// Открыть окно жалобы
function openComplaintWindow() {
  toggleSideMenu(); // Закрываем меню
  
  setTimeout(() => {
    document.getElementById('complaintWindow').style.display = 'flex';
    lockPageScroll(); // Блокируем скролл
    
    // Очищаем форму
    document.getElementById('complaintName').value = '';
    document.getElementById('complaintPhone').value = '';
    document.getElementById('complaintCategory').value = '';
    document.getElementById('complaintText').value = '';
  }, 300);
}

// Закрыть окно жалобы
function closeComplaintWindow() {
  document.getElementById('complaintWindow').style.display = 'none';
  unlockPageScroll(); // Разблокируем скролл
}

// Отправить жалобу в Telegram
async function sendComplaint() {
  const name = document.getElementById('complaintName').value.trim();
  const phone = document.getElementById('complaintPhone').value.trim();
  const category = document.getElementById('complaintCategory').value;
  const text = document.getElementById('complaintText').value.trim();
  
  // Валидация
  if (!name) {
    Swal.fire('Ошибка', 'Введите ваше имя', 'error');
    return;
  }
  
  if (!phone) {
    Swal.fire('Ошибка', 'Введите номер телефона', 'error');
    return;
  }
  
  if (!category) {
    Swal.fire('Ошибка', 'Выберите категорию жалобы', 'error');
    return;
  }
  
  if (!text) {
    Swal.fire('Ошибка', 'Опишите проблему', 'error');
    return;
  }
  
  const categoryNames = {
    'quality': '🔴 Качество товара',
    'delivery': '🚚 Проблемы с доставкой',
    'service': '👤 Обслуживание',
    'price': '💰 Неверная цена',
    'other': '📝 Другое'
  };
  
  const message = `⚠️ *ЖАЛОБА ОТ КЛИЕНТА*\n\n` +
    `👤 *Имя:* ${name}\n` +
    `📱 *Телефон:* ${phone}\n` +
    `📂 *Категория:* ${categoryNames[category]}\n\n` +
    `📝 *Описание проблемы:*\n${text}\n\n` +
    `🕐 *Дата:* ${new Date().toLocaleString('ru-RU')}`;
  
  try {
    Swal.fire({
      title: 'Отправка жалобы...',
      text: 'Пожалуйста, подождите',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    const response = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: '5567924440',
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      closeComplaintWindow();
      Swal.fire({
        icon: 'success',
        title: 'Жалоба отправлена!',
        text: 'Мы рассмотрим вашу жалобу и свяжемся с вами в ближайшее время',
        confirmButtonText: 'Понятно'
      });
    } else {
      throw new Error('Ошибка отправки');
    }
    
  } catch (error) {
    console.error('Ошибка отправки жалобы:', error);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Не удалось отправить жалобу. Попробуйте позже или свяжитесь с нами по телефону.'
    });
  }
}

// ===== SUGGESTION FUNCTIONS =====

// Функции окна предложения товара
function openSuggestionWindow() {
  toggleSideMenu();
  
  setTimeout(() => {
    document.getElementById('suggestionWindow').style.display = 'flex';
    lockPageScroll(); // Блокируем скролл
    
    // Очистка формы
    document.getElementById('suggestionName').value = '';
    document.getElementById('suggestionPhone').value = '';
    document.getElementById('suggestionProductName').value = '';
    document.getElementById('suggestionCurrentPrice').value = '';
    document.getElementById('suggestionPrice').value = '';
    document.getElementById('suggestionDescription').value = '';
    document.getElementById('suggestionPhoto').value = '';
  }, 300);
}

function closeSuggestionWindow() {
  document.getElementById('suggestionWindow').style.display = 'none';
  unlockPageScroll(); // Разблокируем скролл
}

async function sendSuggestion() {
  const name = document.getElementById('suggestionName').value.trim();
  const phone = document.getElementById('suggestionPhone').value.trim();
  const productName = document.getElementById('suggestionProductName').value.trim();
  const currentPrice = document.getElementById('suggestionCurrentPrice').value.trim();
  const price = document.getElementById('suggestionPrice').value.trim();
  const description = document.getElementById('suggestionDescription').value.trim();
  const photoInput = document.getElementById('suggestionPhoto');
  
  if (!name) {
    Swal.fire('Ошибка', 'Введите ваше имя', 'error');
    return;
  }
  
  if (!phone) {
    Swal.fire('Ошибка', 'Введите телефон', 'error');
    return;
  }
  
  if (!productName) {
    Swal.fire('Ошибка', 'Укажите название товара', 'error');
    return;
  }
  
  if (!description) {
    Swal.fire('Ошибка', 'Опишите товар подробнее', 'error');
    return;
  }
  
  try {
    // Показываем спиннер в окне
    document.getElementById('suggestionLoader').style.display = 'flex';
    document.getElementById('suggestionSubmitBtn').disabled = true;
    
    let message = `💡 *ПРЕДЛОЖЕНИЕ ТОВАРА*\n\n` +
      `👤 *Имя клиента:* ${name}\n` +
      `📱 *Телефон:* ${phone}\n` +
      `🏷️ *Название товара:* ${productName}\n` +
      `💵 *Текущая цена:* ${currentPrice ? currentPrice + ' сом' : 'не указана'}\n` +
      `💰 *Желаемая цена:* ${price ? price + ' сом' : 'не указана'}\n\n` +
      `📝 *Описание:*\n${description}\n\n` +
      `🕐 *Дата:* ${new Date().toLocaleString('ru-RU')}`;
    
    let result;
    
    // Если есть фото - отправляем напрямую в Telegram через sendPhoto с файлом
    if (photoInput.files && photoInput.files[0]) {
      console.log('Отправка фото в Telegram...');
      
      const telegramFormData = new FormData();
      telegramFormData.append('chat_id', '5567924440');
      telegramFormData.append('photo', photoInput.files[0]);
      telegramFormData.append('caption', message);
      
      const response = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendPhoto', {
        method: 'POST',
        body: telegramFormData
      });
      
      result = await response.json();
      console.log('Результат отправки с фото:', result);
    } else {
      // Если нет фото - отправляем обычное текстовое сообщение
      console.log('Отправка текстового сообщения...');
      
      const response = await fetch('https://api.telegram.org/bot7599592948:AAGtc_dGAcJFVQOSYcKVY0W-7GegszY9n8E/sendMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: '5567924440',
          text: message,
          parse_mode: 'Markdown'
        })
      });
      result = await response.json();
      console.log('Результат отправки текста:', result);
    }
    
    if (result.ok) {
      // Скрываем спиннер
      document.getElementById('suggestionLoader').style.display = 'none';
      document.getElementById('suggestionSubmitBtn').disabled = false;
      
      closeSuggestionWindow();
      Swal.fire({
        icon: 'success',
        title: 'Предложение отправлено!',
        text: 'Спасибо за ваше предложение! Мы рассмотрим его и постараемся добавить этот товар',
        confirmButtonText: 'Отлично'
      });
    } else {
      throw new Error('Ошибка отправки');
    }
    
  } catch (error) {
    // Скрываем спиннер при ошибке
    document.getElementById('suggestionLoader').style.display = 'none';
    document.getElementById('suggestionSubmitBtn').disabled = false;
    
    console.error('Ошибка отправки предложения:', error);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Не удалось отправить предложение. Попробуйте позже или свяжитесь с нами по телефону.'
    });
  }
}

// ===== CHAT INITIALIZATION =====

// Инициализация чата при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  // Запрашиваем разрешение на уведомления ТОЛЬКО ОДИН РАЗ
  if ('Notification' in window && Notification.permission === 'default') {
    const askedBefore = localStorage.getItem('notificationAsked');
    if (!askedBefore) {
      Notification.requestPermission().then(() => {
        localStorage.setItem('notificationAsked', 'true');
      });
    }
  }
  
  console.log('Чат инициализирован для клиента:', clientId);
});
