// ===================================================================
// КЕРБЕН B2B Market — Product Renderer (рендеринг, поиск, цены)
// ===================================================================

// ПАГИНАЦИЯ: показываем товары порциями для быстрой отрисовки
const PRODUCTS_PER_PAGE = 24;
let _currentPage = 1;
let _allFilteredProducts = []; // Все отфильтрованные товары
let _isLoadingMore = false;
let _scrollObserver = null;

// На iPhone/медленных устройствах полный renderProducts на каждый символ сильно тормозит ввод.
// Поэтому делаем debounce с увеличенной задержкой для iOS.
let _renderProductsInputTimer = null;
let _isComposing = false; // Флаг для iOS автокоррекции
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const _debounceDelay = _isIOS ? 400 : 150; // Больше задержка для iOS

// УЛЬТРА-ОПТИМИЗАЦИЯ для iOS - максимально быстрый ввод
if (_isIOS) {
  document.addEventListener('DOMContentLoaded', function() {
    // Добавляем мета-тег для отключения зума на input
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
    
    // Стили для ультра-быстрого режима
    const style = document.createElement('style');
    style.id = 'ios-ultra-fast-styles';
    style.textContent = `
      /* ПОЛНОЕ ОТКЛЮЧЕНИЕ ВСЕХ ЭФФЕКТОВ на iOS */
      .admin-product-input {
        transition: none !important;
        animation: none !important;
        -webkit-transition: none !important;
        -webkit-animation: none !important;
        box-shadow: none !important;
        text-shadow: none !important;
        filter: none !important;
        -webkit-filter: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
    `;
    document.head.appendChild(style);
  });
}

function scheduleRenderProducts() {
  if (_isComposing) return; // Не рендерим во время автокоррекции
  clearTimeout(_renderProductsInputTimer);
  _renderProductsInputTimer = setTimeout(() => {
    renderProducts();
  }, _debounceDelay);
}

// Привязка событий к search/sort — после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
  const searchEl = document.getElementById('search');
  const sortEl = document.getElementById('sort');
  if (searchEl) {
    searchEl.addEventListener('compositionstart', () => { _isComposing = true; });
    searchEl.addEventListener('compositionend', () => { _isComposing = false; scheduleRenderProducts(); });
    searchEl.oninput = scheduleRenderProducts;
  }
  if (sortEl) {
    sortEl.onchange = renderProducts;
  }
});

// === ОПТИМИЗАЦИЯ: Debounced renderProducts ===
function renderProductsDebounced() {
  if (_renderProductsTimer) {
    clearTimeout(_renderProductsTimer);
  }
  _renderProductsPending = true;
  _renderProductsTimer = setTimeout(() => {
    _renderProductsPending = false;
    _renderProductsTimer = null;
    renderProductsCore();
  }, 100); // Ждём 100мс перед рендером
}

// Оригинальная функция
function renderProducts() {
  // Если уже запланирован рендер, не делаем сразу
  if (_renderProductsPending) return;
  renderProductsDebounced();
}

