// ===================================================================
// КЕРБЕН B2B Market — Product Editor (редактирование, варианты, галерея)
// ===================================================================

// === МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ТОВАРА ===
let currentEditProductId = null;

function openEditProductModal(productId) {
  const p = products.find(pr => pr.id === productId);
  if (!p) return;
  
  currentEditProductId = productId;
  const modal = document.getElementById('editProductModal');
  const content = document.getElementById('editProductContent');
  
  content.innerHTML = `
    <!-- Фото товара -->
    <div style="text-align:center; margin-bottom:15px;">
      <img referrerpolicy="no-referrer" src="${p.image || ''}" style="width:120px; height:120px; object-fit:cover; border-radius:10px; border:2px solid #ddd;">
      <div style="margin-top:8px;">
        <button onclick="changeProductImage('${p.id}')" style="background:#007bff; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:13px;">📷 Изменить фото</button>
      </div>
    </div>
    
    <!-- Название -->
    <div style="margin-bottom:12px;">
      <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📝 Название</label>
      <input type="text" id="editTitle" value="${p.title||''}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
    </div>
    
    <!-- Категория -->
    <div style="margin-bottom:12px;">
      <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📁 Категория</label>
      <select id="editCategory" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
        ${generateCategoryOptions(p.category)}
      </select>
    </div>
    
    <!-- Описание (для корейских/часов/электроники) -->
    <div style="margin-bottom:12px;">
      <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📄 Описание</label>
      <textarea id="editDescription" rows="3" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box; resize:vertical;">${p.description||''}</textarea>
    </div>
    
    <!-- Цены -->
    <div style="display:flex; gap:10px; margin-bottom:12px;">
      <div style="flex:1;">
        <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">💵 Закупка</label>
        <input type="number" id="editCostPrice" value="${p.costPrice||0}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;" step="0.01">
      </div>
      <div style="flex:1;">
        <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">💰 Продажа</label>
        <input type="number" id="editPrice" value="${p.price||0}" style="width:100%; padding:10px; border:1px solid #e53935; border-radius:8px; font-size:16px; font-weight:700; color:#e53935; box-sizing:border-box;">
      </div>
    </div>
    
    <!-- Остаток -->
    <div style="margin-bottom:12px;">
      <label style="font-size:12px; color:#666; display:block; margin-bottom:4px;">📦 Остаток (пусто = без лимита)</label>
      <input type="number" id="editStock" value="${p.stock === 0 ? 0 : (p.stock || '')}" placeholder="Без лимита" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;" min="0">
    </div>
    
    <!-- Мин. покупка -->
    <div style="background:#fff3e0; border:1px solid #ffb74d; border-radius:8px; padding:12px; margin-bottom:12px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div>
          <label style="font-size:12px; color:#e65100; display:block; margin-bottom:4px;">🛒 Мин. покупка</label>
          <input type="number" id="editMinQty" value="${p.minQty||1}" min="1" style="width:80px; padding:8px; border:1px solid #ffb74d; border-radius:6px; font-size:14px;">
        </div>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin-top:15px;">
          <input type="checkbox" id="editUseQtyButtons" ${p.useQtyButtons ? 'checked' : ''} style="width:18px; height:18px;">
          <span style="font-size:13px; color:#1565c0;">🔢 Кнопки +/-</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin-top:15px;">
          <input type="checkbox" id="editRoundQty" ${p.roundQty ? 'checked' : ''} style="width:18px; height:18px;">
          <span style="font-size:13px; color:#ff5722;">🔄 Округлять</span>
        </label>
      </div>
    </div>
    
    <!-- Штук в коробке (отдельно) -->
    <div style="background:#e8f5e9; border:2px solid #4caf50; border-radius:8px; padding:12px; margin-bottom:12px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <label style="font-size:13px; color:#2e7d32; font-weight:700;">📦 Штук в коробке:</label>
        <input type="number" id="editUnitsPerBox" value="${p.unitsPerBox||72}" min="1" style="width:100px; padding:10px; border:2px solid #4caf50; border-radius:6px; background:#fff; font-size:16px; font-weight:700; text-align:center;">
      </div>
      <div style="font-size:11px; color:#666; margin-top:6px;">Используется для режима покупки по коробкам</div>
    </div>
    
    <!-- Настройки пачки -->
    <div style="background:#f3e5f5; border:1px solid #ce93d8; border-radius:8px; padding:12px; margin-bottom:12px;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:10px;">
        <input type="checkbox" id="editIsPack" ${p.isPack ? 'checked' : ''} style="width:18px; height:18px;">
        <span style="font-size:14px; color:#7b1fa2; font-weight:600;">📦 Товар продаётся пачками</span>
      </label>
      <div id="packSettings" style="display:${p.isPack ? 'block' : 'none'};">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:100px;">
            <label style="font-size:11px; color:#7b1fa2;">Штук в пачке</label>
            <input type="number" id="editPackQty" value="${p.packQty||6}" min="1" style="width:100%; padding:8px; border:1px solid #ce93d8; border-radius:6px;">
          </div>
          <div style="flex:1; min-width:100px;">
            <label style="font-size:11px; color:#e65100;">Пачек в коробке</label>
            <input type="number" id="editPacksPerBox" value="${p.packsPerBox||20}" min="1" style="width:100%; padding:8px; border:1px solid #ffb74d; border-radius:6px; background:#fff3e0;">
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:10px;">
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
            <input type="checkbox" id="editShowPricePerUnit" ${p.showPricePerUnit ? 'checked' : ''} style="width:16px; height:16px;">
            <span style="font-size:12px; color:#2e7d32;">💰 Цена/шт</span>
          </label>
          <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
            <input type="checkbox" id="editShowPackInfo" ${p.showPackInfo ? 'checked' : ''} style="width:16px; height:16px;">
            <span style="font-size:12px; color:#7b1fa2;">📦 Пачка=шт</span>
          </label>
        </div>
      </div>
    </div>
    
    <!-- Варианты товара -->
    <div style="background:#e3f2fd; border:2px solid #2196f3; border-radius:8px; padding:12px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-weight:600; color:#1565c0;">🎨 Варианты товара</span>
        <span style="font-size:12px; color:#666;">${(p.variants && p.variants.length) || 0} шт</span>
      </div>
      <div id="editVariantListContainer" style="max-height:200px; overflow-y:auto; margin-bottom:10px;">
        ${p.variants && p.variants.length > 0 ? p.variants.map((v, i) => `
          <div style="display:flex; align-items:center; gap:8px; padding:8px; background:#fff; border-radius:6px; margin-bottom:6px; border:1px solid #e0e0e0;">
            <img referrerpolicy="no-referrer" src="${v.image || p.image || ''}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v.name || 'Вариант'}</div>
              <div style="font-size:11px; color:#666;">${v.price ? v.price + ' сом' : 'Цена товара'}</div>
            </div>
            <button onclick="removeVariantFromEdit(${i})" style="width:24px; height:24px; border:none; background:#ffebee; color:#c62828; border-radius:50%; cursor:pointer; font-size:12px;">✕</button>
          </div>
        `).join('') : '<div style="color:#888; font-size:12px; text-align:center; padding:8px;">Нет вариантов</div>'}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <input type="text" id="editVariantName" placeholder="Название варианта" style="width:100%; padding:8px; border:1px solid #90caf9; border-radius:6px; font-size:13px; box-sizing:border-box;">
        <input type="number" id="editVariantPrice" placeholder="Цена варианта" style="width:100%; padding:8px; border:1px solid #90caf9; border-radius:6px; font-size:13px; box-sizing:border-box;">
        <button type="button" onclick="addVariantToEdit()" style="width:100%; background:#2196f3; color:white; border:none; padding:10px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">+ Добавить вариант</button>
      </div>
    </div>
    
    <!-- Доп. фото и Опт -->
    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <button onclick="showEditExtraPhotosModal('${p.id}')" style="flex:1; background:#2196f3; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px;">📷 Доп.фото (${(p.extraImages && p.extraImages.length) || 0})</button>
      <button onclick="showEditWholesaleModal('${p.id}')" style="flex:1; background:#17a2b8; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px;">💎 Опт</button>
    </div>
    
    <!-- Действия -->
    <div style="display:flex; gap:8px; margin-bottom:15px;">
      <button onclick="showMoveProductModal('${p.id}')" style="flex:1; background:#28a745; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px;">📍 Место</button>
      <button onclick="toggleProductBlock('${p.id}', ${p.blocked||false}); closeEditProductModal();" style="flex:1; background:${p.blocked?'#ffc107':'#6c757d'}; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px;">${p.blocked?'Разблок':'Заблок'}</button>
      <button onclick="deleteProduct('${p.id}'); closeEditProductModal();" style="flex:1; background:#dc3545; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:13px;">🗑️ Удалить</button>
    </div>
    
    <!-- Кнопка сохранения -->
    <button onclick="saveEditProductModal()" style="width:100%; background:linear-gradient(135deg,#28a745,#218838); color:white; border:none; padding:14px; border-radius:10px; cursor:pointer; font-size:16px; font-weight:700;">💾 Сохранить изменения</button>
  `;
  
  // Инициализируем варианты
  initEditModalVariants(productId);
  
  // Обработчик для показа/скрытия настроек пачки
  setTimeout(() => {
    const isPackCheckbox = document.getElementById('editIsPack');
    if (isPackCheckbox) {
      isPackCheckbox.onchange = function() {
        document.getElementById('packSettings').style.display = this.checked ? 'block' : 'none';
      };
    }
  }, 100);
  
  modal.style.display = 'block';
  lockPageScroll();
}

