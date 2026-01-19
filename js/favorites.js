// ===========================================
// Модуль избранных товаров (favorites)
// ===========================================

let favorites = [];
try {
  const savedFavorites = localStorage.getItem('favorites');
  if (savedFavorites) {
    favorites = JSON.parse(savedFavorites);
    if (!Array.isArray(favorites)) {
      favorites = [];
    }
  }
} catch (e) {
  console.error('Ошибка загрузки избранного:', e);
  favorites = [];
}

// Проверка, есть ли товар в избранном
function isFavorite(productId) {
  return favorites.includes(productId);
}

// Переключение избранного
function toggleFavorite(productId, btn) {
  const index = favorites.indexOf(productId);
  if (index === -1) {
    favorites.push(productId);
    if (btn) {
      btn.classList.add('active', 'animate');
      btn.innerHTML = '❤️';
      setTimeout(() => btn.classList.remove('animate'), 600);
    }
    Swal.fire({
      icon: 'success',
      title: 'Добавлено в избранное',
      timer: 1500,
      toast: true,
      position: 'bottom',
      showConfirmButton: false
    });
  } else {
    favorites.splice(index, 1);
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '🤍';
    }
    Swal.fire({
      icon: 'info',
      title: 'Удалено из избранного',
      timer: 1500,
      toast: true,
      position: 'bottom',
      showConfirmButton: false
    });
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateFavoritesCount();
  // Обновляем окно избранных, если открыто
  if (document.getElementById('favoritesPage').style.display !== 'none') {
    renderFavoritesPage();
  }
}

// Обновление счётчика избранных
function updateFavoritesCount() {
  const menuCountEl = document.getElementById('menuFavoritesCount');
  if (menuCountEl) {
    menuCountEl.textContent = favorites.length;
  }
}

// Открыть страницу избранного
function openFavoritesPage() {
  document.getElementById('favoritesPage').style.display = 'block';
  lockPageScroll();
  renderFavoritesPage();
}

// Закрыть страницу избранного
function closeFavoritesPage() {
  document.getElementById('favoritesPage').style.display = 'none';
  unlockPageScroll();
}