// Функция для получения переводов и синонимов поискового запроса
function getSearchTranslations(query) {
  const translations = [];
  
  // Приводим запрос к нижнему регистру для поиска в словаре
  const lowerQuery = query.toLowerCase();
  
  // Словарь популярных переводов (русский ↔ английский)
  const dictionary = {
    // Упаковка и расходники
    'стрейч': ['stretch', 'стреч', 'пленка', 'film'],
    'стреч': ['stretch', 'стрейч', 'пленка', 'film'],
    'stretch': ['стрейч', 'стреч', 'пленка'],
    'пленка': ['film', 'wrap', 'стрейч', 'стреч', 'плёнка'],
    'плёнка': ['film', 'wrap', 'пленка', 'стрейч'],
    'фольга': ['foil', 'tin', 'алюминиевая'],
    'foil': ['фольга', 'алюминиевая'],
    'скотч': ['tape', 'лента', 'adhesive'],
    'tape': ['скотч', 'лента'],
    'пакет': ['bag', 'package'],
    'bag': ['пакет', 'мешок'],
    
    // Инструменты
    'нож': ['knife', 'резак'],
    'knife': ['нож', 'резак'],
    'ножницы': ['scissors', 'ножнички'],
    'scissors': ['ножницы'],
    'молоток': ['hammer'],
    'hammer': ['молоток'],
    'отвертка': ['screwdriver'],
    'screwdriver': ['отвертка', 'отвёртка'],
    
    // Кухонные принадлежности
    'терка': ['grater', 'тёрка'],
    'тёрка': ['grater', 'терка'],
    'grater': ['терка', 'тёрка'],
    'открывалка': ['opener'],
    'opener': ['открывалка'],
    'чесалка': ['peeler'],
    'peeler': ['чесалка', 'овощечистка'],
    
    // Уборка
    'губка': ['sponge', 'мочалка'],
    'sponge': ['губка', 'мочалка'],
    'тряпка': ['cloth', 'салфетка'],
    'cloth': ['тряпка', 'салфетка'],
    'метла': ['broom', 'веник'],
    'broom': ['метла', 'веник'],
    'щетка': ['brush', 'щётка'],
    'brush': ['щетка', 'щётка'],
    
    // Насекомые
    'мухобойка': ['swatter', 'fly', 'мухабой'],
    'мухабой': ['мухобойка', 'swatter'],
    'swatter': ['мухобойка', 'мухабой'],
    'липучка': ['от мух', 'ловушка'],
    
    // Посуда
    'тарелка': ['plate', 'dish'],
    'plate': ['тарелка', 'блюдо'],
    'стакан': ['glass', 'cup'],
    'glass': ['стакан', 'стеклянный'],
    'ложка': ['spoon'],
    'spoon': ['ложка'],
    'вилка': ['fork'],
    'fork': ['вилка'],
    
    // Цвета
    'красный': ['red'],
    'red': ['красный'],
    'синий': ['blue'],
    'blue': ['синий', 'голубой'],
    'зеленый': ['green'],
    'green': ['зеленый', 'зелёный'],
    'желтый': ['yellow'],
    'yellow': ['желтый', 'жёлтый'],
    'черный': ['black'],
    'black': ['черный', 'чёрный'],
    'белый': ['white'],
    'white': ['белый'],
    'серый': ['gray', 'grey'],
    'gray': ['серый'],
    'grey': ['серый']
  };
  
  // Ищем переводы для каждого слова в запросе
  const words = lowerQuery.split(/\s+/);
  for (let word of words) {
    if (dictionary[word]) {
      translations.push(...dictionary[word]);
    }
  }
  
  // Также проверяем весь запрос целиком
  if (dictionary[lowerQuery]) {
    translations.push(...dictionary[lowerQuery]);
  }
  
  return [...new Set(translations)]; // Удаляем дубликаты
}

// Первичный рендер (при загрузке модуля)
renderProducts();

// Глобальный наблюдатель для изображений (чтобы не создавать новые каждый раз)
let globalImageObserver = null;

