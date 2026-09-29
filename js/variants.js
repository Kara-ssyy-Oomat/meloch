// ===========================================
// Модуль вариантов товара в стиле Pinduoduo
// ===========================================

// Текущий товар для модального окна выбора вариантов
let currentVariantProduct = null;
let selectedVariants = {}; // { variantId: qty }

// Открыть модальное окно выбора вариантов (вызывается при нажатии "Купить")
function openVariantSelector(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) {
    Swal.fire('Ошибка', 'Товар не найден', 'error');
    return;
  }
  
  // Если у товара нет вариантов - просто добавляем в корзину обычным способом
  if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
    // Нет вариантов - используем обычную функцию добавления
    const card = document.querySelector(`[data-product-id="${productId}"]`);
    const btn = card ? card.querySelector('.card-buy-btn') : null;
    addToCartById(productId, btn);
    return;
  }
  
  currentVariantProduct = product;
  selectedVariants = {};
  
  // Инициализируем количество 0 для каждого варианта
  product.variants.forEach(v => {
    selectedVariants[v.id || v.name] = 0;
  });
  
  renderVariantModal();
}

// Отрисовать модальное окно выбора вариантов
function renderVariantModal() {
  const product = currentVariantProduct;
  if (!product) return;
  
  // Удаляем старое окно если есть
  const oldModal = document.getElementById('variantSelectorModal');
  if (oldModal) oldModal.remove();
  
  // Создаём HTML для вариантов
  let variantsHtml = '';
  const variants = product.variants || [];
  
  variants.forEach((variant, idx) => {
    const variantId = variant.id || variant.name || `var_${idx}`;
    const variantName = variant.name || variant;
    const variantImage = variant.image || product.image || '';
    const variantPrice = variant.price || product.price || 0;
    const currentQty = selectedVariants[variantId] || 0;
    
    variantsHtml += `
      <div class="variant-item" style="display:flex; gap:12px; padding:12px; background:#fff; border-radius:10px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <img src="${variantImage}" alt="${variantName}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; flex-shrink:0;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:14px; color:#333; margin-bottom:4px;">${variantName}</div>
          <div style="color:#e53935; font-weight:700; font-size:16px;">${variantPrice} сом</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button onclick="changeVariantQty('${variantId}', -1)" style="width:32px; height:32px; border:none; background:#f0f0f0; border-radius:50%; font-size:18px; cursor:pointer; font-weight:700;">−</button>
          <span id="variant-qty-${variantId}" style="min-width:30px; text-align:center; font-weight:700; font-size:16px;">${currentQty}</span>
          <button onclick="changeVariantQty('${variantId}', 1)" style="width:32px; height:32px; border:none; background:#ff5722; color:white; border-radius:50%; font-size:18px; cursor:pointer; font-weight:700;">+</button>
        </div>
      </div>
    `;
  });
  
  // Считаем общую сумму
  const totalQty = Object.values(selectedVariants).reduce((sum, qty) => sum + qty, 0);
  const totalPrice = variants.reduce((sum, v, idx) => {
    const variantId = v.id || v.name || `var_${idx}`;
    const price = v.price || product.price || 0;
    return sum + (selectedVariants[variantId] || 0) * price;
  }, 0);
  
  const modalHtml = `
    <div id="variantSelectorModal" style="position:fixed; inset:0; z-index:10000; display:flex; flex-direction:column; justify-content:flex-end;">
      <div onclick="closeVariantSelector()" style="flex:1; background:rgba(0,0,0,0.5);"></div>
      <div style="background:#f8f9fa; border-radius:20px 20px 0 0; max-height:80vh; overflow:hidden; display:flex; flex-direction:column;">
        <!-- Заголовок с фото и ценой -->
        <div style="display:flex; gap:12px; padding:16px; background:#fff; border-bottom:1px solid #eee;">
          <img src="${product.image || ''}" style="width:80px; height:80px; object-fit:cover; border-radius:10px;">
          <div style="flex:1;">
            <div style="font-weight:600; font-size:15px; color:#333; margin-bottom:4px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${product.title || 'Товар'}</div>
            <div style="color:#e53935; font-weight:700; font-size:20px;">${product.price || 0} сом</div>
          </div>
          <button onclick="closeVariantSelector()" style="width:32px; height:32px; border:none; background:#f0f0f0; border-radius:50%; font-size:18px; cursor:pointer;">✕</button>
        </div>
        
        <!-- Список вариантов -->
        <div style="flex:1; overflow-y:auto; padding:16px;">
          <div style="font-weight:600; font-size:14px; color:#666; margin-bottom:12px;">🎨 Выберите варианты:</div>
          ${variantsHtml}
        </div>
        
        <!-- Кнопка добавления -->
        <div style="padding:16px; background:#fff; border-top:1px solid #eee; display:flex; gap:12px; align-items:center;">
          <div style="flex:1;">
            <div style="font-size:12px; color:#666;">Выбрано: ${totalQty} шт</div>
            <div style="font-size:18px; font-weight:700; color:#e53935;">Итого: ${totalPrice} сом</div>
          </div>
          <button onclick="addSelectedVariantsToCart()" style="background:linear-gradient(90deg,#ff7a00,#ff3b00); color:white; border:none; padding:14px 28px; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer;" ${totalQty === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
            🛒 Добавить в корзину
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  lockPageScroll();
}

// Изменить количество варианта
function changeVariantQty(variantId, delta) {
  const currentQty = selectedVariants[variantId] || 0;
  const newQty = Math.max(0, currentQty + delta);
  selectedVariants[variantId] = newQty;
  
  // Обновляем отображение
  const qtyEl = document.getElementById(`variant-qty-${variantId}`);
  if (qtyEl) qtyEl.textContent = newQty;
  
  // Перерисовываем модальное окно для обновления итогов
  renderVariantModal();
}

// Закрыть модальное окно
function closeVariantSelector() {
  const modal = document.getElementById('variantSelectorModal');
  if (modal) {
    modal.remove();
    unlockPageScroll();
  }
  currentVariantProduct = null;
  selectedVariants = {};
}

// Добавить выбранные варианты в корзину
function addSelectedVariantsToCart() {
  const product = currentVariantProduct;
  if (!product) return;
  
  const variants = product.variants || [];
  let addedCount = 0;
  
  variants.forEach((variant, idx) => {
    const variantId = variant.id || variant.name || `var_${idx}`;
    const qty = selectedVariants[variantId] || 0;
    
    if (qty > 0) {
      const variantName = variant.name || variant;
      const variantPrice = variant.price || product.price || 0;
      const variantImage = variant.image || product.image || '';
      
      // Проверяем есть ли уже такой вариант в корзине
      const existingIndex = cart.findIndex(item => 
        item.id === product.id && item.variantId === variantId
      );
      
      if (existingIndex !== -1) {
        // Увеличиваем количество
        cart[existingIndex].qty += qty;
        // Обновляем unitsPerBox (могло измениться)
        cart[existingIndex].unitsPerBox = getBoxUnits(product.unitsPerBox);
      } else {
        // Добавляем новый
        cart.push({
          id: product.id,
          title: product.title,
          price: variantPrice,
          qty: qty,
          image: variantImage,
          costPrice: product.costPrice || 0,
          sellerId: product.sellerId || null,
          sellerName: product.sellerName || null,
          unitsPerBox: getBoxUnits(product.unitsPerBox),
          isPack: product.isPack || false,
          packQty: product.packQty || null,
          // Данные варианта
          variantId: variantId,
          variantName: variantName
        });
      }
      
      addedCount += qty;
    }
  });
  
  if (addedCount > 0) {
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    
    Swal.fire({
      icon: 'success',
      title: 'Добавлено в корзину!',
      text: `${addedCount} шт добавлено`,
      timer: 1500,
      showConfirmButton: false,
      position: 'bottom',
      toast: true
    });
  }
  
  closeVariantSelector();
}

// ============ АДМИН: Добавление вариантов к товару ============

// Массив вариантов при создании/редактировании товара
let editingProductVariants = [];

// Счётчик загружаемых фото вариантов
let uploadingVariantPhotos = 0;

// Открыть окно добавления вариантов
function openVariantEditor(productId = null) {
  editingProductVariants = [];
  
  // Если редактируем существующий товар - загружаем его варианты
  if (productId) {
    const product = products.find(p => p.id === productId);
    if (product && product.variants) {
      editingProductVariants = [...product.variants];
    }
  }
  
  renderVariantEditor();
}

// Добавить вариант (без фото сразу)
function addVariantToProduct() {
  const nameInput = document.getElementById('variantNameInput');
  const priceInput = document.getElementById('variantPriceInput');
  
  const name = nameInput ? nameInput.value.trim() : '';
  const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;
  
  if (!name) {
    Swal.fire({ icon: 'warning', title: 'Введите название варианта', timer: 1500, showConfirmButton: false });
    return;
  }
  
  // Проверяем дубликат
  if (editingProductVariants.some(v => v.name === name)) {
    Swal.fire({ icon: 'warning', title: 'Такой вариант уже добавлен', timer: 1500, showConfirmButton: false });
    return;
  }
  
  editingProductVariants.push({
    id: 'var_' + Date.now(),
    name: name,
    price: price || null, // null = использовать цену товара
    image: null  // фото добавляется отдельно
  });
  
  // Очищаем поля
  if (nameInput) nameInput.value = '';
  if (priceInput) priceInput.value = '';
  
  renderVariantList();
}

// Загрузить фото для варианта
async function uploadVariantPhoto(index) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Показываем индикатор загрузки
    const photoBtn = document.getElementById(`variantPhotoBtn_${index}`);
    const photoContainer = document.getElementById(`variantPhoto_${index}`);
    
    if (photoBtn) {
      photoBtn.innerHTML = '⏳';
      photoBtn.disabled = true;
    }
    if (photoContainer) {
      photoContainer.innerHTML = '<div style="width:50px;height:50px;display:flex;align-items:center;justify-content:center;background:#e3f2fd;border-radius:6px;">⏳</div>';
    }
    
    uploadingVariantPhotos++;
    
    try {
      // Загружаем на Cloudinary (работает без CORS проблем)
      let imageUrl;
      if (typeof uploadToImgBB === 'function') {
        imageUrl = await uploadToImgBB(file);
      } else if (typeof uploadToFirebaseStorage === 'function') {
        imageUrl = await uploadToFirebaseStorage(file, 'variants');
      } else {
        throw new Error('Функция загрузки не найдена');
      }
      
      // Сохраняем URL в вариант
      if (editingProductVariants[index]) {
        editingProductVariants[index].image = imageUrl;
      }
      
      renderVariantList();
      
    } catch (error) {
      console.error('Ошибка загрузки фото варианта:', error);
      Swal.fire({ icon: 'error', title: 'Ошибка загрузки', text: error.message, timer: 2000 });
      renderVariantList();
    }
    
    uploadingVariantPhotos--;
  };
  
  input.click();
}

// Удалить вариант
function removeVariantFromProduct(index) {
  editingProductVariants.splice(index, 1);
  renderVariantList();
}

// Отрисовать список вариантов
function renderVariantList() {
  const container = document.getElementById('variantListContainer');
  if (!container) return;
  
  if (editingProductVariants.length === 0) {
    container.innerHTML = '<div style="color:#888; font-size:13px; text-align:center; padding:10px;">Нет вариантов. Добавьте варианты ниже.</div>';
    return;
  }
  
  container.innerHTML = editingProductVariants.map((v, i) => `
    <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#fff; border-radius:8px; margin-bottom:8px; border:1px solid #e0e0e0;">
      <div id="variantPhoto_${i}" style="position:relative; width:50px; height:50px; flex-shrink:0;">
        ${v.image 
          ? `<img src="${v.image}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;">
             <button onclick="uploadVariantPhoto(${i})" style="position:absolute; bottom:-4px; right:-4px; width:22px; height:22px; border:none; background:#2196f3; color:white; border-radius:50%; cursor:pointer; font-size:10px;" title="Изменить фото">✏️</button>`
          : `<button id="variantPhotoBtn_${i}" onclick="uploadVariantPhoto(${i})" style="width:50px; height:50px; border:2px dashed #90caf9; background:#e3f2fd; border-radius:6px; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center;" title="Добавить фото">📷</button>`
        }
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v.name}</div>
        <div style="font-size:12px; color:#666;">${v.price ? v.price + ' сом' : 'Цена товара'}</div>
      </div>
      <button onclick="removeVariantFromProduct(${i})" style="width:28px; height:28px; border:none; background:#ffebee; color:#c62828; border-radius:50%; cursor:pointer; font-size:14px;" title="Удалить вариант">✕</button>
    </div>
  `).join('');
}

// Получить текущие варианты для сохранения
function getEditingVariants() {
  return editingProductVariants.length > 0 ? [...editingProductVariants] : null;
}

// Очистить варианты
function clearEditingVariants() {
  editingProductVariants = [];
  const container = document.getElementById('variantListContainer');
  if (container) {
    container.innerHTML = '<div style="color:#888; font-size:13px; text-align:center; padding:10px;">Нет вариантов. Добавьте варианты ниже.</div>';
  }
}

// Проверить, есть ли загружающиеся фото вариантов
function isVariantPhotoUploading() {
  return uploadingVariantPhotos > 0;
}

// Отрисовать редактор вариантов (для формы добавления товара)
function renderVariantEditor() {
  const container = document.getElementById('variantEditorSection');
  if (!container) return;
  
  container.innerHTML = `
    <div style="background:#e3f2fd; border:2px solid #2196f3; border-radius:8px; padding:14px; margin-top:10px;">
      <div style="font-weight:600; color:#1565c0; margin-bottom:10px;">🎨 Варианты товара (цвет, размер и т.д.)</div>
      
      <div id="variantListContainer" style="margin-bottom:12px; max-height:300px; overflow-y:auto;">
        <div style="color:#888; font-size:13px; text-align:center; padding:10px;">Нет вариантов. Добавьте варианты ниже.</div>
      </div>
      
      <div style="background:#fff; border-radius:8px; padding:12px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <input type="text" id="variantNameInput" placeholder="Название (Красный, XL...)" style="flex:2; min-width:100px; padding:10px; border:1px solid #90caf9; border-radius:6px; font-size:14px;">
          <input type="number" id="variantPriceInput" placeholder="Цена" style="flex:1; min-width:60px; padding:10px; border:1px solid #90caf9; border-radius:6px; font-size:14px;">
          <button type="button" onclick="addVariantToProduct()" style="background:#2196f3; color:white; border:none; padding:10px 14px; border-radius:6px; cursor:pointer; font-weight:600; white-space:nowrap;">+ Добавить</button>
        </div>
      </div>
      
      <p style="margin:8px 0 0; font-size:11px; color:#1565c0;">💡 Добавьте вариант → нажмите 📷 для загрузки фото. Без фото будет использоваться основное фото товара.</p>
    </div>
  `;
  
  renderVariantList();
}
