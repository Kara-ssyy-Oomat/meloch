// ==================== РАСШИРЕННЫЙ ПОИСК ====================
// Автодополнение, голосовой поиск, поиск по фото

// ==================== GOOGLE VISION API CONFIG ====================
// ВАЖНО: Получите свой API ключ на https://console.cloud.google.com/
// 1. Создайте проект
// 2. Включите Cloud Vision API
// 3. Создайте API ключ
// 4. Вставьте ниже вместо 'YOUR_API_KEY'

const GOOGLE_VISION_CONFIG = {
  apiKey: 'AIzaSyBQ3zpHAxM8N1EuLc5R3dPs2IosyfKDEb0',
  endpoint: 'https://vision.googleapis.com/v1/images:annotate'
};

// ==================== 1. АВТОДОПОЛНЕНИЕ ====================

let autocompleteTimeout;
let selectedAutocompleteIndex = -1;

// Показать автодополнение
function showAutocomplete(input) {
  clearTimeout(autocompleteTimeout);
  
  autocompleteTimeout = setTimeout(() => {
    const query = input.value.trim().toLowerCase();
    
    // Скрываем если пусто
    if (!query) {
      hideAutocomplete();
      return;
    }
    
    // Получаем уникальные предложения
    const suggestions = getAutocompleteSuggestions(query);
    
    if (suggestions.length === 0) {
      hideAutocomplete();
      return;
    }
    
    // Создаем или обновляем dropdown
    let dropdown = document.getElementById('autocompleteDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'autocompleteDropdown';
      dropdown.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-height: 300px;
        overflow-y: auto;
        z-index: 9999;
        width: 100%;
        top: 100%;
        left: 0;
        margin-top: 4px;
      `;
      input.parentElement.style.position = 'relative';
      input.parentElement.appendChild(dropdown);
    }
    
    dropdown.innerHTML = suggestions.map((item, index) => `
      <div class="autocomplete-item" data-index="${index}" onclick="selectAutocomplete('${item.value.replace(/'/g, "\\'")}')">
        ${item.image ? `<img src="${item.image}" style="width: 40px; height: 40px; object-fit: contain; border-radius: 6px; margin-right: 10px; background: #f5f5f5; border: 1px solid #e0e0e0;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">` : ''}
        <span style="font-size: 16px; margin-right: 8px; ${item.image ? 'display: none;' : ''}">${item.icon}</span>
        <span style="flex: 1;">${highlightMatch(item.label, query)}</span>
        ${item.count ? `<span style="color: #999; font-size: 12px;">${item.count}</span>` : ''}
      </div>
    `).join('');
    
    selectedAutocompleteIndex = -1;
    
  }, 200);
}

// Получить предложения для автодополнения
function getAutocompleteSuggestions(query) {
  const suggestions = [];
  const seen = new Set();
  
  // 1. Поиск по названиям товаров
  products.forEach(product => {
    const title = product.title?.toLowerCase() || '';
    if (title.includes(query)) {
      const key = `product_${product.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          type: 'product',
          label: product.title,
          value: product.title,
          icon: '🛍️',
          image: product.image || null,
          count: null
        });
      }
    }
  });
  
  // 2. Поиск по категориям
  const categories = [
    { name: 'ножницы', label: 'Ножницы', icon: '✂️' },
    { name: 'скотч', label: 'Скотч', icon: '📦' },
    { name: 'нож', label: 'Нож', icon: '🔪' },
    { name: 'корейские', label: 'Корейские товары', icon: '🇰🇷' },
    { name: 'часы', label: 'Часы', icon: '⌚' },
    { name: 'электроника', label: 'Электроника', icon: '🔌' },
    { name: 'бытовые', label: 'Бытовые техники', icon: '🏠' }
  ];
  
  categories.forEach(cat => {
    if (cat.label.toLowerCase().includes(query) || cat.name.includes(query)) {
      const count = products.filter(p => (p.category || '').toLowerCase() === cat.name).length;
      if (count > 0) {
        suggestions.push({
          type: 'category',
          label: cat.label,
          value: cat.name,
          icon: cat.icon,
          count: `${count} шт`
        });
      }
    }
  });
  
  // 3. Поиск по тегам/ключевым словам
  const keywords = new Set();
  products.forEach(p => {
    const title = (p.title || '').toLowerCase();
    const words = title.split(/\s+/);
    words.forEach(word => {
      if (word.length >= 3 && word.includes(query)) {
        keywords.add(word);
      }
    });
  });
  
  keywords.forEach(keyword => {
    const key = `keyword_${keyword}`;
    if (!seen.has(key) && suggestions.length < 15) {
      seen.add(key);
      const count = products.filter(p => (p.title || '').toLowerCase().includes(keyword)).length;
      suggestions.push({
        type: 'keyword',
        label: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        value: keyword,
        icon: '🔍',
        count: `${count} шт`
      });
    }
  });
  
  return suggestions.slice(0, 10);
}

// Подсветка совпадения
function highlightMatch(text, query) {
  // Экранируем специальные символы регулярных выражений
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return text.replace(regex, '<strong style="color:#667eea;">$1</strong>');
}

// Выбрать предложение
function selectAutocomplete(value) {
  const searchInput = document.getElementById('search');
  searchInput.value = value;
  hideAutocomplete();
  applyFilters();
}

// Скрыть автодополнение
function hideAutocomplete() {
  const dropdown = document.getElementById('autocompleteDropdown');
  if (dropdown) {
    dropdown.remove();
  }
  selectedAutocompleteIndex = -1;
}

// Навигация клавиатурой по автодополнению
function handleAutocompleteKeydown(event) {
  const dropdown = document.getElementById('autocompleteDropdown');
  if (!dropdown) return;
  
  const items = dropdown.querySelectorAll('.autocomplete-item');
  if (items.length === 0) return;
  
  // Стрелка вниз
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedAutocompleteIndex = (selectedAutocompleteIndex + 1) % items.length;
    updateAutocompleteSelection(items);
  }
  // Стрелка вверх
  else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedAutocompleteIndex = selectedAutocompleteIndex <= 0 ? items.length - 1 : selectedAutocompleteIndex - 1;
    updateAutocompleteSelection(items);
  }
  // Enter
  else if (event.key === 'Enter' && selectedAutocompleteIndex >= 0) {
    event.preventDefault();
    items[selectedAutocompleteIndex].click();
  }
  // Escape
  else if (event.key === 'Escape') {
    hideAutocomplete();
  }
}

// Обновить выделение в автодополнении
function updateAutocompleteSelection(items) {
  items.forEach((item, index) => {
    if (index === selectedAutocompleteIndex) {
      item.style.background = '#f0f0ff';
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.style.background = 'white';
    }
  });
}

// ==================== 2. ГОЛОСОВОЙ ПОИСК ====================

let recognition = null;
let isListening = false;

// Инициализация голосового поиска
function initVoiceSearch() {
  // Проверка поддержки Web Speech API
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Голосовой поиск не поддерживается в этом браузере');
    return false;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.lang = 'ru-RU';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  recognition.onstart = function() {
    console.log('🎤 Голосовой поиск активирован');
    isListening = true;
    updateVoiceButton(true);
  };
  
  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript;
    console.log('🎤 Распознано:', transcript);
    
    const searchInput = document.getElementById('search');
    searchInput.value = transcript;
    
    // Применяем поиск
    applyFilters();
    
    // Показываем уведомление
    showVoiceResultToast(transcript);
  };
  
  recognition.onerror = function(event) {
    console.error('❌ Ошибка голосового поиска:', event.error);
    isListening = false;
    updateVoiceButton(false);
    
    let errorMessage = 'Ошибка распознавания речи';
    if (event.error === 'no-speech') {
      errorMessage = 'Речь не обнаружена. Попробуйте снова.';
    } else if (event.error === 'not-allowed') {
      errorMessage = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
    } else if (event.error === 'network') {
      errorMessage = 'Ошибка сети. Проверьте подключение к интернету.';
    }
    
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: errorMessage,
      timer: 3000
    });
  };
  
  recognition.onend = function() {
    console.log('🎤 Голосовой поиск завершен');
    isListening = false;
    updateVoiceButton(false);
  };
  
  return true;
}

