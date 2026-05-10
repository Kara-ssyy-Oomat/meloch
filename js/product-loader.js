// ===================================================================
// КЕРБЕН B2B Market — Product Loader (загрузка, кэш, upload)
// ===================================================================

// ОПТИМИЗАЦИЯ: Кэш для товаров
let productsCache = [];
let productsCacheTime = 0;
const CACHE_DURATION = 30000; // 30 секунд кэш

// Загрузка товаров
async function loadProducts() {
  try {
    // Проверяем кэш
    const now = Date.now();
    if (productsCache.length > 0 && (now - productsCacheTime) < CACHE_DURATION) {
      console.log('📦 Загрузка из кэша');
      products = productsCache;
      productsReady = true;
      renderProducts();
      return;
    }
    
    console.log('Loading products...');
    productsReady = false; // Сбрасываем флаг на время загрузки
    let snapshot;
    try {
      snapshot = await db.collection('products').orderBy('order').get();
    } catch (e) {
      // Если нет поля order, загружаем без сортировки
      snapshot = await db.collection('products').get();
    }
    products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      products.push({ id: doc.id, ...data });
    });
    
    // DEBUG: Показать сколько товаров с фото
    const withPhoto = products.filter(p => p.image).length;
    console.log(`📦 Загружено ${products.length} товаров, с фото: ${withPhoto}`);
    if (products.length > 0 && products[0].image) {
      console.log('🖼️ Пример URL:', products[0].image);
    }
    
    // Если нет сортировки по order, сортируем по названию
    if (!products.every(p => typeof p.order === 'number')) {
      products.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
      products.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    console.log('Products loaded:', products.length);
    
    // ОПТИМИЗАЦИЯ: Сохраняем в кэш
    productsCache = [...products];
    productsCacheTime = Date.now();
    
    productsReady = true; // Устанавливаем флаг готовности
    
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
  cachedSellerCategories.forEach(cat => {
    const catLower = cat.toLowerCase();
    if (!standardOptions.find(o => o.value === catLower)) {
      const selected = (currentCat || '').toLowerCase() === catLower ? 'selected' : '';
      html += `<option value="${catLower}" ${selected}>🏪 ${cat}</option>`;
    }
  });
  
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
