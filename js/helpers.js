// ===========================================
// Функции для блокировки прокрутки страницы
// ВКЛЮЧЕНО - улучшенная версия без смещений
// ===========================================
let savedScrollPosition = 0;
let scrollLockCount = 0; // Счётчик активных модальных окон

function lockPageScroll() {
  scrollLockCount++;
  
  // Сохраняем позицию только при первой блокировке
  if (scrollLockCount === 1) {
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  }
  
  // Простая блокировка без position:fixed (избегаем прыжков)
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.classList.add('modal-open');
  
  console.log('🔒 lockPageScroll: count=' + scrollLockCount);
}

function unlockPageScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  console.log('🔓 unlockPageScroll: count=' + scrollLockCount);
  
  // Разблокируем только если все модальные окна закрыты
  if (scrollLockCount === 0) {
    forceUnlockScroll();
  }
}

// Принудительная разблокировка прокрутки
function forceUnlockScroll() {
  scrollLockCount = 0;
  document.body.classList.remove('modal-open');
  document.body.classList.remove('scroll-locked');
  document.body.style.top = '';
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.height = '';
  document.documentElement.style.overflow = '';
  document.documentElement.classList.remove('modal-open');
  
  savedScrollPosition = 0;
  console.log('🔓 forceUnlockScroll: прокрутка разблокирована');
}

// ===========================================
// Автоматическая проверка и восстановление прокрутки на iOS
// ===========================================
function checkAndRestoreScroll() {
  // Проверяем, есть ли открытые модальные окна
  const openModals = document.querySelectorAll(
    '#profileFullscreenModal, #cartPage[style*="display: block"], #cartPage[style*="display:block"], ' +
    '#favoritesPage[style*="display: block"], #favoritesPage[style*="display:block"], ' +
    '#chatWindow[style*="display: flex"], #chatWindow[style*="display:flex"], ' +
    '#addProductWindow[style*="display: flex"], #addProductWindow[style*="display:flex"], ' +
    '#editProductModal[style*="display: block"], #editProductModal[style*="display:block"], ' +
    '#complaintWindow[style*="display: block"], #complaintWindow[style*="display:block"], ' +
    '#suggestionWindow[style*="display: block"], #suggestionWindow[style*="display:block"], ' +
    '#becomeSellerWindow[style*="display: block"], #becomeSellerWindow[style*="display:block"], ' +
    '#adminChatWindow[style*="display: flex"], #adminChatWindow[style*="display:flex"], ' +
    '.swal2-container'
  );
  
  const hasOpenModal = openModals.length > 0;
  
  // Если модальных окон нет, но прокрутка заблокирована - восстанавливаем
  if (!hasOpenModal && (document.body.classList.contains('modal-open') || 
      document.body.classList.contains('scroll-locked') ||
      document.body.style.overflow === 'hidden' ||
      document.body.style.position === 'fixed')) {
    console.log('🔄 Восстановление прокрутки...');
    forceUnlockScroll();
  }
}

// Запускаем проверку периодически (для iOS) - ОПТИМИЗАЦИЯ: каждые 10 секунд вместо 3
setInterval(checkAndRestoreScroll, 10000);

// Также проверяем при касании экрана - ОПТИМИЗАЦИЯ: используем debounce
let _checkScrollTimeout = null;
document.addEventListener('touchstart', function() {
  if (_checkScrollTimeout) return; // Уже запланировано
  _checkScrollTimeout = setTimeout(() => {
    _checkScrollTimeout = null;
    checkAndRestoreScroll();
  }, 1000);
}, { passive: true });

// КРИТИЧНО: Принудительная разблокировка прокрутки при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  // Даём время на полную загрузку
  setTimeout(function() {
    // Проверяем, нет ли "застрявших" блокировок
    if (document.body.style.position === 'fixed' || 
        document.body.classList.contains('modal-open') ||
        document.body.classList.contains('scroll-locked')) {
      console.log('⚠️ Обнаружена застрявшая блокировка прокрутки при загрузке - исправляю...');
      forceUnlockScroll();
    }
  }, 500);
});

// Также проверяем при полной загрузке страницы (включая изображения)
window.addEventListener('load', function() {
  setTimeout(function() {
    checkAndRestoreScroll();
  }, 1000);
});

// ===========================================
// Функции для окна добавления товара
// ===========================================

function openAddProductWindow() {
  const window = document.getElementById('addProductWindow');
  if (window) {
    window.style.display = 'flex';
    lockPageScroll();
  }
}

function closeAddProductWindow() {
  const window = document.getElementById('addProductWindow');
  if (window) {
    window.style.display = 'none';
    unlockPageScroll();
  }
}