// Запуск голосового поиска
function startVoiceSearch() {
  if (!recognition) {
    const initialized = initVoiceSearch();
    if (!initialized) {
      Swal.fire({
        icon: 'warning',
        title: 'Не поддерживается',
        text: 'Ваш браузер не поддерживает голосовой поиск. Используйте Chrome или Edge.',
        timer: 3000
      });
      return;
    }
  }
  
  if (isListening) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (error) {
      console.error('Ошибка запуска:', error);
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: 'Не удалось запустить голосовой поиск',
        timer: 2000
      });
    }
  }
}

// Обновить кнопку голосового поиска
function updateVoiceButton(listening) {
  const btn = document.getElementById('voiceSearchBtn');
  if (!btn) return;
  
  if (listening) {
    btn.innerHTML = '🔴';
    btn.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
    btn.title = 'Остановить запись';
    btn.classList.add('listening-pulse');
  } else {
    btn.innerHTML = '🎤';
    btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    btn.title = 'Голосовой поиск';
    btn.classList.remove('listening-pulse');
  }
}

// Показать уведомление о результате
function showVoiceResultToast(text) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 12px 20px;
    border-radius: 25px;
    box-shadow: 0 4px 15px rgba(102,126,234,0.4);
    z-index: 99999;
    font-size: 14px;
    font-weight: 500;
    animation: slideDown 0.3s ease;
  `;
  toast.innerHTML = `🎤 Распознано: "${text}"`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ==================== 3. ПОИСК ПО ФОТО ====================

let selectedImageFile = null;

// Открыть выбор изображения
function openImageSearch() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    selectedImageFile = file;
    
    // Показываем редактор обрезки
    await showImageCropEditor(file);
  };
  
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}

// Редактор обрезки изображения
async function showImageCropEditor(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const imageDataUrl = e.target.result;
      const img = new Image();
      
      img.onload = function() {
        // Создаем canvas для предпросмотра
        const maxWidth = 600;
        const maxHeight = 500;
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const displayWidth = img.width * scale;
        const displayHeight = img.height * scale;
        
        let cropArea = null;
        let isDrawing = false;
        let startX, startY;
        
        Swal.fire({
          title: '✂️ Выделите товар на фото',
          html: `
            <div style="text-align: center;">
              <p style="margin-bottom: 15px; color: #666; font-size: 14px;">
                Обведите нужный товар если на фото несколько предметов
              </p>
              <div style="position: relative; display: inline-block; background: #f5f5f5; border-radius: 8px; padding: 10px;">
                <canvas id="cropCanvas" 
                  width="${displayWidth}" 
                  height="${displayHeight}"
                  style="cursor: crosshair; border: 2px solid #ddd; border-radius: 4px; max-width: 100%;">
                </canvas>
              </div>
              <div style="margin-top: 15px; font-size: 12px; color: #999;">
                💡 Нажмите и перетащите чтобы выделить область<br>
                Или нажмите "Искать все" для поиска по всему фото
              </div>
            </div>
          `,
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: '🔍 Искать выделенное',
          denyButtonText: '📸 Искать все фото',
          cancelButtonText: '❌ Отмена',
          width: '90%',
          customClass: {
            confirmButton: 'swal2-confirm-crop',
            denyButton: 'swal2-deny-crop'
          },
          didOpen: () => {
            const canvas = document.getElementById('cropCanvas');
            const ctx = canvas.getContext('2d');
            
            // Рисуем исходное изображение
            ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
            
            // Обработка мыши для выделения области
            canvas.addEventListener('mousedown', (e) => {
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              startX = (e.clientX - rect.left) * scaleX;
              startY = (e.clientY - rect.top) * scaleY;
              isDrawing = true;
              cropArea = null;
              console.log('🖱️ Начало выделения:', { startX, startY });
            });
            
            canvas.addEventListener('mousemove', (e) => {
              if (!isDrawing) return;
              
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const currentX = (e.clientX - rect.left) * scaleX;
              const currentY = (e.clientY - rect.top) * scaleY;
              
              // Вычисляем размеры с учетом направления (важно!)
              let x = Math.min(startX, currentX);
              let y = Math.min(startY, currentY);
              let width = Math.abs(currentX - startX);
              let height = Math.abs(currentY - startY);
              
              // Ограничиваем границами canvas
              x = Math.max(0, Math.min(x, canvas.width));
              y = Math.max(0, Math.min(y, canvas.height));
              width = Math.min(width, canvas.width - x);
              height = Math.min(height, canvas.height - y);
              
              // Перерисовываем
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
              
              // Рисуем затемнение
              ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              // Очищаем выделенную область от затемнения
              ctx.clearRect(x, y, width, height);
              
              // Рисуем исходное изображение в очищенной области
              ctx.drawImage(img, 
                x / scale, y / scale, width / scale, height / scale,
                x, y, width, height
              );
              
              // Рисуем рамку
              ctx.strokeStyle = '#667eea';
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, width, height);
              
              console.log('📐 Выделение:', { x, y, width, height, canvasSize: `${canvas.width}x${canvas.height}` });
              cropArea = { x: x, y: y, width: width, height: height };
            });
            
            canvas.addEventListener('mouseup', () => {
              isDrawing = false;
            });
            
            // Touch события для мобильных
            canvas.addEventListener('touchstart', (e) => {
              e.preventDefault();
              const rect = canvas.getBoundingClientRect();
              const touch = e.touches[0];
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              startX = (touch.clientX - rect.left) * scaleX;
              startY = (touch.clientY - rect.top) * scaleY;
              isDrawing = true;
              cropArea = null;
            });
            
            canvas.addEventListener('touchmove', (e) => {
              e.preventDefault();
              if (!isDrawing) return;
              
              const rect = canvas.getBoundingClientRect();
              const touch = e.touches[0];
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const currentX = (touch.clientX - rect.left) * scaleX;
              const currentY = (touch.clientY - rect.top) * scaleY;
              
              // Вычисляем размеры с учетом направления (важно!)
              let x = Math.min(startX, currentX);
              let y = Math.min(startY, currentY);
              let width = Math.abs(currentX - startX);
              let height = Math.abs(currentY - startY);
              
              // Ограничиваем границами canvas
              x = Math.max(0, Math.min(x, canvas.width));
              y = Math.max(0, Math.min(y, canvas.height));
              width = Math.min(width, canvas.width - x);
              height = Math.min(height, canvas.height - y);
              
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
              
              ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              ctx.clearRect(x, y, width, height);
              
              ctx.drawImage(img, 
                x / scale, y / scale, width / scale, height / scale,
                x, y, width, height
              );
              
              ctx.strokeStyle = '#667eea';
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, width, height);
              ctx.strokeRect(x, y, width, height);
              
              cropArea = { x: x, y: y, width: width, height: height };
            });
            
            canvas.addEventListener('touchend', () => {
              isDrawing = false;
            });
          },
          preConfirm: async () => {
            if (!cropArea || cropArea.width < 10 || cropArea.height < 10) {
              Swal.showValidationMessage('Пожалуйста, выделите область на изображении');
              return false;
            }
            
            // Обрезаем изображение
            const croppedDataUrl = await cropImage(img, cropArea, scale);
            return croppedDataUrl;
          },
          preDeny: async () => {
            // Ищем по всему фото
            return imageDataUrl;
          }
        }).then(async (result) => {
          if (result.isConfirmed && result.value) {
            // Поиск по обрезанному изображению
            await processImageSearch(null, result.value);
          } else if (result.isDenied && result.value) {
            // Поиск по всему фото
            await processImageSearch(null, result.value);
          }
          resolve();
        });
      };
      
      img.src = imageDataUrl;
    };
    
    reader.readAsDataURL(file);
  });
}

// Обрезать изображение по выделенной области
async function cropImage(img, cropArea, scale) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Пересчитываем координаты для оригинального размера
    let realX = Math.round(cropArea.x / scale);
    let realY = Math.round(cropArea.y / scale);
    let realWidth = Math.round(cropArea.width / scale);
    let realHeight = Math.round(cropArea.height / scale);
    
    // Защита от выхода за границы
    realX = Math.max(0, Math.min(realX, img.width));
    realY = Math.max(0, Math.min(realY, img.height));
    realWidth = Math.min(realWidth, img.width - realX);
    realHeight = Math.min(realHeight, img.height - realY);
    
    // Минимальный размер
    if (realWidth < 10 || realHeight < 10) {
      console.warn('⚠️ Слишком маленькая область обрезки, используем исходное изображение');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
      return;
    }
    
    canvas.width = realWidth;
    canvas.height = realHeight;
    
    console.log('✂️ Обрезка:', { realX, realY, realWidth, realHeight, originalSize: `${img.width}x${img.height}` });
    
    // Вырезаем нужную область
    ctx.drawImage(img, 
      realX, realY, realWidth, realHeight,
      0, 0, realWidth, realHeight
    );
    
    resolve(canvas.toDataURL('image/jpeg', 0.9));
  });
}

// Обработка поиска по изображению
async function processImageSearch(file, imageDataUrl) {
  try {
    Swal.fire({
      title: 'Поиск по фото...',
      html: `
        <div style="margin: 20px 0;">
          <div style="font-size: 48px; margin-bottom: 15px;">📸</div>
          <div>Анализируем изображение...</div>
          <div style="margin-top: 10px; font-size: 12px; color: #999;">
            Обычно занимает 2-3 секунды
          </div>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    console.log('🎯 Запуск поиска по изображению с Google Vision API...');
    
    // Если imageDataUrl передан напрямую, используем его
    let dataUrl = imageDataUrl;
    if (!dataUrl && file) {
      const reader = new FileReader();
      dataUrl = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    const results = await smartImageSearch(dataUrl);
    
    if (results && results.length > 0) {
      showImageSearchResults(dataUrl, results);
    } else {
      Swal.fire({
        icon: 'info',
        title: 'Товары не найдены',
        html: `
          <p>К сожалению, не удалось найти товары на этом фото.</p>
          <p style="margin-top: 10px; font-size: 14px; color: #666;">
            Попробуйте:
            <ul style="text-align: left; margin-top: 10px;">
              <li>Сделать более четкое фото</li>
              <li>Выделить конкретный товар если на фото несколько предметов</li>
              <li>Улучшить освещение</li>
              <li>Сфотографировать товар ближе</li>
            </ul>
          </p>
        `,
        confirmButtonText: 'Попробовать снова'
      });
    }
  } catch (error) {
    console.error('Ошибка поиска по изображению:', error);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Не удалось выполнить поиск. Попробуйте еще раз.',
      confirmButtonText: 'OK'
    });
  }
}

