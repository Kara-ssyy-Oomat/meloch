// ==================== АДМИН-ФУНКЦИИ ДЛЯ ЧАТА ====================

// Переменная для хранения выбранного клиента админом
let selectedClientId = null;
let selectedClientName = null;

// Загрузка списка всех клиентов для админа
async function loadAdminChat() {
  if (typeof db === 'undefined') {
    document.getElementById('adminChatMessages').innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Firebase не подключен</div>';
    return;
  }
  
  try {
    // Загружаем список клиентов
    const clientsSnapshot = await db.collection('chatClients')
      .get();
    
    const messagesDiv = document.getElementById('adminChatMessages');
    messagesDiv.innerHTML = `
      <div style="display:flex; height:100%; background:#f8f9fa;">
        <div id="clientsList" style="width:250px; border-right:2px solid #e0e0e0; overflow-y:auto; padding:12px; background:white;">
          <div style="font-weight:bold; margin-bottom:12px; color:#333; font-size:16px; padding:8px; background:#f8f9fa; border-radius:8px;">
            📋 Клиенты (${clientsSnapshot.size})
          </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column;">
          <div id="chatHeader" style="padding:16px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; font-weight:bold; display:none;">
            <div style="font-size:18px;">Выберите клиента</div>
          </div>
          <div id="chatMessagesArea" style="flex:1; display:flex; flex-direction:column; padding:16px; overflow-y:auto; background:#f5f5f5;">
            <div style="text-align:center; color:#999; padding:40px; font-size:16px;">
              👈 Выберите клиента из списка слева
            </div>
          </div>
        </div>
      </div>
    `;
    
    const clientsList = document.getElementById('clientsList');
    
    if (clientsSnapshot.empty) {
      clientsList.innerHTML += '<div style="color:#999; font-size:13px; text-align:center; margin-top:40px; padding:20px;">Нет активных чатов</div>';
      return;
    }
    
    // Собираем клиентов в массив и сортируем по lastActive
    const clients = [];
    clientsSnapshot.forEach((doc) => {
      clients.push({
        id: doc.id,
        data: doc.data()
      });
    });
    
    // Сортируем по lastActive (новые первыми)
    clients.sort((a, b) => {
      const timeA = a.data.lastActive ? a.data.lastActive.toDate().getTime() : 0;
      const timeB = b.data.lastActive ? b.data.lastActive.toDate().getTime() : 0;
      return timeB - timeA;
    });
    
    // Добавляем каждого клиента в список
    clients.forEach(({id, data: client}) => {
      const clientDiv = document.createElement('div');
      clientDiv.style.cssText = `
        padding:12px; margin-bottom:10px; background:${client.hasUnread ? '#fff9c4' : '#f8f9fa'}; 
        border-radius:10px; cursor:pointer; transition:all 0.2s; border:2px solid transparent;
      `;
      clientDiv.innerHTML = `
        <div style="font-weight:bold; color:#333; margin-bottom:4px; font-size:15px;">${client.name}</div>
        <div style="font-size:11px; color:#666;">
          ${client.lastActive ? new Date(client.lastActive.toDate()).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'Давно'}
        </div>
        ${client.hasUnread ? '<div style="font-size:10px; color:#f57c00; font-weight:bold; margin-top:6px;">🔔 НОВОЕ СООБЩЕНИЕ</div>' : ''}
      `;
      
      clientDiv.onmouseover = () => clientDiv.style.borderColor = '#667eea';
      clientDiv.onmouseout = () => {
        if (selectedClientId !== id) clientDiv.style.borderColor = 'transparent';
      };
      
      clientDiv.onclick = () => loadClientMessages(id, client.name, clientDiv);
      clientsList.appendChild(clientDiv);
    });
    
  } catch (error) {
    console.error('Ошибка загрузки клиентов:', error);
    document.getElementById('adminChatMessages').innerHTML = '<div style="text-align:center; color:#dc3545; padding:20px;">Ошибка загрузки клиентов</div>';
  }
}

