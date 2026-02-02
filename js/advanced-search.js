// ==================== РАСШИРЕННЫЙ ПОИСК ====================
// Автодополнение и голосовой поиск

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
  if (typeof products !== 'undefined') {
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
  }
  
  return suggestions.slice(0, 10);
}

// Подсветка совпадения
function highlightMatch(text, query) {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return text.replace(regex, '<strong style="color:#667eea;">$1</strong>');
}

// Выбрать предложение
function selectAutocomplete(value) {
  const searchInput = document.getElementById('search');
  searchInput.value = value;
  hideAutocomplete();
  if (typeof applyFilters === 'function') {
    applyFilters();
  }
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
  
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedAutocompleteIndex = (selectedAutocompleteIndex + 1) % items.length;
    updateAutocompleteSelection(items);
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedAutocompleteIndex = selectedAutocompleteIndex <= 0 ? items.length - 1 : selectedAutocompleteIndex - 1;
    updateAutocompleteSelection(items);
  }
  else if (event.key === 'Enter' && selectedAutocompleteIndex >= 0) {
    event.preventDefault();
    items[selectedAutocompleteIndex].click();
  }
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

// ВАЖНО: Переменные глобальные для доступа из index.html
window.recognition = null;
window.isListening = false;

// Инициализация голосового поиска
function initVoiceSearch() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Голосовой поиск не поддерживается в этом браузере');
    return false;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.recognition = new SpeechRecognition();
  
  window.recognition.lang = 'ru-RU';
  window.recognition.continuous = false;
  window.recognition.interimResults = false;
  window.recognition.maxAlternatives = 1;
  
  window.recognition.onstart = function() {
    console.log('🎤 Голосовой поиск активирован');
    window.isListening = true;
    updateVoiceButton(true);
  };
  
  window.recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript;
    console.log('🎤 Распознано:', transcript);
    
    const searchInput = document.getElementById('search');
    searchInput.value = transcript;
    
    if (typeof applyFilters === 'function') {
      applyFilters();
    }
    
    showVoiceResultToast(transcript);
  };
  
  window.recognition.onerror = function(event) {
    console.error('❌ Ошибка голосового поиска:', event.error);
    window.isListening = false;
    updateVoiceButton(false);
    
    let errorMessage = 'Ошибка распознавания речи';
    if (event.error === 'no-speech') {
      errorMessage = 'Речь не обнаружена. Попробуйте снова.';
    } else if (event.error === 'not-allowed') {
      errorMessage = 'Доступ к микрофону запрещен.';
    } else if (event.error === 'network') {
      errorMessage = 'Ошибка сети.';
    }
    
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: errorMessage,
        timer: 3000
      });
    }
  };
  
  window.recognition.onend = function() {
    console.log('🎤 Голосовой поиск завершен');
    window.isListening = false;
    updateVoiceButton(false);
  };
  
  return true;
}

// Экспортируем функцию глобально
window.initVoiceSearch = initVoiceSearch;

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

// ==================== СТИЛИ ====================

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
`;
document.head.appendChild(autocompleteStyles);

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('search');
  
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      showAutocomplete(this);
    });
    
    searchInput.addEventListener('keydown', handleAutocompleteKeydown);
    
    document.addEventListener('click', function(e) {
      if (!searchInput.contains(e.target) && e.target.id !== 'autocompleteDropdown') {
        hideAutocomplete();
      }
    });
  }
  
  initVoiceSearch();
});

console.log('✅ Модуль расширенного поиска загружен');