// Умный поиск по изображению - БЫСТРЫЙ И ТОЧНЫЙ
async function smartImageSearch(imageDataUrl) {
  console.log('🎯 Запуск поиска по изображению с Google Vision API...');
  
  // Шаг 1: Проверка точного совпадения по URL (мгновенно)
  const exactMatch = findExactMatch(imageDataUrl);
  if (exactMatch.length > 0) {
    console.log('✅ Найдено точное совпадение!');
    return exactMatch;
  }
  
  // Шаг 2: Анализ изображения через Google Vision API
  try {
    console.log('🔍 Отправка изображения в Google Vision API...');
    const googleResults = await analyzeImageWithGoogle(imageDataUrl);
    
    if (googleResults && googleResults.labels && googleResults.labels.length > 0) {
      console.log('✅ Google распознал объекты:', googleResults.labels.map(l => l.nameRu).join(', '));
      
      // Шаг 3: Поиск товаров по меткам от Google (включая веб-совпадения)
      const matches = searchByGoogleLabels(googleResults.labels, googleResults.colors, googleResults.webMatches);
      
      if (matches.length > 0) {
        console.log(`✅ Найдено ${matches.length} товаров по распознанным объектам`);
        return matches;
      } else {
        console.log('⚠️ По меткам Google ничего не найдено');
        console.log('� Распознанные термины:', googleResults.labels.map(l => l.nameRu).join(', '));
        
        // Показываем пользователю что было распознано
        Swal.fire({
          icon: 'info',
          title: 'Товар не найден',
          html: `
            <div style="text-align: left;">
              <p><strong>Google распознал на фото:</strong></p>
              <p style="color: #666; margin: 10px 0;">${googleResults.labels.slice(0, 5).map(l => l.nameRu).join(', ')}</p>
              <p style="margin-top: 15px;">К сожалению, такого товара нет в базе.</p>
              <p style="color: #666; font-size: 14px; margin-top: 10px;">
                💡 Попробуйте:
              </p>
              <ul style="text-align: left; font-size: 14px; color: #666;">
                <li>Поискать товар по названию в поиске</li>
                <li>Связаться с нами для добавления товара</li>
                <li>Посмотреть похожие товары ниже</li>
              </ul>
            </div>
          `,
          confirmButtonText: 'Понятно',
          width: '90%'
        });
        
        console.log('💡 Показываем популярные товары');
        return getRecommendedProducts();
      }
    }
  } catch (error) {
    console.error('❌ Ошибка Google Vision API:', error.message);
    
    // Fallback: поиск по цветам если Google API недоступен
    if (error.message.includes('API_KEY') || error.message.includes('quota')) {
      Swal.fire({
        icon: 'warning',
        title: 'Google API недоступен',
        text: 'Используем упрощенный поиск по цветам',
        timer: 2000,
        showConfirmButton: false
      });
      
      const colorMatches = await findByDominantColors(imageDataUrl);
      if (colorMatches.length > 0) return colorMatches;
    }
  }
  
  // Шаг 4: Возвращаем рекомендованные товары
  console.log('💡 Показываем рекомендованные товары');
  return getRecommendedProducts();
}

// 1. Поиск точного совпадения (мгновенно)
function findExactMatch(uploadedDataUrl) {
  const results = [];
  
  for (const product of products) {
    if (!product.image) continue;
    
    // Проверка на совпадение URL
    if (uploadedDataUrl.includes(product.image) || 
        product.image.includes(uploadedDataUrl.substring(0, 50))) {
      results.push(product);
    }
  }
  
  return results;
}

// ==================== GOOGLE VISION API ====================