// Загрузка сообщений конкретного клиента
async function loadClientMessages(clientId, clientName, clientDiv) {
  selectedClientId = clientId;
  selectedClientName = clientName;
  
  console.log('Загрузка сообщений клиента:', clientName, clientId);
  
  // Подсвечиваем выбранного клиента
  document.querySelectorAll('#clientsList > div').forEach(div => {
    if (div.style && div !== clientDiv) {
      div.style.borderColor = 'transparent';
      div.style.background = '#f8f9fa';
    }
  });
  if (clientDiv) {
    clientDiv.style.borderColor = '#667eea';
    clientDiv.style.background = '#e3f2fd';
  }
  
  // Убираем метку "новое сообщение"
  try {
    await db.collection('chatClients').doc(clientId).update({ hasUnread: false });
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
  }
  
  // Обновляем заголовок
  const chatHeader = document.getElementById('chatHeader');
  chatHeader.style.display = 'block';
  chatHeader.innerHTML = `
    <div style="font-size:18px;">💬 Чат с ${clientName}</div>
    <div style="font-size:12px; opacity:0.9; margin-top:4px;">ID: ${clientId}</div>
  `;
  
  try {
    // Загружаем сообщения этого клиента
    const querySnapshot = await db.collection('chatMessages')
      .where('clientId', '==', clientId)
      .get();
    
    const chatArea = document.getElementById('chatMessagesArea');
    chatArea.innerHTML = '';
    
    if (querySnapshot.empty) {
      chatArea.innerHTML = `<div style="text-align:center; color:#999; padding:40px; font-size:15px;">Нет сообщений с ${clientName}</div>`;
      return;
    }
    
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
      addAdminChatMessageToUI(msg.text, msg.sender, msg.timestamp);
    });
    
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Обновляем placeholder поля ввода
    const inputField = document.getElementById('adminChatInput');
    if (inputField) {
      inputField.placeholder = `Ответить ${clientName}...`;
    }
    
    // Подписываемся на новые сообщения от этого клиента
    subscribeToAdminChatMessages(clientId);
    
  } catch (error) {
    console.error('Ошибка загрузки сообщений клиента:', error);
    document.getElementById('chatMessagesArea').innerHTML = '<div style="text-align:center; color:#dc3545; padding:20px;">Ошибка загрузки сообщений</div>';
  }
}

// Добавление сообщения в админ-панель
function addAdminChatMessageToUI(text, sender, timestamp) {
  const chatArea = document.getElementById('chatMessagesArea');
  if (!chatArea) return;
  
  const timeStr = timestamp.getHours().toString().padStart(2, '0') + ':' + timestamp.getMinutes().toString().padStart(2, '0');
  const dateStr = timestamp.toLocaleDateString('ru-RU');
  
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = 'margin-bottom:12px; display:flex;';
  
  const msgContent = document.createElement('div');
  
  if (sender === 'client') {
    msgContent.style.cssText = 'background:white; padding:12px; border-radius:12px 12px 12px 4px; max-width:70%; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
    msgContent.innerHTML = `
      <div style="font-size:12px; color:#667eea; font-weight:bold; margin-bottom:4px;">👤 ${selectedClientName || 'Клиент'}</div>
      <div style=" color:#333;">${escapeHtml(text)}</div>
      <div style="font-size:11px; color:#999; margin-top:4px;">${dateStr} ${timeStr}</div>
    `;
  } else {
    messageDiv.style.justifyContent = 'flex-end';
    msgContent.style.cssText = 'background:#667eea; color:white; padding:12px; border-radius:12px 12px 4px 12px; max-width:70%; box-shadow:0 2px 4px rgba(0,0,0,0.1);';
    msgContent.innerHTML = `
      <div style="font-size:12px; font-weight:bold; margin-bottom:4px; opacity:0.9;">✅ Вы</div>
      <div style="">${escapeHtml(text)}</div>
      <div style="font-size:11px; opacity:0.9; margin-top:4px; text-align:right;">${dateStr} ${timeStr}</div>
    `;
  }
  
  messageDiv.appendChild(msgContent);
  chatArea.appendChild(messageDiv);
}