// Очищаем название товара от кавычек по краям.
// Внутренние кавычки (например O'Reilly) НЕ трогаем.
function sanitizeProductTitle(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  // Убираем только "обрамляющие" кавычки/апострофы/ёлочки
  const cleaned = trimmed.replace(/^[\s'"""'`´«»]+|[\s'"""'`´«»]+$/g, '').trim();
  return cleaned || trimmed;
}

// Обновить название товара
async function updateProductTitle(productId, newTitle) {
  try {
    const sanitizedTitle = sanitizeProductTitle(newTitle);
    if (!sanitizedTitle || sanitizedTitle.trim() === '') {
      Swal.fire('Ошибка', 'Название не может быть пустым', 'error');
      return;
    }
    
    // Обновляем локально
    const product = products.find(p => p.id === productId);
    if (product) product.title = sanitizedTitle;
    
    // Сохраняем в Firebase в фоне
    await db.collection('products').doc(productId).update({ title: sanitizedTitle });
  } catch (error) {
    console.error('Ошибка при обновлении названия:', error);
    Swal.fire('Ошибка', 'Не удалось обновить название', 'error');
  }
}

// Обновить описание товара (для корейских товаров и часов)
async function updateProductDescription(productId, newDescription) {
  try {
    // Обновляем локально
    const product = products.find(p => p.id === productId);
    if (product) product.description = newDescription.trim();
    
    // Сохраняем в Firebase в фоне
    await db.collection('products').doc(productId).update({ description: newDescription.trim() });
  } catch (error) {
    console.error('Ошибка при обновлении описания:', error);
    Swal.fire('Ошибка', 'Не удалось обновить описание', 'error');
  }
}

// Обновить категорию товара
async function updateProductCategory(productId, newCategory) {
  try {
    // Обновляем локально
    const product = products.find(p => p.id === productId);
    if (product) product.category = newCategory;
    
    // Перерисовываем для обновления фильтров
    renderProducts();
    
    // Сохраняем в Firebase в фоне
    await db.collection('products').doc(productId).update({ category: newCategory });
  } catch (error) {
    console.error('Ошибка при обновлении категории:', error);
  }
}

// Обновить цену товара
async function updateProductPrice(productId, newPrice) {
  try {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
      Swal.fire('Ошибка', 'Введите корректную цену', 'error');
      return;
    }
    
    // Обновляем локально
    const product = products.find(p => p.id === productId);
    if (product) product.price = price;
    
    // Сохраняем в Firebase в фоне
    await db.collection('products').doc(productId).update({ price: price });
  } catch (error) {
    console.error('Ошибка при обновлении цены:', error);
    Swal.fire('Ошибка', 'Не удалось обновить цену', 'error');
  }
}

// Обновить цену закупки товара
async function updateProductCostPrice(productId, newCostPrice) {
  try {
    const costPrice = parseFloat(newCostPrice);
    if (isNaN(costPrice) || costPrice < 0) {
      Swal.fire('Ошибка', 'Введите корректную цену закупки', 'error');
      return;
    }
    
    // Обновляем локально
    const product = products.find(p => p.id === productId);
    if (product) product.costPrice = costPrice;
    
    // Сохраняем в Firebase в фоне
    await db.collection('products').doc(productId).update({ costPrice: costPrice });
  } catch (error) {
    console.error('Ошибка при обновлении цены закупки:', error);
    Swal.fire('Ошибка', 'Не удалось обновить цену закупки', 'error');
  }
}

// Обновить остаток товара (если пусто — без лимита)
async function updateProductStock(productId, newStock) {
  try {
    const raw = (newStock == null) ? '' : String(newStock).trim();
    let stock = null;

    if (raw !== '') {
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed < 0) {
        Swal.fire('Ошибка', 'Введите корректный остаток (0 или больше), либо оставьте пустым', 'error');
        return;
      }
      stock = parsed;
    }

    const product = products.find(p => p.id === productId);
    if (product) {
      if (stock === null) {
        delete product.stock;
      } else {
        product.stock = stock;
      }
    }

    // Сохраняем в Firebase в фоне
    if (stock === null) {
      await db.collection('products').doc(productId).update({ stock: firebase.firestore.FieldValue.delete() });
    } else {
      await db.collection('products').doc(productId).update({ stock: stock });
    }
  } catch (error) {
    console.error('Ошибка при обновлении остатка:', error);
    Swal.fire('Ошибка', 'Не удалось обновить остаток', 'error');
  }
}