// Анализ изображения через Google Cloud Vision API
async function analyzeImageWithGoogle(imageDataUrl) {
  // Проверка API ключа
  if (!GOOGLE_VISION_CONFIG || GOOGLE_VISION_CONFIG.apiKey === 'YOUR_API_KEY') {
    throw new Error('API_KEY не настроен. Получите ключ на https://console.cloud.google.com/');
  }
  
  // Убираем префикс data:image/...;base64,
  const base64Image = imageDataUrl.split(',')[1];
  
  // Формируем запрос к Google Vision API
  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image
        },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 10 },        // Распознавание объектов
          { type: 'IMAGE_PROPERTIES', maxResults: 5 },        // Цвета
          { type: 'WEB_DETECTION', maxResults: 5 },          // Поиск похожих
          { type: 'OBJECT_LOCALIZATION', maxResults: 10 }    // Локализация объектов
        ]
      }
    ]
  };
  
  try {
    const response = await fetch(
      `${GOOGLE_VISION_CONFIG.endpoint}?key=${GOOGLE_VISION_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Google API ошибка');
    }
    
    const data = await response.json();
    const result = data.responses[0];
    
    // Извлекаем метки (labels)
    const labels = (result.labelAnnotations || []).map(label => ({
      name: label.description,
      confidence: label.score,
      nameRu: translateLabel(label.description) // Переводим на русский
    }));
    
    // Извлекаем доминирующие цвета
    const colors = [];
    if (result.imagePropertiesAnnotation?.dominantColors?.colors) {
      result.imagePropertiesAnnotation.dominantColors.colors.forEach(colorInfo => {
        const rgb = colorInfo.color;
        colors.push({
          r: rgb.red || 0,
          g: rgb.green || 0,
          b: rgb.blue || 0,
          score: colorInfo.score,
          colorName: getColorName(rgb.red || 0, rgb.green || 0, rgb.blue || 0)
        });
      });
    }
    
    // Извлекаем веб-совпадения (если есть)
    const webMatches = [];
    if (result.webDetection?.webEntities) {
      result.webDetection.webEntities.forEach(entity => {
        if (entity.description) {
          webMatches.push({
            name: entity.description,
            nameRu: translateLabel(entity.description)
          });
        }
      });
    }
    
    console.log('📊 Google Vision результаты:');
    console.log('  Метки:', labels.map(l => `${l.nameRu} (${Math.round(l.confidence * 100)}%)`).join(', '));
    console.log('  Цвета:', colors.map(c => c.colorName).join(', '));
    console.log('  Веб-совпадения:', webMatches.map(m => m.nameRu).join(', '));
    
    return {
      labels: labels,
      colors: colors,
      webMatches: webMatches,
      objects: result.localizedObjectAnnotations || []
    };
    
  } catch (error) {
    console.error('❌ Ошибка Google Vision API:', error);
    throw error;
  }
}

// Простой перевод меток на русский
function translateLabel(label) {
  const translations = {
    // Продукты
    'Food': 'Еда', 'Fruit': 'Фрукт', 'Vegetable': 'Овощ', 'Meat': 'Мясо',
    'Apple': 'Яблоко', 'Banana': 'Банан', 'Orange': 'Апельсин', 'Tomato': 'Помидор',
    'Carrot': 'Морковь', 'Potato': 'Картофель', 'Bread': 'Хлеб', 'Milk': 'Молоко',
    'Dairy': 'Молочка', 'Cheese': 'Сыр', 'Yogurt': 'Йогурт', 'Butter': 'Масло',
    'Fish': 'Рыба', 'Chicken': 'Курица', 'Beef': 'Говядина', 'Pork': 'Свинина',
    'Rice': 'Рис', 'Pasta': 'Макароны', 'Cereal': 'Крупа', 'Sugar': 'Сахар',
    'Salt': 'Соль', 'Oil': 'Масло', 'Sauce': 'Соус', 'Spice': 'Специя',
    
    // Электроника
    'Electronics': 'Электроника', 'Phone': 'Телефон', 'Smartphone': 'Смартфон',
    'Computer': 'Компьютер', 'Laptop': 'Ноутбук', 'Television': 'Телевизор',
    'Camera': 'Камера', 'Headphones': 'Наушники', 'Mouse': 'Мышь', 'Keyboard': 'Клавиатура',
    'Monitor': 'Монитор', 'Tablet': 'Планшет', 'Speaker': 'Колонка',
    
    // Инструменты и техника
    'Tool': 'Инструмент', 'Machine': 'Инструмент', 'Equipment': 'Оборудование',
    'Hammer': 'Молоток', 'Screwdriver': 'Отвертка', 'Wrench': 'Ключ',
    'Drill': 'Дрель', 'Saw': 'Пила', 'Axe': 'Топор', 'Knife': 'Нож',
    'Blowtorch': 'Горелка', 'Torch': 'Горелка', 'Burner': 'Горелка',
    'Welding': 'Сварка', 'Soldering': 'Пайка', 'Nozzle': 'Насадка',
    'Power tool': 'Электроинструмент', 'Hand tool': 'Ручной инструмент',
    
    // Уборка и хозтовары
    'Broom': 'Метла', 'Brush': 'Щетка', 'Mop': 'Швабра', 'Vacuum': 'Пылесос',
    'Cleanliness': 'Чистота', 'Cleaning': 'Уборка', 'Clean': 'Чистка',
    'Household Cleaning Supply': 'Бытовая химия', 'Detergent': 'Моющее средство',
    'Soap': 'Мыло', 'Sponge': 'Губка', 'Cloth': 'Тряпка', 'Bucket': 'Ведро',
    
    // Упаковка и расходники
    'Foil': 'Фольга', 'Aluminum foil': 'Фольга', 'Tin foil': 'Фольга',
    'Plastic wrap': 'Пленка', 'Cling film': 'Пленка', 'Food wrap': 'Пленка',
    'Paper product': 'Бумага', 'Paper': 'Бумага', 'Paper towel': 'Полотенца',
    'Tissue': 'Салфетки', 'Tissue paper': 'Салфетки', 'Napkin': 'Салфетки',
    'Packing materials': 'Упаковка', 'Packaging': 'Упаковка', 'Wrap': 'Обертка',
    'Label': 'Этикетка', 'Sticker': 'Наклейка', 'Tape': 'Скотч',
    'Cylinder': 'Рулон', 'Roll': 'Рулон', 'Linens': 'Салфетки',
    
    // Одежда и обувь
    'Clothing': 'Одежда', 'Shirt': 'Рубашка', 'Dress': 'Платье', 'Shoes': 'Обувь',
    'T-shirt': 'Футболка', 'Jeans': 'Джинсы', 'Jacket': 'Куртка', 'Coat': 'Пальто',
    'Pants': 'Брюки', 'Skirt': 'Юбка', 'Sweater': 'Свитер', 'Boots': 'Ботинки',
    'Sneakers': 'Кроссовки', 'Sandals': 'Сандалии', 'Hat': 'Шапка', 'Cap': 'Кепка',
    
    // Цвета
    'Red': 'Красный', 'Blue': 'Синий', 'Green': 'Зеленый', 'Yellow': 'Желтый',
    'Black': 'Черный', 'White': 'Белый', 'Orange': 'Оранжевый', 'Purple': 'Фиолетовый',
    'Pink': 'Розовый', 'Brown': 'Коричневый', 'Gray': 'Серый', 'Grey': 'Серый',
    
    // Материалы
    'Metal': 'Металл', 'Steel': 'Сталь', 'Iron': 'Железо', 'Aluminum': 'Алюминий',
    'Plastic': 'Пластик', 'Wood': 'Дерево', 'Glass': 'Стекло', 'Rubber': 'Резина',
    
    // Общие категории
    'Product': 'Товар', 'Package': 'Упаковка', 'Box': 'Коробка',
    'Container': 'Контейнер', 'Bottle': 'Бутылка', 'Can': 'Банка',
    'Bag': 'Сумка', 'Kitchen': 'Кухня', 'Home': 'Дом', 'Garden': 'Сад',
    
    // Дополнительные
    'Fresh': 'Свежий', 'Organic': 'Органический', 'Natural': 'Натуральный',
    'Frozen': 'Замороженный', 'Canned': 'Консервированный',
    'Gas': 'Газ', 'Butane': 'Бутан', 'Fuel': 'Топливо'
  };
  
  return translations[label] || label;
}

// Определение названия цвета по RGB
function getColorName(r, g, b) {
  if (r > 200 && g < 100 && b < 100) return 'Красный';
  if (r < 100 && g > 200 && b < 100) return 'Зеленый';
  if (r < 100 && g < 100 && b > 200) return 'Синий';
  if (r > 200 && g > 200 && b < 100) return 'Желтый';
  if (r > 200 && g > 100 && b < 100) return 'Оранжевый';
  if (r > 100 && g < 100 && b > 200) return 'Фиолетовый';
  if (r < 50 && g < 50 && b < 50) return 'Черный';
  if (r > 200 && g > 200 && b > 200) return 'Белый';
  if (r > 100 && g > 100 && b > 100) return 'Серый';
  return 'Разноцветный';
}

// Вычисление сходства двух слов (для нечеткого поиска "стрейч" vs "стреч")
function calculateSimilarity(word1, word2) {
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();
  
  // Если слова одинаковые - 100% сходство
  if (w1 === w2) return 1.0;
  
  // Упрощенная метрика на основе общих символов и позиций
  let matches = 0;
  const minLen = Math.min(w1.length, w2.length);
  const maxLen = Math.max(w1.length, w2.length);
  
  // Считаем совпадения на одинаковых позициях
  for (let i = 0; i < minLen; i++) {
    if (w1[i] === w2[i]) matches++;
  }
  
  // Дополнительная проверка: есть ли большинство букв из одного слова в другом
  let commonChars = 0;
  for (let char of w1) {
    if (w2.includes(char)) commonChars++;
  }
  
  // Комбинированная метрика: 60% - совпадение позиций, 40% - наличие символов
  const positionScore = matches / maxLen;
  const charScore = commonChars / w1.length;
  
  return positionScore * 0.6 + charScore * 0.4;
}

// Поиск товаров по меткам от Google
function searchByGoogleLabels(labels, colors, webMatches) {
  const results = [];
  const searchTerms = [];
  const searchTermsExtended = []; // Расширенный поиск с частями слов
  
  // УНИВЕРСАЛЬНЫЙ словарь синонимов (покрывает большинство случаев)
  const synonyms = {
    // Уборка
    'метла': ['веник', 'щетка', 'швабра', 'метелка', 'мётла'],
    'щетка': ['brush', 'зубная', 'расческа', 'comb', 'чистка', 'щётка'],
    'щётка': ['brush', 'зубная', 'расческа', 'щетка', 'comb'],
    'мыло': ['soap', 'моющее', 'жидкое', 'твердое'],
    'губка': ['sponge', 'мочалка', 'скребок'],
    'тряпка': ['cloth', 'салфетка', 'микрофибра'],
    'ведро': ['bucket', 'таз', 'емкость'],
    
    // Инструменты
    'инструмент': ['tool', 'прибор', 'приспособление'],
    'горелка': ['паяльник', 'газовая', 'burner', 'лампа', 'torch'],
    'топор': ['секира', 'колун', 'axe', 'тесак'],
    'нож': ['knife', 'резак', 'лезвие'],
    'молоток': ['hammer', 'кувалда', 'киянка'],
    'отвертка': ['screwdriver', 'шуруповерт'],
    'пила': ['saw', 'ножовка', 'пилка'],
    'дрель': ['drill', 'сверло', 'перфоратор'],
    
    // Кухонные инструменты
    'терка': ['тёрка', 'grater', 'овощная', 'кухонная', 'тёрочка'],
    'тёрка': ['терка', 'grater', 'овощная', 'кухонная'],
    'открывалка': ['opener', 'консервный', 'бутылочная'],
    'чесалка': ['peeler', 'овощечистка', 'очиститель'],
    'орехокол': ['nutcracker', 'щелкунчик', 'для орехов'],
    
    // Средства от насекомых
    'мухобойка': ['fly', 'swatter', 'от мух', 'ловушка', 'липучка', 'муха', 'мухабой'],
    'мухабой': ['мухобойка', 'fly', 'swatter', 'от мух'],
    'липучка': ['от мух', 'ловушка', 'лента', 'клейкая', 'мухобойка'],
    
    // Упаковка и расходники
    'фольга': ['алюминиевая', 'пищевая', 'foil', 'tin', 'алюминий'],
    'пленка': ['стрейч', 'стреч', 'пищевая', 'wrap', 'плёнка', 'film', 'пакет', 'стрэйч', 'stretch'],
    'стрейч': ['стреч', 'пленка', 'stretch', 'пищевая', 'стрэйч', 'плёнка'],
    'стреч': ['стрейч', 'пленка', 'stretch', 'пищевая', 'стрэйч', 'плёнка'],
    'салфетки': ['tissue', 'бумажные', 'полотенца', 'napkin', 'влажные'],
    'бумага': ['paper', 'рулон', 'туалетная', 'офисная'],
    'упаковка': ['пакет', 'пленка', 'стреч', 'стрейч', 'материалы', 'коробка'],
    'скотч': ['tape', 'лента', 'клейкая', 'изолента'],
    'пакет': ['package', 'bag', 'мешок', 'кулек'],
    
    // Посуда и кухня
    'тарелка': ['plate', 'блюдо', 'dish'],
    'стакан': ['glass', 'cup', 'кружка'],
    'вилка': ['fork', 'столовая'],
    'ложка': ['spoon', 'столовая', 'чайная'],
    'сковорода': ['pan', 'жаровня', 'frying'],
    'кастрюля': ['pot', 'казан', 'емкость'],
    
    // Одежда и текстиль
    'полотенце': ['towel', 'салфетка', 'тряпка'],
    'тряпка': ['cloth', 'салфетка', 'микрофибра', 'полотенце'],
    'губка': ['sponge', 'мочалка', 'скребок', 'текстиль'],
    'нитки': ['пряжа', 'yarn', 'thread', 'вязание'],
    'пряжа': ['нитки', 'yarn', 'шерсть', 'вязание'],
    'шерсть': ['wool', 'woolen', 'пряжа', 'вязаная'],
    'салфетка': ['napkin', 'полотенце', 'тряпка', 'ткань'],
    'рубашка': ['shirt', 'футболка', 'блузка'],
    'платье': ['dress', 'сарафан'],
    'обувь': ['shoes', 'ботинки', 'сапоги', 'кроссовки'],
    
    // Электроника
    'телефон': ['phone', 'smartphone', 'мобильный', 'смартфон'],
    'компьютер': ['computer', 'ноутбук', 'laptop', 'pc'],
    'наушники': ['headphones', 'earphones', 'гарнитура'],
    'зарядка': ['charger', 'адаптер', 'блок'],
    
    // Продукты
    'яблоко': ['apple', 'фрукт', 'фруктовый'],
    'хлеб': ['bread', 'булка', 'батон'],
    'молоко': ['milk', 'dairy', 'молочка'],
    'мясо': ['meat', 'beef', 'говядина', 'свинина'],
    
    // Материалы
    'пластик': ['plastic', 'пластмасса', 'пластиковый'],
    'металл': ['metal', 'железо', 'стальной'],
    'дерево': ['wood', 'wooden', 'деревянный'],
    'стекло': ['glass', 'стеклянный'],
    
    // Цвета (различные варианты написания)
    'красный': ['red', 'алый', 'бордовый'],
    'синий': ['blue', 'голубой', 'синяя'],
    'зеленый': ['green', 'зелёный', 'салатовый'],
    'желтый': ['yellow', 'жёлтый', 'золотой'],
    'черный': ['black', 'чёрный', 'темный'],
    'белый': ['white', 'светлый', 'беленький'],
    'серый': ['gray', 'grey', 'серебристый']
  };
  
  // Собираем все термины для поиска (английские и русские)
  labels.forEach(label => {
    const eng = label.name.toLowerCase();
    const rus = label.nameRu.toLowerCase();
    
    searchTerms.push(eng);
    searchTerms.push(rus);
    
    // Добавляем синонимы
    if (synonyms[rus]) {
      synonyms[rus].forEach(syn => searchTerms.push(syn));
    }
    
    // Добавляем части слов для более гибкого поиска
    if (eng.length > 4) {
      searchTermsExtended.push(eng.substring(0, Math.max(4, eng.length - 2)));
    }
    if (rus.length > 4) {
      searchTermsExtended.push(rus.substring(0, Math.max(4, rus.length - 2)));
    }
  });
  
  // Добавляем веб-совпадения (это очень важно!)
  if (webMatches && webMatches.length > 0) {
    webMatches.forEach(match => {
      searchTerms.push(match.name.toLowerCase());
      searchTerms.push(match.nameRu.toLowerCase());
    });
    console.log('🌐 Добавлены веб-совпадения:', webMatches.map(m => m.nameRu).join(', '));
  }
  
  // Добавляем названия цветов
  if (colors && colors.length > 0) {
    colors.slice(0, 3).forEach(color => {
      searchTerms.push(color.colorName.toLowerCase());
    });
  }
  
  // УМНАЯ ЛОГИКА: Определение товара по комбинации меток
  // Если видим cylinder + plastic + packaging = скорее всего стрейч-пленка
  const labelNames = labels.map(l => l.name.toLowerCase());
  const labelNamesRu = labels.map(l => l.nameRu.toLowerCase());
  const allLabels = [...labelNames, ...labelNamesRu];
  
  // Получаем цвета
  const colorNames = colors ? colors.map(c => c.colorName.toLowerCase()) : [];
  
  // Определение стрейч-пленки
  if ((allLabels.includes('cylinder') || allLabels.includes('рулон')) &&
      (allLabels.includes('plastic') || allLabels.includes('пластик')) &&
      (allLabels.includes('packaging') || allLabels.includes('packaging and labeling'))) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: cylinder + plastic + packaging = СТРЕЙЧ-ПЛЕНКА');
    searchTerms.push('стрейч', 'стреч', 'stretch', 'пленка', 'плёнка', 'film');
  }
  
  // Определение терок и кухонных инструментов
  // Если видим пластик + яркий цвет (красный, оранжевый, желтый) = возможно терка
  if ((allLabels.includes('plastic') || allLabels.includes('пластик')) &&
      (colorNames.includes('красный') || colorNames.includes('оранжевый') || 
       colorNames.includes('желтый') || colorNames.includes('зеленый'))) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: plastic + яркий цвет = ТЕРКА/КУХОННЫЙ ИНСТРУМЕНТ');
    searchTerms.push('терка', 'тёрка', 'grater', 'кухонный', 'овощечистка');
  }
  
  // Определение hand tool (ручной инструмент) - может быть терка, нож, открывалка
  if (allLabels.includes('hand tool') || allLabels.includes('tool')) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: hand tool = КУХОННЫЙ/РУЧНОЙ ИНСТРУМЕНТ');
    searchTerms.push('терка', 'тёрка', 'нож', 'открывалка', 'орехокол', 'чесалка');
  }
  
  // Определение мухобойки и средств от насекомых
  // Если видим insect, fly, ant, pest и т.д. = мухобойка или средство от насекомых
  if (allLabels.includes('insect') || allLabels.includes('насекомое') ||
      allLabels.includes('fly') || allLabels.includes('муха') ||
      allLabels.includes('ant') || allLabels.includes('муравей') ||
      allLabels.includes('pest') || allLabels.includes('вредитель') ||
      allLabels.includes('arthropod') || allLabels.includes('cricket')) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: insect/fly/ant/pest = МУХОБОЙКА/СРЕДСТВО ОТ НАСЕКОМЫХ');
    searchTerms.push('мухобойка', 'fly', 'swatter', 'от мух', 'от насекомых', 'ловушка', 'липучка');
  }
  
  // Определение текстиля и вязаных изделий
  // Если видим wool, woolen, craft, knit и т.д. = текстильные/вязаные товары
  if (allLabels.includes('wool') || allLabels.includes('woolen') ||
      allLabels.includes('шерсть') || allLabels.includes('шерстяной') ||
      allLabels.includes('craft') || allLabels.includes('knit') ||
      allLabels.includes('yarn') || allLabels.includes('textile')) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: wool/woolen/craft = ТЕКСТИЛЬ/ВЯЗАНЫЕ ИЗДЕЛИЯ');
    searchTerms.push('нитки', 'пряжа', 'вязаная', 'шерсть', 'ткань', 'полотенце', 'губка', 'тряпка', 'салфетка');
  }
  
  // Определение фольги (уже есть, но можно усилить)
  if ((allLabels.includes('foil') || allLabels.includes('фольга')) &&
      (allLabels.includes('cylinder') || allLabels.includes('рулон'))) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: foil + cylinder = ФОЛЬГА ПИЩЕВАЯ');
    searchTerms.push('фольга', 'foil', 'алюминиевая', 'пищевая');
  }
  
  // Определение скотча
  if ((allLabels.includes('tape') || allLabels.includes('adhesive')) ||
      (allLabels.includes('cylinder') && allLabels.includes('office supplies'))) {
    console.log('🎯 УМНОЕ ОПРЕДЕЛЕНИЕ: tape/adhesive = СКОТЧ');
    searchTerms.push('скотч', 'tape', 'лента', 'клейкая');
  }
  
  console.log('🔍 Поиск товаров по терминам:', searchTerms.join(', '));
  console.log('🔍 Расширенный поиск:', searchTermsExtended.join(', '));
  
  // Ищем товары, содержащие эти термины
  products.forEach(product => {
    const searchText = (
      product.title + ' ' + 
      (product.description || '') + ' ' + 
      (product.category || '') + ' ' +
      (product.tags || []).join(' ')
    ).toLowerCase();
    
    let matchScore = 0;
    let matchedTerms = [];
    
    // Проверка на исключения (товары которые НЕ подходят даже если есть совпадение)
    // Например: "мыльница липучка" - это не липучка от мух
    const excludeWords = ['мыльница', 'мыло', 'держатель', 'подставка', 'полка', 'крючок'];
    const hasExcludeWord = excludeWords.some(word => searchText.includes(word));
    
    // Точное совпадение (высокий вес)
    searchTerms.forEach(term => {
      // Ищем по границам слов чтобы избежать "tin" в "CONTIN"
      const regex = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      
      if (regex.test(searchText)) {
        // Особый вес для важных терминов
        let weight = 2;
        
        // Специальные товары (мухобойка, терка и т.д.) получают очень высокий вес
        const priorityTerms = ['мухобойка', 'мухабой', 'терка', 'тёрка', 'стрейч', 'стреч', 'фольга'];
        if (priorityTerms.includes(term)) {
          weight = 10; // Очень высокий приоритет для основных товаров
        }
        // Если это основное слово (не цвет), увеличиваем вес
        else {
          const colors = ['красный', 'синий', 'зеленый', 'желтый', 'черный', 'белый', 'серый', 'оранжевый', 'разноцветный'];
          if (colors.includes(term)) {
            weight = 1; // Снижаем вес для цветов
          } else if (term.length > 4) {
          weight = 4; // Увеличен вес для важных терминов
        }
        }
        
        matchScore += weight;
        matchedTerms.push(term);
      }
    });
    
    // Если товар содержит слова-исключения, сильно понижаем его рейтинг
    if (hasExcludeWord && matchScore < 10) {
      matchScore = Math.floor(matchScore * 0.3); // Снижаем на 70%
    }
    
    // Частичное совпадение (если нет точного)
    if (matchScore === 0) {
      searchTermsExtended.forEach(term => {
        if (searchText.includes(term)) {
          matchScore += 1;
          matchedTerms.push(term + '*');
        }
      });
    }
    
    // Нечеткий поиск (для опечаток типа "стрейч" vs "стреч", "мухобойка" vs "мухабой")
    // Только для длинных слов (4+ букв) чтобы избежать ложных совпадений
    if (matchScore === 0) {
      searchTerms.forEach(term => {
        if (term.length >= 4) { // Минимум 4 буквы
          const words = searchText.split(/\s+/);
          words.forEach(word => {
            // Пропускаем слишком короткие или слишком длинные слова
            if (word.length < 4) return;
            
            const maxLen = Math.max(word.length, term.length);
            const minLen = Math.min(word.length, term.length);
            
            // Разрешаем разницу в длине до 2 букв для слов длиннее 5 букв
            const maxLengthDiff = maxLen > 5 ? 2 : 1;
            if (Math.abs(word.length - term.length) > maxLengthDiff) return;
            
            // Используем расстояние Левенштейна (упрощенная версия)
            const similarity = calculateSimilarity(word, term);
            
            // СТРОГИЕ ПОРОГИ для избежания ложных срабатываний:
            // Для слов 4-5 букв: требуем 85%+ совпадение (допускаем 1 букву отличия)
            // Для слов 6-7 букв: требуем 80%+ совпадение (допускаем 1-2 буквы отличия)
            // Для слов 8+ букв: требуем 75%+ совпадение (допускаем 2 буквы отличия)
            let threshold;
            if (maxLen <= 5) {
              threshold = 0.85; // Очень строго для коротких слов
            } else if (maxLen <= 7) {
              threshold = 0.80; // Строго для средних слов
            } else {
              threshold = 0.75; // Умеренно для длинных слов
            }
            
            if (similarity >= threshold) {
              matchScore += 2; // Даем хороший вес за fuzzy match
              matchedTerms.push(term + '~');
              console.log(`🔍 Fuzzy match: "${word}" ≈ "${term}" (сходство: ${(similarity * 100).toFixed(0)}%)`);
            }
          });
        }
      });
    }
    
    // Добавляем товар если есть совпадения
    if (matchScore > 0) {
      results.push({
        product: product,
        score: matchScore,
        matchedTerms: matchedTerms
      });
    }
  });
  
  // Сортируем по релевантности
  results.sort((a, b) => b.score - a.score);
  
  // Логируем результаты
  console.log(`📊 Всего найдено товаров: ${results.length}`);
  if (results.length > 0) {
    console.log('🏆 Топ-10 товаров по Google меткам:');
    results.slice(0, 10).forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.product.title} - Score: ${item.score} (${item.matchedTerms.join(', ')})`);
    });
  } else {
    console.log('❌ Не найдено товаров по меткам от Google');
    console.log('💡 Попробуйте загрузить другое фото или опишите товар текстом');
  }
  
  // Возвращаем топ-12
  return results.slice(0, 12).map(item => item.product);
}