// Отправка сообщения от админа
async function sendAdminMessage() {
  if (!selectedClientId) {
    Swal.fire('Ошибка', 'Сначала выберите клиента из списка слева', 'warning');
    return;
  }
  
  const input = document.getElementById('adminChatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  const now = new Date();
  
  try {
    // Добавляем сообщение в UI
    addAdminChatMessageToUI(message, 'admin', now);
    
    // Сохраняем в Firebase с clientId выбранного клиента
    await db.collection('chatMessages').add({
      text: message,
      sender: 'admin',
      clientId: selectedClientId,
      clientName: selectedClientName,
      timestamp: firebase.firestore.Timestamp.fromDate(now),
      read: false
    });
    
    console.log('Сообщение отправлено клиенту:', selectedClientName);
    
    // Очищаем поле ввода
    input.value = '';
    
    // Прокручиваем к последнему сообщению
    const chatArea = document.getElementById('chatMessagesArea');
    chatArea.scrollTop = chatArea.scrollHeight;
    
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    Swal.fire('Ошибка', 'Не удалось отправить сообщение', 'error');
  }
}

// Подписка на новые сообщения конкретного клиента в админ-панели
function subscribeToAdminChatMessages(clientId) {
  if (typeof db === 'undefined') return;
  
  db.collection('chatMessages')
    .where('clientId', '==', clientId)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          // Если сообщение от клиента и это выбранный клиент
          if (msg.sender === 'client' && msg.clientId === selectedClientId) {
            // Проверяем, не дублируется ли сообщение
            const chatArea = document.getElementById('chatMessagesArea');
            const existingMessages = chatArea.querySelectorAll('div');
            let isDuplicate = false;
            existingMessages.forEach(div => {
              if (div.textContent && div.textContent.includes(msg.text)) {
                isDuplicate = true;
              }
            });
            
            if (!isDuplicate) {
              addAdminChatMessageToUI(msg.text, msg.sender, msg.timestamp.toDate());
              chatArea.scrollTop = chatArea.scrollHeight;
              
              // Обновляем список клиентов (добавляем уведомление)
              loadAdminChat();
            }
          }
        }
      });
    });
}

// Очистка всех сообщений чата
async function clearAllChatMessages() {
  const result = await Swal.fire({
    title: 'Вы уверены?',
    text: 'Все сообщения чата будут удалены безвозвратно!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Да, удалить',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#dc3545'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    const querySnapshot = await db.collection('chatMessages').get();
    
    const deletePromises = [];
    querySnapshot.forEach((doc) => {
      deletePromises.push(doc.ref.delete());
    });
    
    await Promise.all(deletePromises);
    
    document.getElementById('adminChatMessages').innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Нет сообщений</div>';
    document.getElementById('chatMessages').innerHTML = `
      <div style="background:white; padding:12px; border-radius:12px 12px 12px 4px; max-width:80%; align-self:flex-start; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <div style=" color:#333;">Здравствуйте! Чем могу помочь?</div>
        <div style="font-size:11px; color:#999; margin-top:4px;">Продавец • только что</div>
      </div>
    `;
    
    Swal.fire('Успех!', 'Все сообщения удалены', 'success');
  } catch (error) {
    console.error('Ошибка очистки сообщений:', error);
    Swal.fire('Ошибка', 'Не удалось очистить сообщения', 'error');
  }
}

// Обновление админ-чата
function refreshAdminChat() {
  loadAdminChat();
  Swal.fire({
    icon: 'success',
    title: 'Обновлено',
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 1500
  });
}

// ==================== КОНЕЦ АДМИН-ФУНКЦИЙ ЧАТА ====================