function closeEditProductModal() {
  document.getElementById('editProductModal').style.display = 'none';
  editModalVariants = []; // Очищаем варианты
  unlockPageScroll();
  currentEditProductId = null;
}

async function saveEditProductModal() {
  if (!currentEditProductId) return;
  
  const p = products.find(pr => pr.id === currentEditProductId);
  if (!p) return;
  
  // Собираем данные
  const title = document.getElementById('editTitle').value.trim();
  const category = document.getElementById('editCategory').value;
  const description = document.getElementById('editDescription').value.trim();
  const costPrice = parseFloat(document.getElementById('editCostPrice').value) || 0;
  const price = parseFloat(document.getElementById('editPrice').value) || 0;
  const stockVal = document.getElementById('editStock').value.trim();
  const stock = stockVal === '' ? null : parseInt(stockVal);
  const minQty = parseInt(document.getElementById('editMinQty').value) || 1;
  const useQtyButtons = document.getElementById('editUseQtyButtons').checked;
  const roundQty = document.getElementById('editRoundQty').checked;
  const isPack = document.getElementById('editIsPack').checked;
  const packQty = parseInt(document.getElementById('editPackQty').value) || 6;
  const packsPerBox = parseInt(document.getElementById('editPacksPerBox').value) || 20;
  const unitsPerBox = parseInt(document.getElementById('editUnitsPerBox').value) || 72;
  const showPricePerUnit = document.getElementById('editShowPricePerUnit').checked;
  const showPackInfo = document.getElementById('editShowPackInfo').checked;
  
  if (!title) {
    Swal.fire('Ошибка', 'Название не может быть пустым', 'error');
    return;
  }
  
  try {
    Swal.fire({ title: 'Сохранение...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    // Обновляем локально
    p.title = title;
    p.category = category;
    p.description = description;
    p.costPrice = costPrice;
    p.price = price;
    if (stock === null) delete p.stock; else p.stock = stock;
    p.minQty = minQty;
    p.useQtyButtons = useQtyButtons;
    p.roundQty = roundQty;
    p.isPack = isPack;
    p.packQty = isPack ? packQty : null;
    p.packsPerBox = isPack ? packsPerBox : null;
    p.unitsPerBox = unitsPerBox;
    p.showPricePerUnit = showPricePerUnit;
    p.showPackInfo = showPackInfo;
    
    // Сохраняем в Firebase
    const updateData = {
      title, category, description, costPrice, price, minQty,
      useQtyButtons, roundQty, isPack, unitsPerBox, showPricePerUnit, showPackInfo,
      packQty: isPack ? packQty : null,
      packsPerBox: isPack ? packsPerBox : null,
      variants: editModalVariants.length > 0 ? editModalVariants : null
    };
    
    // Обновляем локально варианты
    if (editModalVariants.length > 0) {
      p.variants = [...editModalVariants];
    } else {
      delete p.variants;
    }
    
    if (stock === null) {
      updateData.stock = firebase.firestore.FieldValue.delete();
    } else {
      updateData.stock = stock;
    }
    
    // Если variants null, удаляем поле
    if (!updateData.variants) {
      updateData.variants = firebase.firestore.FieldValue.delete();
    }
    
    await db.collection('products').doc(currentEditProductId).update(updateData);
    
    Swal.close();
    closeEditProductModal();
    renderProducts();
    
    Swal.fire({
      icon: 'success',
      title: 'Сохранено!',
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'bottom'
    });
    
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    Swal.fire('Ошибка', 'Не удалось сохранить: ' + error.message, 'error');
  }
}

// Закрытие модального окна по клику на фон
document.getElementById('editProductModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeEditProductModal();
});

// === Функции для работы с вариантами в модальном окне ===
let editModalVariants = []; // Временный массив вариантов при редактировании

function initEditModalVariants(productId) {
  const p = products.find(pr => pr.id === productId);
  editModalVariants = (p && p.variants) ? [...p.variants] : [];
}

function addVariantToEdit() {
  const nameInput = document.getElementById('editVariantName');
  const priceInput = document.getElementById('editVariantPrice');
  
  const name = nameInput ? nameInput.value.trim() : '';
  const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;
  
  if (!name) {
    Swal.fire({ icon: 'warning', title: 'Введите название', timer: 1500, showConfirmButton: false, toast: true, position: 'bottom' });
    return;
  }
  
  // Проверяем дубликат
  if (editModalVariants.some(v => v.name === name)) {
    Swal.fire({ icon: 'warning', title: 'Такой вариант уже есть', timer: 1500, showConfirmButton: false, toast: true, position: 'bottom' });
    return;
  }
  
  editModalVariants.push({
    id: 'var_' + Date.now(),
    name: name,
    price: price || null,
    image: null
  });
  
  // Очищаем поля
  if (nameInput) nameInput.value = '';
  if (priceInput) priceInput.value = '';
  
  updateEditVariantList();
}

function removeVariantFromEdit(index) {
  editModalVariants.splice(index, 1);
  updateEditVariantList();
}

function updateEditVariantList() {
  const container = document.getElementById('editVariantListContainer');
  if (!container) return;
  
  const p = products.find(pr => pr.id === currentEditProductId);
  const defaultImage = p ? p.image : '';
  
  if (editModalVariants.length === 0) {
    container.innerHTML = '<div style="color:#888; font-size:12px; text-align:center; padding:8px;">Нет вариантов</div>';
    return;
  }
  
  container.innerHTML = editModalVariants.map((v, i) => `
    <div style="display:flex; align-items:center; gap:8px; padding:8px; background:#fff; border-radius:6px; margin-bottom:6px; border:1px solid #e0e0e0;">
      <div style="position:relative;">
        <img referrerpolicy="no-referrer" src="${v.image || defaultImage || ''}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
        <button onclick="uploadVariantPhotoEdit(${i})" style="position:absolute; bottom:-4px; right:-4px; width:18px; height:18px; border:none; background:#2196f3; color:white; border-radius:50%; cursor:pointer; font-size:8px;" title="Фото">📷</button>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v.name || 'Вариант'}</div>
        <div style="font-size:11px; color:#666;">${v.price ? v.price + ' сом' : 'Цена товара'}</div>
      </div>
      <button onclick="removeVariantFromEdit(${i})" style="width:24px; height:24px; border:none; background:#ffebee; color:#c62828; border-radius:50%; cursor:pointer; font-size:12px;">✕</button>
    </div>
  `).join('');
}

async function uploadVariantPhotoEdit(index) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      Swal.fire({ title: 'Загрузка фото...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      let imageUrl;
      if (typeof uploadToImgBB === 'function') {
        imageUrl = await uploadToImgBB(file);
      } else {
        throw new Error('Функция загрузки не найдена');
      }
      
      if (editModalVariants[index]) {
        editModalVariants[index].image = imageUrl;
      }
      
      Swal.close();
      updateEditVariantList();
      
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      Swal.fire({ icon: 'error', title: 'Ошибка', text: error.message, timer: 2000 });
    }
  };
  
  input.click();
}