// ==================== FALLBACK МЕТОДЫ ====================

// Поиск по доминирующим цветам (Fallback метод)
async function findByDominantColors(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      // Анализируем ТОЛЬКО загруженное изображение
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const size = 50; // Маленький размер для скорости
      canvas.width = size;
      canvas.height = size;
      
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      
      // Получаем среднюю яркость и преобладающий цвет
      let avgR = 0, avgG = 0, avgB = 0, avgBrightness = 0;
      const data = imageData.data;
      let pixels = 0;
      
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue; // Пропускаем прозрачные
        avgR += data[i];
        avgG += data[i + 1];
        avgB += data[i + 2];
        avgBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        pixels++;
      }
      
      if (pixels > 0) {
        avgR = Math.round(avgR / pixels);
        avgG = Math.round(avgG / pixels);
        avgB = Math.round(avgB / pixels);
        avgBrightness = Math.round(avgBrightness / pixels);
      }
      
      console.log(`📊 Средний цвет: RGB(${avgR}, ${avgG}, ${avgB}), Яркость: ${avgBrightness}`);
      
      // Определяем преобладающий цвет
      const colorType = detectColorType(avgR, avgG, avgB, avgBrightness);
      console.log(`🎨 Тип цвета: ${colorType}`);
      
      // Ищем товары с похожими цветовыми характеристиками
      const matches = findProductsByColorType(colorType, avgBrightness);
      
      resolve(matches);
    };
    
    img.onerror = () => resolve([]);
    img.src = imageDataUrl;
  });
}