// Функция отображения товаров (ядро)
function renderProductsCore() {
  // Сохраняем список открытых деталей товаров перед перерисовкой
  const openDetails = [];
  document.querySelectorAll('[id^="product-details-"]').forEach(detail => {
    if (detail.style.display !== 'none') {
      openDetails.push(detail.id);
    }
  });
  
  // Рендер карточек в стиле AliExpress
  const container = document.getElementById('productTable');
  
  // ВАЖНО: Очищаем старые обработчики событий перед очисткой контейнера
  if (globalImageObserver) {
    globalImageObserver.disconnect();
  }
  
  // Очищаем контейнер
  container.innerHTML = '';
  
  // Сбрасываем пагинацию при новом рендере (поиск/фильтр/категория)
  _currentPage = 1;
  
  // ОПТИМИЗАЦИЯ: Используем DocumentFragment для пакетного добавления
  const fragment = document.createDocumentFragment();
  
  let filtered = isEditorMode ? products : products.filter(p => !p.blocked);
  
  // Продавец видит только свои товары
  if (userRole === 'seller' && currentSeller) {
    filtered = filtered.filter(p => p.sellerId === currentSeller.id);
  }
  
  // Корейский менеджер видит только корейские товары, часы и электронику
  if (userRole === 'korean') {
    filtered = filtered.filter(p => p.category && (p.category.toLowerCase() === 'корейские' || p.category.toLowerCase() === 'часы' || p.category.toLowerCase() === 'электроника'));
  }
  
  // Менеджер бытовых техник видит только бытовые техники
  if (userRole === 'appliances') {
    filtered = filtered.filter(p => p.category && p.category.toLowerCase() === 'бытовые');
  }
  
  // Фильтрация по категории (работает одинаково для всех)
  if (currentCategory === 'все') {
    // В разделе "Все товары" показываем товары с категорией "все" или без категории
    filtered = filtered.filter(p => !p.category || p.category.toLowerCase() === 'все');
  } else {
    // В других разделах показываем товары только выбранной категории
    filtered = filtered.filter(p => p.category && p.category.toLowerCase() === currentCategory.toLowerCase());
  }
  
  // Поиск по тексту с автоматическим переводом
  const q = (search && search.value) ? search.value.toLowerCase().trim() : '';
  let list = q ? filtered.filter(p => {
    const title = (p.title || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    const searchText = title + ' ' + desc;
    
    // Прямое совпадение
    if (searchText.includes(q)) return true;
    
    // Автоматический перевод через словарь синонимов
    const translations = getSearchTranslations(q);
    for (let translation of translations) {
      if (searchText.includes(translation)) return true;
    }
    
    return false;
  }) : filtered;
  
  // Фильтр по цене
  const priceMinEl = document.getElementById('priceMin');
  const priceMaxEl = document.getElementById('priceMax');
  const priceMin = priceMinEl ? parseFloat(priceMinEl.value) : NaN;
  const priceMax = priceMaxEl ? parseFloat(priceMaxEl.value) : NaN;
  
  if (!isNaN(priceMin)) {
    list = list.filter(p => (p.price || 0) >= priceMin);
  }
  if (!isNaN(priceMax)) {
    list = list.filter(p => (p.price || 0) <= priceMax);
  }
  
  // Фильтр по наличию
  const stockFilterEl = document.getElementById('stockFilter');
  const stockFilter = stockFilterEl ? stockFilterEl.value : 'all';
  
  if (stockFilter === 'instock') {
    list = list.filter(p => {
      const stock = typeof p.stock === 'number' ? p.stock : null;
      return stock === null || stock > 0;
    });
  } else if (stockFilter === 'outofstock') {
    list = list.filter(p => {
      const stock = typeof p.stock === 'number' ? p.stock : null;
      return stock !== null && stock <= 0;
    });
  }
  
  // Сортировка
  const sortEl = document.getElementById('sort');
  const sortVal = sortEl ? sortEl.value : '';
  
  if (sortVal === 'asc') {
    list.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortVal === 'desc') {
    list.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sortVal === 'name_asc') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
  } else if (sortVal === 'name_desc') {
    list.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'ru'));
  } else if (sortVal === 'new') {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  
  // Сохраняем количество результатов для информационного блока
  lastSearchResults = list.length;

  // ПАГИНАЦИЯ: сохраняем полный список, показываем только первую порцию
  _allFilteredProducts = list;
  const pageList = list.slice(0, PRODUCTS_PER_PAGE * _currentPage);

  pageList.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-product-id', p.id);

    const hasStock = typeof p.stock === 'number' && isFinite(p.stock);
    const stock = hasStock ? Math.max(0, Math.floor(p.stock)) : null;
    const outOfStock = stock !== null && stock <= 0;
    // Для товаров-пачек показываем "пачка" вместо "шт"
    const unitLabel = p.isPack ? 'пачка' : 'шт';
    // Улучшенная информация о пачке и коробке
    let packInfoHtml = '';
    if (p.showPackInfo && p.packQty) {
      packInfoHtml = `
        <div style="background:#f3e5f5;border-radius:6px;padding:6px 8px;margin:4px 0;font-size:11px;">
          <div style="color:#7b1fa2;font-weight:700;">📦 1 пачка = ${p.packQty} шт</div>
        </div>
      `;
    }
    const stockHtml = stock !== null
      ? `<div class="card-stock ${outOfStock ? 'out' : ''}">Остаток: ${outOfStock ? 'Нет' : stock} ${unitLabel}</div>`
      : '';
    const blockedBadgeHtml = (p.blocked || outOfStock) ? `<div class="blocked-badge">🚫</div>` : '';
    // Добавляем значок пачки
    const packBadgeHtml = p.isPack ? `<div class="pack-badge">ПАЧКА</div>` : '';
    // Добавляем значок галереи если есть дополнительные фото
    const hasExtraImages = p.extraImages && Array.isArray(p.extraImages) && p.extraImages.length > 0;
    const galleryBadgeHtml = hasExtraImages ? `<div class="product-gallery-badge" onclick="event.stopPropagation(); showProductGallery('${p.id}')">📷 +${p.extraImages.length}</div>` : '';
    // Добавляем кнопку избранного (сердечко) - только для обычных пользователей
    const heartIcon = isFavorite(p.id) 
      ? '<svg viewBox="0 0 24 24" width="24" height="24" fill="#e91e63" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#333" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    const favoriteHtml = !isAdmin ? `<button class="favorite-btn ${isFavorite(p.id) ? 'active' : ''}" data-product-id="${p.id}" onclick="event.stopPropagation(); toggleFavorite('${p.id}', this)">${heartIcon}</button>` : '';
    const buyDisabledAttr = outOfStock ? 'disabled' : '';
    const qtyDisabledAttr = outOfStock ? 'disabled' : '';
    const buyLabel = outOfStock ? 'Нет в наличии' : 'Купить';

    card.innerHTML = `
        <div class="card-image" style="position:relative; background:#f0f0f0;">
        ${blockedBadgeHtml}
        ${packBadgeHtml}
        ${galleryBadgeHtml}
        ${favoriteHtml}
        ${p.createdAt && (Date.now() - p.createdAt) < 4 * 24 * 60 * 60 * 1000 ? `<div class="new-badge">NEW</div>` : ''}
        ${isEditorMode ? `<div style="position:absolute;top:5px;left:5px;background:rgba(0,123,255,0.9);color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;z-index:1;">#${idx + 1}</div>` : ''}
        ${p.image ? `<img referrerpolicy="no-referrer" loading="lazy" src="${getImageUrl(p.image, 300)}" alt="${p.title || ''}" onclick="openProductImage('${p.id}')" onload="this.classList.add('loaded')" onerror="handleImageError(this, '${p.image}')" style="cursor:pointer; width:100%; height:100%; object-fit:contain;">` : `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#999;font-size:14px;text-align:center;">📷 Нет фото</div>`}
      </div>
      <div class="card-body"
        ${isEditorMode ? `
          <!-- Компактная карточка для режима редактора -->
          <div style="font-weight:600; color:#333; font-size:14px; margin-bottom:6px;">${p.title||'Товар'}</div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">
            <span style="font-size:16px; font-weight:700; color:#e53935;">${p.price||0} сом</span>
          </div>
          <div style="font-size:12px; color:#666; margin-bottom:8px;">
            ${stock !== null ? `📦 Остаток: ${stock}` : '📦 Без лимита'} ${p.isPack ? '| 📦 Пачка' : ''}
          </div>
          <button onclick="openEditProductModal('${p.id}')" style="width:100%; background:linear-gradient(135deg,#007bff,#0056b3); color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;">✏️ Редактировать</button>
        ` : `
          <div class="card-title"><div>${p.title||''}</div></div>
          ${packInfoHtml}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div class="card-price">${(p.price || '0')} сом${p.isPack ? ' / пачка' : ''}</div>
            ${p.oldPrice ? `<div class="card-oldprice">${p.oldPrice} сом</div>` : ''}
          </div>
          ${p.showPricePerUnit && p.isPack && p.packQty ? `<div style="font-size:12px;color:#7b1fa2;background:#f3e5f5;padding:4px 8px;border-radius:4px;margin-top:3px;">💰 1 шт = <span style="font-weight:700;color:#e53935;">${((p.price || 0) / (p.packQty || 1)).toFixed(2)}</span> сом${p.optPrice ? ` | Опт: <span style="font-weight:700;color:#007bff;">${((p.optPrice || 0) / (p.packQty || 1)).toFixed(2)}</span> сом/шт` : ''}</div>` : ''}
          <div class="card-opt-info" data-opt-id="${p.id}" style="font-size:12px;color:#007bff;margin-top:2px;">
            ${p.optPrice && p.optQty ? `Опт: ${p.optPrice} сом/${p.isPack ? 'пачка' : 'шт'} при ${p.optQty} ${p.isPack ? 'пачек' : 'шт'}` : ''}
          </div>
          ${stockHtml}
          ${(p.category === 'корейские' || p.category === 'часы' || p.category === 'электроника') && p.description ? `
            <div style="display:flex; flex-direction:column; margin-top:6px;">
              <button onclick="showProductDetailModal('${p.id}')" style="width:100%; padding:8px; background:linear-gradient(135deg, #ff9800, #f57c00); color:white; border:none; border-radius:6px 6px 0 0; cursor:pointer; font-size:13px; font-weight:500; margin:0;">📝 Описание товара</button>
              ${(boxPurchaseMode || (p.isPack && p.useQtyButtons)) ? `
                <div class="pack-controls" style="background:#f8f9fa; padding:12px; border-radius:0 0 6px 6px;">
                  <button class="pack-btn" onclick="decrementPack('${p.id}')" ${outOfStock ? 'disabled' : ''}>−</button>
                  <div class="pack-qty-display" id="pack-qty-${p.id}" style="width:90px;text-align:center;font-size:18px;font-weight:700;border:2px solid #4caf50;border-radius:8px;padding:10px 5px;background:#e8f5e9;display:inline-block;min-height:24px;color:#2e7d32;">0 шт</div>
                  <button class="pack-btn" onclick="incrementPack('${p.id}', this)" ${outOfStock ? 'disabled' : ''}>+</button>
                </div>
                <div class="box-mode-hint" style="font-size:11px;color:#2e7d32;background:#e8f5e9;padding:6px;border-radius:4px;text-align:center;margin-top:4px;font-weight:600;">📦 +1 нажатие = ${p.unitsPerBox || 72} шт (коробка)</div>
              ` : (p.useQtyButtons && !p.isPack ? `
                <div class="pack-controls" style="background:#f8f9fa; padding:12px; border-radius:0 0 6px 6px;">
                  <button class="pack-btn" onclick="decrementQty('${p.id}')" ${outOfStock ? 'disabled' : ''}>−</button>
                  <div contenteditable="true" class="pack-qty-display" id="qty-display-${p.id}" style="width:70px;text-align:center;font-size:18px;font-weight:700;border:2px solid #90caf9;border-radius:8px;padding:10px 5px;background:#fff;display:inline-block;min-height:24px;" ${outOfStock ? 'contenteditable="false"' : ''}>0</div>
                  <button class="pack-btn" onclick="incrementQty('${p.id}', this)" ${outOfStock ? 'disabled' : ''}>+</button>
                </div>
                <button onclick="applyQtyInput('${p.id}')" style="width:100%;margin-top:4px;padding:8px;background:#1565c0;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">✔ Применить</button>
                ${p.minQty > 1 ? `<div style="font-size:10px;color:#1565c0;background:#e3f2fd;padding:4px 6px;border-radius:0 0 6px 6px;text-align:center;">💡 Каждое нажатие + добавляет ${p.minQty} шт</div>` : ''}
              ` : `
                <div style="display:flex; gap:0; margin:0; padding:0;">
                  <input type="text" inputmode="numeric" value="${p.minQty||1}" class="card-qty-input" data-product-id="${p.id}" style="text-align:center; font-size:16px; border-radius:0 0 0 6px; margin:0; flex:1;" oninput="updateCardPrice(this, '${p.id}'); this.dataset.lastValue=this.value;" onfocus="this.dataset.lastValue=this.value; this.select();" placeholder="${p.isPack ? 'пачек' : 'шт'}" ${qtyDisabledAttr} />
                  <button onclick="addToCartById('${p.id}', this)" style="background:linear-gradient(90deg,#ff7a00,#ff3b00); color:white; border:none; padding:8px 12px; border-radius:0 0 6px 0; cursor:pointer; margin:0; flex:1;" ${buyDisabledAttr}>${buyLabel}</button>
                </div>
              `)}
            </div>
          ` : `
          ${(boxPurchaseMode || (p.isPack && p.useQtyButtons)) ? `
            <div class="pack-controls" style="margin-top:6px;">
              <button class="pack-btn" onclick="decrementPack('${p.id}')" ${outOfStock ? 'disabled' : ''}>−</button>
              <div class="pack-qty-display" id="pack-qty-${p.id}" style="width:90px;text-align:center;font-size:18px;font-weight:700;border:2px solid #4caf50;border-radius:8px;padding:10px 5px;background:#e8f5e9;display:inline-block;min-height:24px;color:#2e7d32;">0 шт</div>
              <button class="pack-btn" onclick="incrementPack('${p.id}', this)" ${outOfStock ? 'disabled' : ''}>+</button>
            </div>
            <div class="box-mode-hint" style="font-size:11px;color:#2e7d32;background:#e8f5e9;padding:6px;border-radius:4px;text-align:center;margin-top:4px;font-weight:600;">📦 +1 нажатие = ${p.unitsPerBox || 72} шт (коробка)</div></div>
          ` : (p.useQtyButtons && !p.isPack ? `
            <div class="pack-controls" style="margin-top:6px;">
              <button class="pack-btn" onclick="decrementQty('${p.id}')" ${outOfStock ? 'disabled' : ''}>−</button>
              <div contenteditable="true" class="pack-qty-display" id="qty-display-${p.id}" style="width:70px;text-align:center;font-size:18px;font-weight:700;border:2px solid #90caf9;border-radius:8px;padding:10px 5px;background:#fff;display:inline-block;min-height:24px;" ${outOfStock ? 'contenteditable="false"' : ''}>0</div>
              <button class="pack-btn" onclick="incrementQty('${p.id}', this)" ${outOfStock ? 'disabled' : ''}>+</button>
            </div>
            <button onclick="applyQtyInput('${p.id}')" style="width:100%;margin-top:4px;padding:8px;background:#1565c0;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">✔ Применить</button>
            ${p.minQty > 1 ? `<div style="font-size:10px;color:#1565c0;background:#e3f2fd;padding:4px 6px;border-radius:4px;text-align:center;margin-top:4px;">💡 Каждое нажатие + добавляет ${p.minQty} шт</div>` : ''}
          ` : `
            <div class="card-actions" style="margin-top:6px;">
              <input type="text" inputmode="numeric" value="${p.minQty||1}" class="card-qty-input" data-product-id="${p.id}" style="text-align:center; font-size:16px;" oninput="updateCardPrice(this, '${p.id}'); this.dataset.lastValue=this.value;" onfocus="this.dataset.lastValue=this.value; this.select();" placeholder="${p.isPack ? 'пачек' : 'шт'}" ${qtyDisabledAttr} />
              <button onclick="addToCartById('${p.id}', this)" ${buyDisabledAttr}>${buyLabel}</button>
            </div>
          `)}
          `}
        `}
      </div>
    `;

    fragment.appendChild(card);
    // Непосредственно обновляем цену на карточке в зависимости от текущего значения поля количества
    try {
      const qtyInput = card.querySelector('.card-qty-input');
      if (qtyInput) updateCardPriceNow(qtyInput, p.id);
    } catch (e) {
      console.error('updateCardPrice init error', e);
    }
  });

  // ОПТИМИЗАЦИЯ: Одно обновление DOM вместо множества
  // (контейнер уже очищен в начале функции)
  container.appendChild(fragment);
  
  // Улучшенная ленивая загрузка изображений
  // ВАЖНО: Используем ОДИН глобальный наблюдатель вместо создания нового каждый раз
  if ('IntersectionObserver' in window) {
    // Создаем наблюдатель только если его еще нет
    if (!globalImageObserver) {
      globalImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (!img.classList.contains('loaded')) {
              // Изображение уже загружается браузером благодаря loading="lazy"
              // Просто добавляем класс для плавного появления
              if (img.complete) {
                img.classList.add('loaded');
              }
            }
            observer.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px' // Начинаем загрузку за 50px до появления в зоне видимости
      });
    }
    
    // Наблюдаем за всеми изображениями товаров
    container.querySelectorAll('.card-image img').forEach(img => {
      globalImageObserver.observe(img);
    });
  }

  // ПАГИНАЦИЯ: добавляем "Загрузить ещё" если есть ещё товары
  if (_allFilteredProducts.length > PRODUCTS_PER_PAGE * _currentPage) {
    const remaining = _allFilteredProducts.length - (PRODUCTS_PER_PAGE * _currentPage);
    const loadMoreDiv = document.createElement('div');
    loadMoreDiv.id = 'loadMoreProducts';
    loadMoreDiv.style.cssText = 'grid-column:1/-1;text-align:center;padding:20px;';
    loadMoreDiv.innerHTML = `
      <button onclick="loadMoreProducts()" style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;padding:14px 40px;border-radius:25px;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(102,126,234,0.4);">
        Показать ещё (${remaining} товаров)
      </button>
    `;
    container.appendChild(loadMoreDiv);
    
    // Авто-загрузка при скроле к низу
    if (_scrollObserver) _scrollObserver.disconnect();
    _scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !_isLoadingMore) {
          loadMoreProducts();
        }
      });
    }, { rootMargin: '200px' });
    _scrollObserver.observe(loadMoreDiv);
  }

  // Восстанавливаем открытые детали после перерисовки
  openDetails.forEach(detailId => {
    const detail = document.getElementById(detailId);
    if (detail) {
      detail.style.display = 'block';
      // Обновляем текст кнопки
      const productId = detailId.replace('product-details-', '');
      const card = document.querySelector(`[data-product-id="${productId}"]`);
      if (card) {
        const btn = card.querySelector('button[onclick^="toggleProductDetails"]');
        if (btn) btn.textContent = '▲ Скрыть';
      }
    }
  });

  // Инициализируем отображение количества для товаров-пачек и с кнопками +/-
  products.forEach(p => {
    if (p.isPack) {
      updatePackDisplay(p.id);
    }
    if (p.useQtyButtons) {
      updateQtyDisplay(p.id);
    }
  });
}

// ПАГИНАЦИЯ: подгрузка следующей порции товаров без полной перерисовки
function loadMoreProducts() {
  if (_isLoadingMore || !_allFilteredProducts.length) return;
  _isLoadingMore = true;
  
  const container = document.getElementById('productTable');
  
  // Удаляем кнопку "Загрузить ещё"
  const loadMoreEl = document.getElementById('loadMoreProducts');
  if (loadMoreEl) loadMoreEl.remove();
  
  _currentPage++;
  const start = PRODUCTS_PER_PAGE * (_currentPage - 1);
  const end = PRODUCTS_PER_PAGE * _currentPage;
  const nextBatch = _allFilteredProducts.slice(start, end);
  
  if (!nextBatch.length) {
    _isLoadingMore = false;
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  nextBatch.forEach((p, batchIdx) => {
    const idx = start + batchIdx;
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-product-id', p.id);
    
    const hasStock = typeof p.stock === 'number' && isFinite(p.stock);
    const stock = hasStock ? Math.max(0, Math.floor(p.stock)) : null;
    const outOfStock = stock !== null && stock <= 0;
    const unitLabel = p.isPack ? 'пачка' : 'шт';
    let packInfoHtml = '';
    if (p.showPackInfo && p.packQty) {
      packInfoHtml = `<div style="background:#f3e5f5;border-radius:6px;padding:6px 8px;margin:4px 0;font-size:11px;"><div style="color:#7b1fa2;font-weight:700;">📦 1 пачка = ${p.packQty} шт</div></div>`;
    }
    const stockHtml = stock !== null
      ? `<div class="card-stock ${outOfStock ? 'out' : ''}">Остаток: ${outOfStock ? 'Нет' : stock} ${unitLabel}</div>`
      : '';
    const blockedBadgeHtml = (p.blocked || outOfStock) ? `<div class="blocked-badge">🚫</div>` : '';
    const packBadgeHtml = p.isPack ? `<div class="pack-badge">ПАЧКА</div>` : '';
    const hasExtraImages = p.extraImages && Array.isArray(p.extraImages) && p.extraImages.length > 0;
    const galleryBadgeHtml = hasExtraImages ? `<div class="product-gallery-badge" onclick="event.stopPropagation(); showProductGallery('${p.id}')">📷 +${p.extraImages.length}</div>` : '';
    const heartIcon = isFavorite(p.id) 
      ? '<svg viewBox="0 0 24 24" width="24" height="24" fill="#e91e63" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#333" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    const favoriteHtml = !isAdmin ? `<button class="favorite-btn ${isFavorite(p.id) ? 'active' : ''}" data-product-id="${p.id}" onclick="event.stopPropagation(); toggleFavorite('${p.id}', this)">${heartIcon}</button>` : '';
    const buyDisabledAttr = outOfStock ? 'disabled' : '';
    const qtyDisabledAttr = outOfStock ? 'disabled' : '';
    const buyLabel = outOfStock ? 'Нет в наличии' : 'Купить';
    
    card.innerHTML = `
      <div class="card-image" style="position:relative; background:#f0f0f0;">
        ${blockedBadgeHtml}${packBadgeHtml}${galleryBadgeHtml}${favoriteHtml}
        ${p.createdAt && (Date.now() - p.createdAt) < 4 * 24 * 60 * 60 * 1000 ? `<div class="new-badge">NEW</div>` : ''}
        ${p.image ? `<img referrerpolicy="no-referrer" loading="lazy" src="${getImageUrl(p.image, 300)}" alt="${p.title || ''}" onclick="openProductImage('${p.id}')" onload="this.classList.add('loaded')" onerror="handleImageError(this, '${p.image}')" style="cursor:pointer; width:100%; height:100%; object-fit:contain;">` : `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#999;font-size:14px;text-align:center;">📷 Нет фото</div>`}
      </div>
      <div class="card-body">
        <div class="card-title"><div>${p.title||''}</div></div>
        ${packInfoHtml}
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div class="card-price">${(p.price || '0')} сом${p.isPack ? ' / пачка' : ''}</div>
          ${p.oldPrice ? `<div class="card-oldprice">${p.oldPrice} сом</div>` : ''}
        </div>
        <div class="card-opt-info" data-opt-id="${p.id}" style="font-size:12px;color:#007bff;margin-top:2px;">
          ${p.optPrice && p.optQty ? `Опт: ${p.optPrice} сом/${p.isPack ? 'пачка' : 'шт'} при ${p.optQty} ${p.isPack ? 'пачек' : 'шт'}` : ''}
        </div>
        ${stockHtml}
        <div class="card-actions" style="margin-top:6px;">
          <input type="text" inputmode="numeric" value="${p.minQty||1}" class="card-qty-input" data-product-id="${p.id}" style="text-align:center; font-size:16px;" oninput="updateCardPrice(this, '${p.id}'); this.dataset.lastValue=this.value;" onfocus="this.dataset.lastValue=this.value; this.select();" placeholder="${p.isPack ? 'пачек' : 'шт'}" ${qtyDisabledAttr} />
          <button onclick="addToCartById('${p.id}', this)" ${buyDisabledAttr}>${buyLabel}</button>
        </div>
      </div>
    `;
    
    fragment.appendChild(card);
    try {
      const qtyInput = card.querySelector('.card-qty-input');
      if (qtyInput) updateCardPriceNow(qtyInput, p.id);
    } catch (e) {}
  });
  
  container.appendChild(fragment);
  
  // Наблюдаем за новыми изображениями
  if (globalImageObserver) {
    container.querySelectorAll('.card-image img:not(.loaded)').forEach(img => {
      globalImageObserver.observe(img);
    });
  }
  
  // Обновляем пачки/количество
  nextBatch.forEach(p => {
    if (p.isPack && typeof updatePackDisplay === 'function') updatePackDisplay(p.id);
    if (p.useQtyButtons && typeof updateQtyDisplay === 'function') updateQtyDisplay(p.id);
  });
  
  // Добавляем кнопку "ещё" если остались товары
  if (_allFilteredProducts.length > end) {
    const remaining = _allFilteredProducts.length - end;
    const loadMoreDiv = document.createElement('div');
    loadMoreDiv.id = 'loadMoreProducts';
    loadMoreDiv.style.cssText = 'grid-column:1/-1;text-align:center;padding:20px;';
    loadMoreDiv.innerHTML = `
      <button onclick="loadMoreProducts()" style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;padding:14px 40px;border-radius:25px;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(102,126,234,0.4);">
        Показать ещё (${remaining} товаров)
      </button>
    `;
    container.appendChild(loadMoreDiv);
    
    if (_scrollObserver) _scrollObserver.disconnect();
    _scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !_isLoadingMore) {
          loadMoreProducts();
        }
      });
    }, { rootMargin: '200px' });
    _scrollObserver.observe(loadMoreDiv);
  }
  
  _isLoadingMore = false;
}

// Обновляет отображаемую цену в карточке товара в реальном времени
// На iPhone частые oninput могут лагать, поэтому ограничиваем обновления 1 раз/кадр.
const _updateCardPricePending = new WeakMap();

function updateCardPrice(inputEl, productId) {
  try {
    if (!inputEl) return;

    const prev = _updateCardPricePending.get(inputEl);
    if (prev) {
      prev.productId = productId;
      return;
    }

    const state = { productId };
    _updateCardPricePending.set(inputEl, state);
    const raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);

    raf(() => {
      _updateCardPricePending.delete(inputEl);
      updateCardPriceNow(inputEl, state.productId);
    });
  } catch (err) {
    console.error('updateCardPrice error', err);
  }
}

function updateCardPriceNow(inputEl, productId) {
  try {
    let qty = parseInt(inputEl.value, 10);
    // Если поле пустое или NaN - не трогаем, пусть пользователь вводит
    if (isNaN(qty) || inputEl.value === '') {
      return;
    }
    if (qty < 0) qty = 0;
    
    const product = products.find(p => p.id === productId) || {};
    const card = inputEl.closest && inputEl.closest('.product-card');
    if (!card) return;
    
    // Проверка минимального количества - показываем предупреждение визуально
    const minQty = product.minQty || 1;
    let minQtyWarning = card.querySelector('.min-qty-warning');
    if (qty < minQty && qty > 0) {
      // Показываем предупреждение о минимальном количестве
      if (!minQtyWarning) {
        minQtyWarning = document.createElement('div');
        minQtyWarning.className = 'min-qty-warning';
        minQtyWarning.style.cssText = 'font-size:11px;color:#c62828;background:#ffebee;padding:4px 8px;border-radius:4px;text-align:center;margin-top:4px;';
        inputEl.parentElement.insertAdjacentElement('afterend', minQtyWarning);
      }
      minQtyWarning.textContent = `⚠️ Минимум: ${minQty} шт`;
      inputEl.style.borderColor = '#c62828';
    } else {
      // Убираем предупреждение
      if (minQtyWarning) minQtyWarning.remove();
      inputEl.style.borderColor = '#ddd';
    }
    
    // Автоматическое округление НЕ делаем при вводе - только при покупке
    // Это позволяет пользователю свободно редактировать поле
    
    const priceEl = card.querySelector('.card-price');
    const basePrice = Math.round(product.price || 0);
    const optPrice = product.optPrice ? Math.round(product.optPrice) : null;
    const optQty = product.optQty || null;
    const optInfoEl = card.querySelector('.card-opt-info');
    // Определяем единицу измерения для товара
    const unitLabel = product.isPack ? 'пачек' : 'шт';
    
    // Удаляем информационный блок о количестве если он был
    let qtyInfoEl = card.querySelector('.qty-calculation-info');
    if (qtyInfoEl) {
      qtyInfoEl.remove();
    }

    if (optQty && optPrice && qty >= optQty) {
      if (priceEl) priceEl.textContent = optPrice + ' сом';
      let old = card.querySelector('.card-oldprice');
      if (!old) {
        const span = document.createElement('div');
        span.className = 'card-oldprice';
        span.textContent = basePrice + ' сом';
        span.style.marginLeft = '8px';
        span.style.fontSize = '13px';
        span.style.color = '#888';
        if (priceEl && priceEl.parentNode) priceEl.parentNode.appendChild(span);
      } else {
        old.textContent = basePrice + ' сом';
      }
      if (optInfoEl) {
        optInfoEl.textContent = `Оптовая цена: ${optPrice} сом (при ${optQty} ${unitLabel})`;
        optInfoEl.style.color = '#d32f2f';
        optInfoEl.style.fontWeight = '700';
      }
    } else {
      if (priceEl) priceEl.textContent = basePrice + ' сом';
      const old = card.querySelector('.card-oldprice');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      if (optInfoEl) {
        if (optPrice && optQty) {
          optInfoEl.textContent = `Опт: ${optPrice} сом при ${optQty} ${unitLabel}`;
          optInfoEl.style.color = '#007bff';
          optInfoEl.style.fontWeight = 'normal';
        } else {
          optInfoEl.textContent = '';
        }
      }
    }
  } catch (err) {
    console.error('updateCardPriceNow error', err);
  }
}