// Обновить настройки пачки товара
async function updateProductPack(productId, isPack, packQty, packsPerBox) {
  try {
    const product = products.find(p => p.id === productId);
    if (product) {
      product.isPack = isPack;
      product.packQty = isPack ? (parseInt(packQty) || 6) : null;
      product.packsPerBox = isPack ? (parseInt(packsPerBox) || 20) : null;
    }
    
    renderProducts();
    
    await db.collection('products').doc(productId).update({ 
      isPack: isPack,
      packQty: isPack ? (parseInt(packQty) || 6) : null,
      packsPerBox: isPack ? (parseInt(packsPerBox) || 20) : null
    });
    
    // Показываем короткое уведомление
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: isPack ? `📦 Пачка: ${packQty} шт, Коробка: ${packsPerBox} пачек` : 'Товар - штучный',
      showConfirmButton: false,
      timer: 2000
    });
  } catch (error) {
    console.error('Ошибка при обновлении настроек пачки:', error);
    Swal.fire('Ошибка', 'Не удалось обновить настройки пачки', 'error');
  }
}

// Обновить количество штук в коробке
async function updateProductUnitsPerBox(productId, unitsPerBox) {
  try {
    const newUnitsPerBox = parseInt(unitsPerBox) || 72;
    if (newUnitsPerBox < 1) {
      Swal.fire('Ошибка', 'Количество должно быть не менее 1', 'warning');
      return;
    }
    
    const product = products.find(p => p.id === productId);
    if (product) {
      product.unitsPerBox = newUnitsPerBox;
    }
    
    renderProducts();
    
    await db.collection('products').doc(productId).update({ 
      unitsPerBox: newUnitsPerBox
    });
    
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `📦 Коробка = ${newUnitsPerBox} шт`,
      showConfirmButton: false,
      timer: 2000
    });
  } catch (error) {
    console.error('Ошибка при обновлении штук в коробке:', error);
    Swal.fire('Ошибка', 'Не удалось обновить', 'error');
  }
}

// Массовое обновление unitsPerBox из названий товаров (БЫСТРАЯ версия с batch)
async function extractUnitsPerBoxFromTitles() {
  if (!isAdmin) {
    Swal.fire('Ошибка', 'Только для администратора', 'error');
    return;
  }
  
  const result = await Swal.fire({
    title: '📦 Извлечь штуки из названий?',
    text: 'Эта функция найдёт в названиях товаров паттерны типа "240шт/кар", "120шт/кор", "(72шт)" и запишет их в поле "Штук в коробке"',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Да, извлечь',
    cancelButtonText: 'Отмена'
  });
  
  if (!result.isConfirmed) return;
  
  // Показываем прогресс
  Swal.fire({
    title: '⏳ Обработка...',
    html: 'Анализируем названия товаров...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });
  
  let updated = 0;
  let skipped = 0;
  
  // Паттерны для поиска: 240шт/кар, 120шт/кор, (72шт), 48шт и т.д.
  const patterns = [
    /(\d+)\s*шт\s*[\/\\]\s*кар/i,      // 240шт/кар
    /(\d+)\s*шт\s*[\/\\]\s*кор/i,      // 120шт/кор
    /(\d+)\s*шт\s*[\/\\]\s*коробк/i,   // 72шт/коробка
    /\((\d+)\s*шт\s*[\/\\]\s*к\)/i,    // (100шт/к)
    /\((\d+)\s*шт\s*[\/\\]\s*п\)/i,    // (100шт/п)
    /\((\d+)\s*пачк[а-я]*\s*[\/\\]\s*к\)/i,  // (50пачка/к)
    /\((\d+)\s*шт\)/i,                  // (72шт)
    /\[(\d+)\s*шт\]/i,                  // [72шт]
    /(\d+)\s*шт\s*в\s*кор/i,           // 72 шт в кор
    /кор[а-я]*\s*(\d+)\s*шт/i          // коробка 72шт
  ];
  
  // Собираем все товары для обновления
  const toUpdate = [];
  
  for (const product of products) {
    const title = product.title || '';
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const units = parseInt(match[1]);
        if (units > 0 && units < 10000) {
          toUpdate.push({ id: product.id, units: units, title: product.title });
          product.unitsPerBox = units;
          break;
        }
      }
    }
  }
  
  skipped = products.length - toUpdate.length;
  
  // Используем batch для быстрого обновления (до 500 за раз)
  const batchSize = 450; // Лимит Firebase = 500
  const batches = [];
  
  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const batch = db.batch();
    const chunk = toUpdate.slice(i, i + batchSize);
    
    for (const item of chunk) {
      const ref = db.collection('products').doc(item.id);
      batch.update(ref, { unitsPerBox: item.units });
    }
    
    batches.push(batch.commit());
  }
  
  try {
    await Promise.all(batches);
    updated = toUpdate.length;
    console.log(`✅ Обновлено ${updated} товаров`);
  } catch (err) {
    console.error('Ошибка batch:', err);
  }
  
  renderProducts();
  
  Swal.fire({
    title: '📦 Готово!',
    html: `
      <div style="text-align:left;">
        <p>✅ Обновлено: <b>${updated}</b> товаров</p>
        <p>⏭️ Пропущено (нет паттерна): <b>${skipped}</b></p>
      </div>
    `,
    icon: 'success'
  });
}