// Определить тип цвета
function detectColorType(r, g, b, brightness) {
  // Очень темный
  if (brightness < 50) return 'темный';
  
  // Очень светлый
  if (brightness > 220) return 'светлый';
  
  // Определяем доминирующий цвет
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  // Серый (низкая насыщенность)
  if (diff < 30) return 'серый';
  
  // Цветной
  if (r > g && r > b) return 'красный';
  if (g > r && g > b) return 'зеленый';
  if (b > r && b > g) return 'синий';
  if (r > 200 && g > 200 && b < 100) return 'желтый';
  if (r > 200 && g < 100 && b > 200) return 'фиолетовый';
  if (r < 100 && g > 200 && b > 200) return 'голубой';
  
  return 'разноцветный';
}

// Найти товары по типу цвета
function findProductsByColorType(colorType, brightness) {
  const results = [];
  
  // Ключевые слова для каждого цвета
  const colorKeywords = {
    'красный': ['красн', 'алый', 'бордо', 'розов'],
    'зеленый': ['зелен', 'салат', 'оливк'],
    'синий': ['син', 'голуб', 'небесн'],
    'желтый': ['желт', 'золот', 'янтар'],
    'фиолетовый': ['фиолет', 'сирен', 'лилов'],
    'черный': ['черн', 'темн'],
    'белый': ['бел', 'светл'],
    'серый': ['сер', 'металл'],
    'разноцветный': ['цветн', 'разноцвет', 'радуж']
  };
  
  // Категории товаров для разных цветов
  const categoryPriority = {
    'яркий': ['ножницы', 'скотч', 'корейские', 'часы'],
    'темный': ['нож', 'электроника'],
    'светлый': ['все']
  };
  
  const keywords = colorKeywords[colorType] || [];
  
  // Ищем товары с упоминанием цвета или подходящей категории
  for (const product of products) {
    if (!product.image) continue;
    
    const title = product.title.toLowerCase();
    const category = (product.category || '').toLowerCase();
    let score = 50; // Базовый
    
    // Проверка на упоминание цвета в названии
    for (const keyword of keywords) {
      if (title.includes(keyword)) {
        score += 30;
        break;
      }
    }
    
    // Проверка категории
    const brightLevel = brightness < 80 ? 'темный' : brightness > 180 ? 'светлый' : 'яркий';
    const preferredCategories = categoryPriority[brightLevel] || [];
    
    for (const cat of preferredCategories) {
      if (category.includes(cat) || title.includes(cat)) {
        score += 20;
        break;
      }
    }
    
    // Случайность для разнообразия
    score += Math.random() * 15;
    
    if (score > 60) {
      results.push({
        product: product,
        similarity: Math.min(85, Math.round(score))
      });
    }
  }
  
  // Сортируем и возвращаем топ-12
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, 12);
}

