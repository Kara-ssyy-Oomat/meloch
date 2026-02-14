// ===================================================================
// КЕРБЕН B2B Market — Complaint & Suggestion System
// ===================================================================

// Открыть окно жалобы
function openComplaintWindow() {
  document.getElementById('complaintWindow').style.display = 'flex';
  lockPageScroll();
  
  // Очищаем форму
  document.getElementById('complaintName').value = '';
  document.getElementById('complaintPhone').value = '';
  document.getElementById('complaintCategory').value = '';
  document.getElementById('complaintText').value = '';
}

// Закрыть окно жалобы
function closeComplaintWindow() {
  document.getElementById('complaintWindow').style.display = 'none';
  unlockPageScroll();
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

// Функции окна предложения товара
function openSuggestionWindow() {
  document.getElementById('suggestionWindow').style.display = 'flex';
  lockPageScroll();
  
  // Очистка формы
  document.getElementById('suggestionName').value = '';
  document.getElementById('suggestionPhone').value = '';
  document.getElementById('suggestionProductName').value = '';
  document.getElementById('suggestionCurrentPrice').value = '';
  document.getElementById('suggestionPrice').value = '';
  document.getElementById('suggestionDescription').value = '';
  document.getElementById('suggestionPhoto').value = '';
}

function closeSuggestionWindow() {
  document.getElementById('suggestionWindow').style.display = 'none';
  unlockPageScroll();
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

// Экранирование HTML для безопасности
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
