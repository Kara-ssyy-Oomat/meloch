// ===================================================================
// КЕРБЕН B2B Market — Product Loader (загрузка, кэш, upload)
// ===================================================================

// ОПТИМИЗАЦИЯ: Кэш для товаров
let productsCache = [];
let productsCacheTime = 0;
const CACHE_DURATION = 120000; // 2 минуты кэш (увеличено с 30с для скорости)
const LS_PRODUCTS_KEY = 'cachedProducts';
const LS_PRODUCTS_TIME_KEY = 'cachedProductsTime';

// Скрытие splash-экрана (вызывается при первом показе товаров)
function hideSplashScreen() {
  var splash = document.getElementById('splashScreen');
  if (splash && !splash.classList.contains('splash-hide')) {
    splash.classList.add('splash-hide');
    // Восстанавливаем белый фон и theme-color после splash
    document.documentElement.style.background = '#fff';
    document.body.style.background = '#fff';
    var tc = document.querySelector('meta[name=\"theme-color\"]');
    if (tc) tc.setAttribute('content', '#4CAF50');
    setTimeout(function() { splash.remove(); }, 350);
  }
}

// Загрузка товаров с мгновенным отображением из localStorage
async function loadProducts() {
  try {
    // 1) Проверяем in-memory кэш (самый быстрый)
    const now = Date.now();
    if (productsCache.length > 0 && (now - productsCacheTime) < CACHE_DURATION) {
      console.log('📦 Загрузка из RAM-кэша');
      products = productsCache;
      productsReady = true;
      renderProducts();
      hideSplashScreen();
      return;
    }
    
    // 2) Показываем товары из localStorage мгновенно (пока грузим с сервера)
    let showedFromCache = false;
    try {
      const lsTime = parseInt(localStorage.getItem(LS_PRODUCTS_TIME_KEY) || '0');
      if (now - lsTime < 600000) { // localStorage кэш 10 минут
        const lsProducts = JSON.parse(localStorage.getItem(LS_PRODUCTS_KEY) || '[]');
        if (lsProducts.length > 0) {
          products = lsProducts;
          productsReady = true;
          renderProducts();
          showedFromCache = true;
          hideSplashScreen();
          console.log('📦 Мгновенная загрузка из localStorage:', lsProducts.length, 'товаров');
        }
      }
    } catch(e) { /* localStorage может быть недоступен */ }
    
    // 3) Загружаем свежие данные с Firebase (в фоне если кэш показан)
    console.log('Loading products from Firebase...');
    if (!showedFromCache) productsReady = false;
    
    let snapshot;
    try {
      snapshot = await db.collection('products').orderBy('order').get();
    } catch (e) {
      snapshot = await db.collection('products').get();
    }
    products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      products.push({ id: doc.id, ...data });
    });
    
    const withPhoto = products.filter(p => p.image).length;
    console.log(`📦 Загружено ${products.length} товаров, с фото: ${withPhoto}`);
    
    // Сортировка
    if (!products.every(p => typeof p.order === 'number')) {
      products.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
      products.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    // Сохраняем в оба кэша
    productsCache = [...products];
    productsCacheTime = Date.now();
    
    // Сохраняем в localStorage (без тяжёлых полей для экономии места)
    try {
      const lightProducts = products.map(p => ({
        id: p.id, title: p.title, price: p.price, image: p.image,
        category: p.category, stock: p.stock, order: p.order,
        optPrice: p.optPrice, optQty: p.optQty, oldPrice: p.oldPrice,
        isPack: p.isPack, packQty: p.packQty, showPackInfo: p.showPackInfo,
        blocked: p.blocked, minQty: p.minQty, sellerId: p.sellerId,
        createdAt: p.createdAt, description: p.description,
        extraImages: p.extraImages, useQtyButtons: p.useQtyButtons,
        unitsPerBox: p.unitsPerBox, showPricePerUnit: p.showPricePerUnit
      }));
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(lightProducts));
      localStorage.setItem(LS_PRODUCTS_TIME_KEY, String(Date.now()));
    } catch(e) { /* если превышен лимит localStorage — не критично */ }
    
    productsReady = true;
    
    // Перерисовываем только если данные изменились
    if (showedFromCache) {
      // Тихое обновление в фоне — только если данные реально отличаются
      const oldCount = (productsCache.length || 0);
      if (oldCount !== products.length) {
        renderProducts();
      }
    } else {
      renderProducts();
    }
    
    // Скрываем splash если ещё не скрыт (для случая без кэша)
    hideSplashScreen();
    
    // Загружаем кэш категорий продавцов
    await loadSellerCategoriesCache();
  } catch (error) {
    console.error('Error loading products:', error);
    productsReady = false;
    Swal.fire('Ошибка', 'Не удалось загрузить товары: ' + error.message, 'error');
  }
}