// 4. Рекомендуемые товары (если ничего не нашли)
function getRecommendedProducts() {
  const results = [];
  
  // Берем товары с изображениями из популярных категорий
  const popularCategories = ['ножницы', 'скотч', 'нож', 'корейские', 'часы', 'электроника'];
  
  for (const category of popularCategories) {
    const categoryProducts = products.filter(p => 
      p.image && (p.category || '').toLowerCase().includes(category)
    );
    
    // Берем по 2 товара из каждой категории
    categoryProducts.slice(0, 2).forEach(product => {
      results.push({
        product: product,
        similarity: 50 + Math.random() * 20 // 50-70%
      });
    });
    
    if (results.length >= 12) break;
  }
  
  return results.slice(0, 12);
}

// Показать результаты поиска по изображению
function showImageSearchResults(imageDataUrl, results) {
  // Нормализуем результаты (если пришли просто продукты, оборачиваем в объект)
  const normalizedResults = results.map(item => {
    if (item && item.product) {
      // Уже правильный формат
      return item;
    } else if (item && item.id) {
      // Просто продукт - оборачиваем
      return {
        product: item,
        similarity: 85 // Значение по умолчанию для Google API результатов
      };
    } else {
      // Неизвестный формат - пропускаем
      return null;
    }
  }).filter(item => item !== null);
  
  const html = `
    <div style="max-width: 600px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${imageDataUrl}" style="max-width: 100%; max-height: 200px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      </div>
      
      <div style="text-align: left; max-height: 400px; overflow-y: auto;">
        <h3 style="margin-bottom: 15px; font-size: 18px;">📸 Найдено ${normalizedResults.length} товаров:</h3>
        ${normalizedResults.map(item => `
          <div onclick="scrollToProduct('${item.product.id}')" style="display: flex; gap: 12px; padding: 12px; background: white; border: 1px solid #e0e0e0; border-radius: 12px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.2)'; this.style.borderColor='#667eea'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.05)'; this.style.borderColor='#e0e0e0'">
            <div style="position: relative; flex-shrink: 0;">
              <img src="${item.product.image || 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"80\"%3E%3Crect fill=\"%23ddd\" width=\"80\" height=\"80\"/%3E%3Ctext fill=\"%23999\" x=\"50%25\" y=\"50%25\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-size=\"12\"%3EНет фото%3C/text%3E%3C/svg%3E'}" style="width: 80px; height: 80px; object-fit: contain; border-radius: 8px; border: 2px solid #f0f0f0; background: white;">
              ${item.similarity >= 90 ? '<div style="position: absolute; top: -5px; right: -5px; background: #4caf50; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✓</div>' : ''}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; margin-bottom: 4px; font-size: 15px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.product.title}</div>
              <div style="color: #667eea; font-weight: 700; font-size: 16px; margin-bottom: 4px;">${item.product.price} сом</div>
              ${item.product.category ? `<div style="display: inline-block; font-size: 11px; color: #666; background: #f5f5f5; padding: 2px 8px; border-radius: 4px; margin-top: 2px;">📁 ${item.product.category}</div>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; background: ${item.similarity >= 90 ? '#e8f5e9' : item.similarity >= 70 ? '#fff3e0' : '#f5f5f5'}; border-radius: 8px; min-width: 50px;">
              <div style="font-size: 18px; font-weight: 700; color: ${item.similarity >= 90 ? '#4caf50' : item.similarity >= 70 ? '#ff9800' : '#999'};">${Math.round(item.similarity)}%</div>
              <div style="font-size: 10px; color: #999; margin-top: 2px;">совпад.</div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center;">
        <button onclick="refineImageSearch()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; margin-right: 10px;">
          🔍 Уточнить поиск
        </button>
        <p style="font-size: 12px; color: #999; margin-top: 10px;">
          💡 Совет: Нажмите "Уточнить поиск" и опишите товар текстом для лучших результатов
        </p>
      </div>
    </div>
  `;
  
  Swal.fire({
    html: html,
    showConfirmButton: true,
    confirmButtonText: 'Закрыть',
    showCancelButton: false,
    width: '90%',
    customClass: {
      container: 'image-search-results'
    }
  });
}

