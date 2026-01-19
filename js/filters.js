
// ==================== УПРАВЛЕНИЕ КАТЕГОРИЯМИ (АДМИН) ====================

// Открыть окно управления категориями
async function openCategoriesManagement() {
  toggleSideMenu();
  
  try {
    // Стандартные категории
    const standardCategories = [
      { name: 'все', label: 'Все товары', standard: true },
      { name: 'ножницы', label: '✂️ Ножницы', standard: true },
      { name: 'скотч', label: 'Скотч', standard: true },
      { name: 'нож', label: '🔪 Нож', standard: true },
      { name: 'корейские', label: 'Корейские товары', standard: true },
      { name: 'часы', label: '⌚ Часы', standard: true },
      { name: 'электроника', label: '🔌 Электроника', standard: true },
      { name: 'бытовые', label: 'Бытовые техники', standard: true }
    ];
    
    // Загружаем категории продавцов
    const sellerCategories = [];
    try {
      const snapshot = await db.collection('seller_categories').get();
      snapshot.forEach(doc => {
        sellerCategories.push({ id: doc.id, ...doc.data() });
      });
    } catch (e) {
      console.log('Коллекция seller_categories пуста');
    }
    
    // Собираем уникальные категории из товаров
    const productCategories = new Set();
    products.forEach(p => {
      if (p.category && p.sellerId) {
        const catLower = p.category.toLowerCase();
        if (!standardCategories.find(c => c.name === catLower)) {
          productCategories.add(catLower);
        }
      }
    });
    
    let html = `
      <div style="max-height:70vh; overflow-y:auto;">
        <h3 style="margin-bottom:15px;">📁 Управление категориями</h3>
        
        <h4 style="margin:15px 0 10px; color:#28a745;">✅ Стандартные категории</h4>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
    `;
    
    standardCategories.forEach(cat => {
      const count = products.filter(p => (p.category || 'все').toLowerCase() === cat.name).length;
      html += `
        <div style="padding:8px 12px; background:#e8f5e9; border-radius:6px; font-size:13px;">
          ${cat.label} <span style="color:#666;">(${count})</span>
        </div>
      `;
    });
    
    html += `</div>`;
    
    // Категории продавцов
    html += `<h4 style="margin:15px 0 10px; color:#ff6b35;">🏪 Категории продавцов</h4>`;
    
    const allSellerCats = [...new Set([...sellerCategories.map(c => c.name?.toLowerCase()), ...productCategories])];
    
    if (allSellerCats.length === 0) {
      html += `<p style="color:#666; font-size:13px;">Категорий от продавцов пока нет</p>`;
    } else {
      html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
      
      allSellerCats.forEach(catName => {
        if (!catName) return;
        const count = products.filter(p => (p.category || '').toLowerCase() === catName).length;
        const catDoc = sellerCategories.find(c => c.name?.toLowerCase() === catName);
        
        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#fff8f5; border:1px solid #ffe0cc; border-radius:8px;">
            <div>
              <span style="font-weight:600;">🏪 ${catName.charAt(0).toUpperCase() + catName.slice(1)}</span>
              <span style="color:#666; font-size:12px; margin-left:8px;">(${count} товаров)</span>
            </div>
            <button onclick="deleteCategory('${catName}')" style="padding:6px 12px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">🗑️ Удалить</button>
          </div>
        `;
      });
      
      html += `</div>`;
    }
    
    html += '</div>';
    
    Swal.fire({
      title: '',
      html: html,
      showConfirmButton: true,
      confirmButtonText: 'Закрыть',
      width: '95%'
    });
    
  } catch (error) {
    console.error('Ошибка загрузки категорий:', error);
    Swal.fire('Ошибка', 'Не удалось загрузить категории', 'error');
  }
}

// Удалить категорию
async function deleteCategory(categoryName) {
  const productsInCategory = products.filter(p => (p.category || '').toLowerCase() === categoryName.toLowerCase());
  
  const result = await Swal.fire({
    title: 'Удалить категорию?',
    html: `Категория "<b>${categoryName}</b>" содержит <b>${productsInCategory.length}</b> товаров.<br><br>Товары будут перемещены в категорию "Все товары".`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Удалить',
    confirmButtonColor: '#dc3545',
    cancelButtonText: 'Отмена'
  });
  
  if (result.isConfirmed) {
    try {
      const batch = db.batch();
      
      // Удаляем из коллекции seller_categories (ищем по name в разных регистрах)
      const snapshot = await db.collection('seller_categories').get();
      snapshot.forEach(doc => {
        const docData = doc.data();
        if (docData.name && docData.name.toLowerCase() === categoryName.toLowerCase()) {
          batch.delete(doc.ref);
          console.log('Удаляем категорию из seller_categories:', doc.id, docData.name);
        }
      });
      
      // Перемещаем товары в категорию "все"
      for (const product of productsInCategory) {
        batch.update(db.collection('products').doc(product.id), { category: 'все' });
        console.log('Перемещаем товар в "все":', product.title);
      }
      
      await batch.commit();
      
      // Обновляем локальные данные
      productsInCategory.forEach(p => p.category = 'все');
      
      Swal.fire('Готово', 'Категория удалена, товары перемещены в "Все товары"', 'success');
      loadSellerCategories(); // Обновляем кнопки категорий
      openCategoriesManagement(); // Обновляем окно
      
    } catch (error) {
      console.error('Ошибка удаления категории:', error);
      Swal.fire('Ошибка', 'Не удалось удалить категорию: ' + (error.message || error), 'error');
    }
  }
}

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