// Функция загрузки изображений на ImgBB (для редактирования товаров)
async function uploadToImgBB(file) {
  console.log('📤 Начинаем загрузку на ImgBB:', file.name);
  
  const apiKey = '3dcd4dce37fa365cc2ee66890444ce4b';
  
  // Конвертируем файл в base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const formData = new FormData();
  formData.append('image', base64);

  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    console.log('📥 Ответ ImgBB:', data);
    
    if (data.success && data.data.url) {
      console.log('✅ Файл успешно загружен на ImgBB:', data.data.url);
      return data.data.url;
    } else {
      throw new Error('Ошибка загрузки на ImgBB: ' + (data.error?.message || JSON.stringify(data)));
    }
  } catch (err) {
    console.error('❌ Ошибка при загрузке:', err);
    throw err;
  }
}


// addNewExtraPhotoToEdit() определена в gallery.js

// Флаг загрузки категорий
let sellerCategoriesLoaded = false;

// Функция гарантированной загрузки категорий
async function ensureSellerCategoriesLoaded() {
  if (!sellerCategoriesLoaded || cachedSellerCategories.length === 0) {
    await loadSellerCategoriesCache();
    sellerCategoriesLoaded = true;
  }
}

// Функция для генерации опций категорий (включая категории продавцов)
function generateCategoryOptions(currentCat) {
  const standardOptions = [
    { value: 'все', label: 'Все товары' },
    { value: 'ножницы', label: '✂️ Ножницы' },
    { value: 'скотч', label: 'Скотч' },
    { value: 'нож', label: '🔪 Нож' },
    { value: 'корейские', label: 'Корейские товары' },
    { value: 'часы', label: '⌚ Часы' },
    { value: 'электроника', label: '🔌 Электроника' },
    { value: 'бытовые', label: 'Бытовые техники' }
  ];
  
  let html = '';
  
  // Стандартные категории
  standardOptions.forEach(opt => {
    const selected = (currentCat || 'все').toLowerCase() === opt.value ? 'selected' : '';
    html += `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
  });
  
  // Категории продавцов (только официальные из seller_categories)
  if (typeof cachedSellerCategories !== 'undefined' && cachedSellerCategories.length > 0) {
    cachedSellerCategories.forEach(cat => {
      const catLower = cat.toLowerCase();
      if (!standardOptions.find(o => o.value === catLower)) {
        const selected = (currentCat || '').toLowerCase() === catLower ? 'selected' : '';
        html += `<option value="${catLower}" ${selected}>🏪 ${cat}</option>`;
      }
    });
  }
  
  // НЕ добавляем неизвестные категории из товаров - только официальные
  
  return html;
}

// Функция загрузки категорий продавцов
async function loadSellerCategoriesCache() {
  try {
    const standardCategories = ['все', 'ножницы', 'скотч', 'нож', 'корейские', 'часы', 'электроника', 'бытовые'];
    const categories = new Set();
    
    // Загружаем ТОЛЬКО из коллекции seller_categories (официальные категории)
    const snapshot = await db.collection('seller_categories').get();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && !standardCategories.includes(data.name.toLowerCase())) {
        categories.add(data.name);
      }
    });
    
    // НЕ добавляем категории из товаров - только официальные из seller_categories
    
    cachedSellerCategories = [...categories];
    console.log('Загружено категорий продавцов:', cachedSellerCategories.length);
  } catch (e) {
    console.log('Ошибка загрузки категорий продавцов:', e);
  }
}
