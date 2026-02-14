// ===== CHAT MODULE =====
// Чат с продавцом, уведомления, жалобы и предложения

// Переменная для отписки от Firestore подписки
let _chatUnsubscribe = null;

// Переключение видимости окна чата
async function toggleChat() {
  const chatWindow = document.getElementById('chatWindow');
  
  if (chatWindow.style.display === 'none' || !chatWindow.style.display) {
    // СНАЧАЛА запрашиваем имя клиента (из профиля или вводом)
    const name = await ensureClientName();
    
    // Если имя не получено (пользователь выбрал войти в профиль), не открываем чат
    if (!name) {
      return;
    }
    
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
  
  // Отписываемся от предыдущей подписки, если она есть (предотвращение утечки памяти)
  if (_chatUnsubscribe) {
    _chatUnsubscribe();
    _chatUnsubscribe = null;
  }
  
  _chatUnsubscribe = db.collection('chatMessages')
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

// ===== COMPLAINT/SUGGESTION FUNCTIONS =====
// Функции жалоб и предложений определены в complaint-suggestion.js
// Удалены дубликаты из chat.js для устранения конфликтов

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
