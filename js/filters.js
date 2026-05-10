
// ==================== УПРАВЛЕНИЕ КАТЕГОРИЯМИ ====================
// Функции управления категориями перенесены в admin-categories.html

// ===== FILTERS & SEARCH MODULE =====
// Расширенный поиск, фильтры, теги

// ==================== РАСШИРЕННЫЙ ПОИСК И ФИЛЬТРЫ ====================

// Переключение панели фильтров
function toggleFilters() {
  const filters = document.getElementById('searchFilters');
  const btn = document.getElementById('filterToggleBtn');
  
  if (filters.classList.contains('show')) {
    filters.classList.remove('show');
    btn.classList.remove('active');
  } else {
    filters.classList.add('show');
    btn.classList.add('active');
  }
}

// Живой поиск при вводе (с оптимизацией для iOS)
let searchTimeout;
let _liveSearchComposing = false;

function liveSearch() {
  if (_liveSearchComposing) return;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderProducts();
    updateSearchResultsInfo();
  }, _isIOS ? 400 : 300);
}

// Инициализация composition events для главного поиска
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.addEventListener('compositionstart', () => { _liveSearchComposing = true; });
    searchInput.addEventListener('compositionend', () => { _liveSearchComposing = false; liveSearch(); });
  }
});

// Применить все фильтры
function applyFilters() {
  searchFiltersActive = true;
  renderProducts();
  updateSearchResultsInfo();
  updateActiveTags();
}

// Сбросить все фильтры
function resetFilters() {
  document.getElementById('search').value = '';
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('stockFilter').value = 'all';
  document.getElementById('sort').value = '';
  
  searchFiltersActive = false;
  document.getElementById('searchResultsInfo').style.display = 'none';
  document.getElementById('activeTags').innerHTML = '';
  
  renderProducts();
}

// Обновить информацию о результатах поиска
function updateSearchResultsInfo() {
  const searchVal = document.getElementById('search').value.trim();
  const priceMin = document.getElementById('priceMin').value;
  const priceMax = document.getElementById('priceMax').value;
  const stockFilter = document.getElementById('stockFilter').value;
  
  const hasFilters = searchVal || priceMin || priceMax || stockFilter !== 'all';
  const infoBlock = document.getElementById('searchResultsInfo');
  
  if (hasFilters) {
    infoBlock.style.display = 'flex';
    
    // Склонение слова "товар"
    const count = lastSearchResults;
    let word = 'товаров';
    if (count % 10 === 1 && count % 100 !== 11) word = 'товар';
    else if ([2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100)) word = 'товара';
    
    document.getElementById('resultsText').textContent = `Найдено: ${count} ${word}`;
  } else {
    infoBlock.style.display = 'none';
  }
}

// Обновить активные теги фильтров
function updateActiveTags() {
  const tags = document.getElementById('activeTags');
  tags.innerHTML = '';
  
  const searchVal = document.getElementById('search').value.trim();
  const priceMin = document.getElementById('priceMin').value;
  const priceMax = document.getElementById('priceMax').value;
  const stockFilter = document.getElementById('stockFilter').value;
  const sortVal = document.getElementById('sort').value;
  
  if (searchVal) {
    tags.innerHTML += `<span class="search-tag">🔍 "${searchVal}" <span class="remove-tag" onclick="clearSearchField()">×</span></span>`;
  }
  
  if (priceMin || priceMax) {
    const priceText = priceMin && priceMax ? `${priceMin} - ${priceMax} сом` : 
                      priceMin ? `от ${priceMin} сом` : `до ${priceMax} сом`;
    tags.innerHTML += `<span class="search-tag">💰 ${priceText} <span class="remove-tag" onclick="clearPriceFilter()">×</span></span>`;
  }
  
  if (stockFilter === 'instock') {
    tags.innerHTML += `<span class="search-tag">📦 В наличии <span class="remove-tag" onclick="clearStockFilter()">×</span></span>`;
  } else if (stockFilter === 'outofstock') {
    tags.innerHTML += `<span class="search-tag">📦 Нет в наличии <span class="remove-tag" onclick="clearStockFilter()">×</span></span>`;
  }
  
  if (sortVal) {
    const sortLabels = {
      'asc': 'Сначала дешёвые',
      'desc': 'Сначала дорогие',
      'name_asc': 'А-Я',
      'name_desc': 'Я-А',
      'new': 'Сначала новые'
    };
    tags.innerHTML += `<span class="search-tag">📊 ${sortLabels[sortVal] || sortVal} <span class="remove-tag" onclick="clearSort()">×</span></span>`;
  }
}

// Очистка отдельных фильтров
function clearSearchField() {
  document.getElementById('search').value = '';
  applyFilters();
}

function clearPriceFilter() {
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  applyFilters();
}

function clearStockFilter() {
  document.getElementById('stockFilter').value = 'all';
  applyFilters();
}

function clearSort() {
  document.getElementById('sort').value = '';
  applyFilters();
}