// ==================== ГАЛЕРЕЯ-ПРЕВЬЮ ====================

let _gallery = [];
let _galleryIndex = 0;
let _touchStartX = null;

function _galleryKeyHandler(e) {
  if (e.key === 'ArrowLeft') prevGallery();
  if (e.key === 'ArrowRight') nextGallery();
  if (e.key === 'Escape') closePreview();
}

function showGalleryIndex() {
  const item = _gallery[_galleryIndex] || { src: '', title: '' };
  const img = document.getElementById('previewImg');
  img.src = item.src;
  document.getElementById('previewCaption').textContent = item.title || '';
}

function prevGallery() {
  if (_gallery.length === 0) return;
  _galleryIndex = (_galleryIndex - 1 + _gallery.length) % _gallery.length;
  showGalleryIndex();
}

function nextGallery() {
  if (_gallery.length === 0) return;
  _galleryIndex = (_galleryIndex + 1) % _gallery.length;
  showGalleryIndex();
}

function closePreview() {
  const block = document.getElementById('previewBlock');
  block.style.display = 'none';
  unlockPageScroll();
  try {
    document.getElementById('prevPreview').onclick = null;
    document.getElementById('nextPreview').onclick = null;
    document.getElementById('previewImg').ontouchstart = null;
    document.getElementById('previewImg').ontouchend = null;
    document.removeEventListener('keydown', _galleryKeyHandler);
  } catch (e) {}
}