// Уточнить поиск по изображению
async function refineImageSearch() {
  const { value: searchText } = await Swal.fire({
    title: '🔍 Уточните поиск',
    html: `
      <p style="margin-bottom: 15px; color: #666; font-size: 14px;">
        Опишите товар, который вы ищете на фото:
      </p>
      <input id="refineSearchInput" class="swal2-input" placeholder="Например: ножницы красные" style="width: 90%;">
      <p style="margin-top: 15px; font-size: 12px; color: #999;">
        💡 Укажите: название, цвет, размер, материал
      </p>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Найти',
    cancelButtonText: 'Отмена',
    preConfirm: () => {
      return document.getElementById('refineSearchInput').value;
    }
  });
  
  if (searchText && searchText.trim()) {
    // Закрываем окно результатов
    Swal.close();
    
    // Вставляем текст в основное поле поиска и применяем
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.value = searchText.trim();
      applyFilters();
      
      // Показываем уведомление
      Swal.fire({
        icon: 'success',
        title: 'Поиск применен',
        text: `Ищем: "${searchText.trim()}"`,
        timer: 2000,
        showConfirmButton: false
      });
    }
  }
}

// Прокрутить к товару
function scrollToProduct(productId) {
  Swal.close();
  
  // Применяем поиск для отображения всех товаров
  document.getElementById('search').value = '';
  applyFilters();
  
  // Ждем отрисовки и прокручиваем
  setTimeout(() => {
    const card = document.querySelector(`[data-product-id="${productId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Подсветка
      card.style.animation = 'highlight-pulse 1s ease';
      setTimeout(() => {
        card.style.animation = '';
      }, 1000);
    }
  }, 300);
}

// ==================== СТИЛИ ДЛЯ АВТОДОПОЛНЕНИЯ ====================

const autocompleteStyles = document.createElement('style');
autocompleteStyles.textContent = `
  .autocomplete-item {
    padding: 12px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #f0f0f0;
    transition: background 0.2s;
  }
  
  .autocomplete-item:last-child {
    border-bottom: none;
  }
  
  .autocomplete-item:hover {
    background: #f8f9ff !important;
  }
  
  .listening-pulse {
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }
  
  @keyframes slideDown {
    from { transform: translate(-50%, -20px); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }
  
  @keyframes slideUp {
    from { transform: translate(-50%, 0); opacity: 1; }
    to { transform: translate(-50%, -20px); opacity: 0; }
  }
  
  @keyframes highlight-pulse {
    0%, 100% { transform: scale(1); box-shadow: none; }
    50% { transform: scale(1.05); box-shadow: 0 0 20px rgba(102, 126, 234, 0.5); }
  }
`;
document.head.appendChild(autocompleteStyles);

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('search');
  
  if (searchInput) {
    // Автодополнение
    searchInput.addEventListener('input', function() {
      showAutocomplete(this);
    });
    
    searchInput.addEventListener('keydown', handleAutocompleteKeydown);
    
    // Скрываем автодополнение при клике вне
    document.addEventListener('click', function(e) {
      if (!searchInput.contains(e.target) && e.target.id !== 'autocompleteDropdown') {
        hideAutocomplete();
      }
    });
  }
  
  // Инициализация голосового поиска
  initVoiceSearch();
});

console.log('✅ Модуль расширенного поиска загружен');