// Обновить минимальное количество покупки
async function updateProductMinQty(productId, minQty) {
  try {
    const newMinQty = parseInt(minQty) || 1;
    if (newMinQty < 1) {
      Swal.fire('Ошибка', 'Минимальное количество должно быть не менее 1', 'warning');
      return;
    }
    
    const product = products.find(p => p.id === productId);
    if (product) {
      product.minQty = newMinQty;
    }
    
    renderProducts();
    
    await db.collection('products').doc(productId).update({ 
      minQty: newMinQty
    });
    
    // Показываем короткое уведомление
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `🛒 Мин. покупка: ${newMinQty}`,
      showConfirmButton: false,
      timer: 1500
    });
  } catch (error) {
    console.error('Ошибка при обновлении мин. количества:', error);
    Swal.fire('Ошибка', 'Не удалось обновить минимальное количество', 'error');
  }
}

// Изменить фотографию товара
async function changeProductImage(productId) {
  console.log('changeProductImage вызвана для товара:', productId);
  
  // Создаем input для выбора файла
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('Выбран файл:', file.name);
    
    try {
      Swal.fire({
        title: 'Загрузка...',
        text: 'Пожалуйста, подождите',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // Загружаем файл на Cloudinary
      console.log('Загружаем на Cloudinary:', file.name);
      const downloadURL = await uploadToImgBB(file);
      console.log('URL загруженного файла:', downloadURL);
      
      // Обновляем URL фотографии в базе данных
      await db.collection('products').doc(productId).update({ image: downloadURL });
      console.log('База данных обновлена');
      
      await loadProducts();
      Swal.fire('Успех!', 'Фотография успешно обновлена', 'success');
    } catch (error) {
      console.error('Ошибка при загрузке фото:', error);
      Swal.fire('Ошибка', 'Не удалось загрузить фото: ' + error.message, 'error');
    }
  };
  
  // Открываем диалог выбора файла
  input.click();
}

// Заблокировать/разблокировать товар
async function toggleProductBlock(productId, currentStatus) {
  try {
    // Находим карточку товара в DOM
    const card = document.querySelector(`[data-product-id="${productId}"]`);
    if (!card) {
      console.error('Карточка не найдена:', productId);
      return;
    }
    
    const imageDiv = card.querySelector('.card-image');
    const newStatus = !currentStatus;
    
    // Мгновенно обновляем badge в DOM
    if (newStatus) { // Блокируем - добавляем badge
      let badge = imageDiv.querySelector('.blocked-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'blocked-badge';
        badge.innerHTML = '🚫';
        imageDiv.insertBefore(badge, imageDiv.firstChild);
      }
    } else { // Разблокируем - удаляем badge
      const badge = imageDiv.querySelector('.blocked-badge');
      if (badge) badge.remove();
    }
    
    // Обновляем локальный массив
    const product = products.find(p => p.id === productId);
    if (product) {
      product.blocked = newStatus;
    }
    
    // Сохраняем в Firebase в фоне
    db.collection('products').doc(productId).update({ blocked: newStatus })
      .then(() => {
        Swal.fire('Успех!', newStatus ? 'Товар заблокирован' : 'Товар разблокирован', 'success');
      })
      .catch(error => {
        console.error('Ошибка при сохранении в Firebase:', error);
        // Откатываем изменения в DOM и массиве
        if (product) {
          product.blocked = currentStatus;
        }
        if (currentStatus) { // Был заблокирован - возвращаем badge
          let badge = imageDiv.querySelector('.blocked-badge');
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'blocked-badge';
            badge.innerHTML = '🚫';
            imageDiv.insertBefore(badge, imageDiv.firstChild);
          }
        } else { // Не был заблокирован - удаляем badge
          const badge = imageDiv.querySelector('.blocked-badge');
          if (badge) badge.remove();
        }
        Swal.fire('Ошибка', 'Не удалось изменить статус блокировки', 'error');
      });
  } catch (error) {
    console.error('Ошибка при смене статуса блокировки:', error);
    Swal.fire('Ошибка', 'Не удалось изменить статус блокировки', 'error');
  }
}