// Поддержка кнопки закрытия
document.getElementById('closePreview').onclick = function() { closePreview(); };
document.getElementById('previewBlock').onclick = function(e) {
  if (e.target === this) closePreview();
};

// ==================== ПЕРЕМЕЩЕНИЕ ТОВАРА ====================

async function showMoveProductModal(productId) {
  const product = products.find(p => p.id === productId);
  
  if (!product) return;
  
  // Получаем категорию товара
  const productCategory = (product.category || 'все').toLowerCase();
  
  // Фильтруем товары только из той же категории
  const categoryProducts = products.filter(p => {
    const pCategory = (p.category || 'все').toLowerCase();
    return pCategory === productCategory;
  });
  
  // Находим текущую позицию в отфильтрованном списке
  const currentCategoryIndex = categoryProducts.findIndex(p => p.id === productId);
  
  // Создаем список опций для выбора позиции (только товары из этой категории)
  const options = {};
  categoryProducts.forEach((p, idx) => {
    options[idx] = `${idx + 1}. ${p.title}`;
  });
  
  const { value: newCategoryPosition } = await Swal.fire({
    title: 'Переместить товар',
    html: `
      <div style="text-align:left;margin-bottom:15px;">
        <strong>Товар:</strong> ${product.title}<br>
        <strong>Категория:</strong> ${product.category || 'Все товары'}<br>
        <strong>Текущая позиция:</strong> #${currentCategoryIndex + 1} (в категории)
      </div>
      <div style="text-align:left;">
        <strong>Выберите товар, ПОСЛЕ которого разместить:</strong>
      </div>
    `,
    input: 'select',
    inputOptions: options,
    inputPlaceholder: 'Выберите товар',
    showCancelButton: true,
    confirmButtonText: 'Переместить',
    cancelButtonText: 'Отмена',
    inputValidator: (value) => {
      if (value === undefined || value === null || value === '') {
        return 'Выберите позицию!';
      }
    }
  });
  
  if (newCategoryPosition !== undefined && newCategoryPosition !== null) {
    const selectedIndex = parseInt(newCategoryPosition);
    
    // Целевая позиция = ПОСЛЕ выбранного товара
    let targetCategoryIndex = selectedIndex + 1;
    
    // Если перемещаемый товар был ДО выбранного, то после удаления индекс сместится
    if (currentCategoryIndex < selectedIndex) {
      targetCategoryIndex = selectedIndex;
    }
    
    if (selectedIndex === currentCategoryIndex || targetCategoryIndex === currentCategoryIndex) {
      return Swal.fire('Внимание', 'Товар уже на этой позиции', 'info');
    }
    
    // Получаем ID товаров в правильном порядке
    const categoryIds = categoryProducts.map(p => p.id);
    
    // Перемещаем ID товара: сначала удаляем из старой позиции
    const [movedId] = categoryIds.splice(currentCategoryIndex, 1);
    
    // Вставляем ПОСЛЕ выбранного товара
    const insertIndex = currentCategoryIndex < selectedIndex ? selectedIndex : selectedIndex + 1;
    categoryIds.splice(insertIndex, 0, movedId);
    
    // Создаем новый массив продуктов с обновленным порядком
    const updatedCategoryProducts = categoryIds.map(id => 
      categoryProducts.find(p => p.id === id)
    );
    
    // Обновляем order для товаров этой категории
    const batch = db.batch();
    
    // Находим глобальные индексы для товаров категории
    const categoryGlobalIndices = categoryProducts.map(cp => 
      products.findIndex(p => p.id === cp.id)
    ).sort((a, b) => a - b);
    
    // Обновляем order на основе новых позиций
    updatedCategoryProducts.forEach((p, localIdx) => {
      const newOrder = categoryGlobalIndices[localIdx];
      batch.update(db.collection('products').doc(p.id), { order: newOrder });
    });
    
    await batch.commit();
    
    // Перезагружаем товары
    await loadProducts();
    
    // Новая позиция товара
    const newPosition = insertIndex + 1;
    
    Swal.fire({
      title: 'Готово',
      text: `Товар перемещён с позиции #${currentCategoryIndex + 1} на #${newPosition} (после "${categoryProducts[selectedIndex].title}")`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });
  }
}