// Рендер страницы избранного
function renderFavoritesPage() {
  const container = document.getElementById('favoritesPageItems');
  const emptyMsg = document.getElementById('favoritesEmptyMessage');
  const footer = document.getElementById('favoritesPageFooter');
  const summaryEl = document.getElementById('favoritesPageSummary');
  
  // Проверяем, загружены ли товары
  if (products.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">⏳ Загрузка товаров...</div>';
    container.style.display = 'block';
    emptyMsg.style.display = 'none';
    footer.style.display = 'none';
    if (summaryEl) summaryEl.textContent = 'Загрузка...';
    return;
  }
  
  if (favorites.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    emptyMsg.style.display = 'block';
    footer.style.display = 'none';
    if (summaryEl) summaryEl.textContent = 'Нет товаров';
    return;
  }
  
  container.style.display = 'block';
  emptyMsg.style.display = 'none';
  footer.style.display = 'block';
  
  let html = '<div class="product-grid" style="padding:0;">';
  let validCount = 0;
  
  favorites.forEach(productId => {
    const product = products.find(p => p.id === productId);
    if (!product || product.blocked) return;
    validCount++;
    
    const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
    const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
    const outOfStock = stock !== null && stock <= 0;
    const unitLabel = product.isPack ? 'пачка' : 'шт';
    const buyDisabledAttr = outOfStock ? 'disabled' : '';
    const qtyDisabledAttr = outOfStock ? 'disabled' : '';
    const buyLabel = outOfStock ? 'Нет' : 'Купить';
    
    // Информация о пачке
    let packInfoHtml = '';
    if (product.showPackInfo && product.packQty) {
      packInfoHtml = `
        <div style="background:#f3e5f5;border-radius:6px;padding:4px 6px;margin:2px 0;font-size:10px;">
          <div style="color:#7b1fa2;font-weight:700;">📦 1 пачка = ${product.packQty} шт</div>
        </div>
      `;
    }
    
    const stockHtml = stock !== null
      ? `<div class="card-stock ${outOfStock ? 'out' : ''}" style="font-size:11px;">Остаток: ${outOfStock ? 'Нет' : stock} ${unitLabel}</div>`
      : '';
    
    html += `
      <div class="product-card" data-product-id="${product.id}" style="position:relative;">
        <button class="favorite-btn active" onclick="removeFromFavorites('${product.id}')" style="position:absolute; top:4px; left:4px;">❤️</button>
        <div class="card-image" style="position:relative;">
          <img src="${product.image || 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\"%3E%3Crect fill=\"%23ddd\" width=\"200\" height=\"200\"/%3E%3Ctext fill=\"%23999\" x=\"50%25\" y=\"50%25\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"18\"%3EНет фото%3C/text%3E%3C/svg%3E'}" alt="${product.title || ''}" onclick="openProductImage('${product.id}')" style="cursor:pointer;" />
        </div>
        <div class="card-body">
          <div class="card-title" style="font-size:12px; min-height:32px;"><div>${product.title || ''}</div></div>
          ${packInfoHtml}
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <div class="card-price" style="font-size:14px;">${(product.price || '0')} сом${product.isPack ? '/пач' : ''}</div>
          </div>
          ${product.optPrice && product.optQty ? `<div style="font-size:10px;color:#007bff;">Опт: ${product.optPrice} сом от ${product.optQty} ${product.isPack ? 'пач' : 'шт'}</div>` : ''}
          ${stockHtml}
          <div class="card-actions" style="margin-top:4px;">
            <input type="text" inputmode="numeric" value="${product.minQty||1}" class="card-qty-input" id="fav-qty-${product.id}" style="text-align:center; font-size:14px; width:60px; padding:6px;" placeholder="${product.isPack ? 'пач' : 'шт'}" onfocus="this.value=''" ${qtyDisabledAttr} />
            <button onclick="addToCartFromFavorites('${product.id}')" style="flex:1; padding:8px 10px; font-size:13px;" ${buyDisabledAttr}>${buyLabel}</button>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  container.innerHTML = html || '<div style="text-align:center; color:#999; padding:20px;">Товары не найдены</div>';
  if (summaryEl) summaryEl.textContent = `${validCount} товар(ов)`;
}

// Добавить товар в корзину из избранного с указанным количеством
function addToCartFromFavorites(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const qtyInput = document.getElementById('fav-qty-' + productId);
  let qty = parseInt(qtyInput?.value || product.minQty || 1, 10);
  if (isNaN(qty) || qty < 1) qty = product.minQty || 1;
  
  // Округление для минимального количества
  const minQty = product.minQty || 1;
  if (product.roundQty && minQty > 1 && qty % minQty !== 0) {
    qty = Math.ceil(qty / minQty) * minQty;
    if (qtyInput) qtyInput.value = qty;
  }
  
  // Проверка остатка
  const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
  const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
  if (stock !== null && qty > stock) {
    Swal.fire('Ошибка', `Доступно только ${stock} шт`, 'warning');
    return;
  }
  
  // Добавляем в корзину
  const existingIndex = cart.findIndex(item => item.id === productId);
  let finalPrice = Math.round(product.price || 0);
  
  if (existingIndex !== -1) {
    cart[existingIndex].qty += qty;
    if (product.optQty && cart[existingIndex].qty >= product.optQty && product.optPrice) {
      cart[existingIndex].price = Math.round(product.optPrice);
    }
  } else {
    if (product.optQty && qty >= product.optQty && product.optPrice) {
      finalPrice = Math.round(product.optPrice);
    }
    cart.push({
      id: productId,
      title: product.title,
      price: finalPrice,
      qty: qty,
      image: product.image,
      costPrice: product.costPrice || 0,
      sellerId: product.sellerId || null,
      sellerName: product.sellerName || null
    });
  }
  
  updateCart();
  localStorage.setItem('cart', JSON.stringify(cart));
  
  Swal.fire({
    icon: 'success',
    title: 'Добавлено в корзину',
    text: `${product.title} - ${qty} шт`,
    timer: 1500,
    toast: true,
    position: 'bottom',
    showConfirmButton: false
  });
}

// Удалить из избранного
function removeFromFavorites(productId) {
  const index = favorites.indexOf(productId);
  if (index !== -1) {
    favorites.splice(index, 1);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    updateFavoritesCount();
    renderFavoritesPage();
    // Обновляем кнопку на карточке товара
    const btn = document.querySelector(`.favorite-btn[data-product-id="${productId}"]`);
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '🤍';
    }
  }
}

// Очистить избранное
function clearFavorites() {
  if (favorites.length === 0) return;
  
  Swal.fire({
    title: 'Очистить избранное?',
    text: 'Все товары будут удалены из избранного',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#f50057',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Да, очистить',
    cancelButtonText: 'Отмена'
  }).then((result) => {
    if (result.isConfirmed) {
      favorites = [];
      localStorage.setItem('favorites', JSON.stringify(favorites));
      updateFavoritesCount();
      renderFavoritesPage();
      renderProducts(); // Обновить карточки товаров
      Swal.fire({
        icon: 'success',
        title: 'Избранное очищено',
        timer: 1500,
        showConfirmButton: false
      });
    }
  });
}

// Добавить все избранные товары в корзину
function addAllFavoritesToCart() {
  if (favorites.length === 0) {
    Swal.fire('Избранное пусто', '', 'info');
    return;
  }
  
  let addedCount = 0;
  favorites.forEach(productId => {
    const product = products.find(p => p.id === productId);
    if (!product || product.blocked) return;
    
    const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
    const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
    if (stock !== null && stock <= 0) return;
    
    // Добавляем минимальное количество товара
    const qty = product.minQty || 1;
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex !== -1) {
      cart[existingIndex].qty += qty;
    } else {
      cart.push({
        id: productId,
        title: product.title,
        price: Math.round(product.price || 0),
        qty: qty,
        image: product.image,
        costPrice: product.costPrice || 0,
        sellerId: product.sellerId || null,
        sellerName: product.sellerName || null
      });
    }
    addedCount++;
  });
  
  if (addedCount > 0) {
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    Swal.fire({
      icon: 'success',
      title: 'Товары добавлены в корзину',
      text: `Добавлено ${addedCount} товар(ов)`,
      timer: 2000,
      showConfirmButton: false
    });
  } else {
    Swal.fire('Нет доступных товаров', 'Все товары из избранного недоступны', 'warning');
  }
}

// Инициализация избранного при загрузке
document.addEventListener('DOMContentLoaded', function() {
  updateFavoritesCount();
});