// ==================== УДАЛЕНИЕ ТОВАРА ====================

async function deleteProduct(productId) {
  try {
    const result = await Swal.fire({
      title: 'Удалить товар?',
      text: "Это действие нельзя отменить!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Да, удалить!',
      cancelButtonText: 'Отмена'
    });

    if (result.isConfirmed) {
      await db.collection('products').doc(productId).delete();
      Swal.fire('Удалено!', 'Товар был успешно удален.', 'success');
      loadProducts();
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    Swal.fire('Ошибка', 'Не удалось удалить товар', 'error');
  }
}

// ==================== ОПТОВЫЕ ЦЕНЫ ====================

const editWholesaleModal = document.createElement('div');
editWholesaleModal.id = 'editWholesaleModal';
editWholesaleModal.style.cssText = `
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.6);
  z-index: 9500;
`;
editWholesaleModal.innerHTML = `
  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
    <h3 style="margin:0 0 15px 0; color:#17a2b8;">💎 Оптовые цены</h3>
    <div style="margin-bottom: 15px;">
      <label style="font-size:13px; color:#666;">Оптовая цена (сом):</label>
      <input type="number" id="editOptPrice" style="width: 100%; margin-top: 5px; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
    </div>
    <div style="margin-bottom: 15px;">
      <label style="font-size:13px; color:#666;">Минимум для опта (шт):</label>
      <input type="number" id="editOptQty" style="width: 100%; margin-top: 5px; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box;">
    </div>
    <div style="display: flex; gap:10px;">
      <button onclick="closeEditWholesaleModal()" style="flex:1; background:#6c757d; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-size:14px;">Отмена</button>
      <button onclick="saveWholesaleChanges()" style="flex:1; background:#28a745; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;">💾 Сохранить</button>
    </div>
  </div>
`;
document.body.appendChild(editWholesaleModal);

let currentWholesaleProductId = null;

function showEditWholesaleModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  currentWholesaleProductId = productId;
  document.getElementById('editOptPrice').value = product.optPrice || '';
  document.getElementById('editOptQty').value = product.optQty || '';
  editWholesaleModal.style.display = 'block';
}

function closeEditWholesaleModal() {
  editWholesaleModal.style.display = 'none';
  currentWholesaleProductId = null;
}

async function saveWholesaleChanges() {
  if (!currentWholesaleProductId) return;
  
  try {
    const optPrice = document.getElementById('editOptPrice').value;
    const optQty = document.getElementById('editOptQty').value;
    
    await db.collection('products').doc(currentWholesaleProductId).update({
      optPrice: optPrice ? Number(optPrice) : null,
      optQty: optQty ? Number(optQty) : null
    });
    
    Swal.fire('Успех!', 'Оптовые цены обновлены', 'success');
    closeEditWholesaleModal();
    loadProducts();
  } catch (error) {
    console.error('Error updating wholesale prices:', error);
    Swal.fire('Ошибка', 'Не удалось обновить оптовые цены', 'error');
  }
}

// Обработчик клика вне модального окна
editWholesaleModal.onclick = function(e) {
  if (e.target === this) {
    closeEditWholesaleModal();
  }
};
