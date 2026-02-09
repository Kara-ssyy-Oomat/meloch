// ===========================================
// Модуль корзины (cart)
// ===========================================

// Флаг productsReady объявлен в index.html (глобальная переменная)

// Безопасные обёртки для кликов по карточкам.
// Не передаём title/price/image в inline onclick, чтобы кавычки/символы в данных товара не ломали HTML.
function addToCartById(id, btn) {
  // Проверяем загружены ли товары
  if (!productsReady || !products || products.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Подождите',
      text: 'Товары ещё загружаются...',
      timer: 2000,
      toast: true,
      position: 'bottom',
      showConfirmButton: false
    });
    return;
  }
  
  const product = products.find(p => p.id === id);
  if (!product) {
    Swal.fire('Ошибка', 'Товар не найден или был удалён', 'error');
    return;
  }
  
  // Если у товара есть варианты - открываем модальное окно выбора (в стиле Pinduoduo)
  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
    if (typeof openVariantSelector === 'function') {
      openVariantSelector(id);
      return;
    }
  }
  
  return addToCart(id, product.title || 'Товар', Number(product.price) || 0, product.image || '', btn);
}

function openProductImage(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  const hasExtraImages = product.extraImages && Array.isArray(product.extraImages) && product.extraImages.length > 0;
  if (hasExtraImages && typeof showProductGallery === 'function') {
    showProductGallery(id);
    return;
  }

  if (typeof showImageModal === 'function') {
    showImageModal(product.image, product.title || '');
  }
}

function addToCart(id, title, price, image, btn) {
  // Проверяем существование и доступность товара
  const product = products.find(p => p.id === id);
  
  if (!product) {
    Swal.fire('Ошибка', 'Товар не найден или был удалён', 'error');
    return;
  }
  
  if (product.blocked) {
    Swal.fire('Ошибка', 'Этот товар временно недоступен', 'warning');
    return;
  }

  // Проверка остатка (если задан)
  const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
  const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
  if (stock !== null && stock <= 0) {
    Swal.fire('Ошибка', 'Нет в наличии (остаток 0)', 'warning');
    return;
  }

  // Если функция вызвана через обёртку (id-only) — подстрахуемся данными из товара
  if ((!title || typeof title !== 'string') && product) title = product.title || 'Товар';
  if ((!price || typeof price !== 'number' || !isFinite(price)) && product) price = Number(product.price) || 0;
  if ((!image || typeof image !== 'string') && product) image = product.image || '';
  
  // Поддержка двух вариантов верстки: карточки (.product-card) и старые таблицы
  const card = btn.closest && btn.closest('.product-card');
  const container = card || (btn.parentElement && btn.parentElement.parentElement) || document;

  let qtyInput = null;
  if (container && container.querySelector) {
    qtyInput = container.querySelector('.card-qty-input') || container.querySelector('input');
  }

  let qty = 1;
  if (qtyInput) {
    // Сначала пробуем взять из текущего value, если пустое - из data-lastValue
    let rawValue = qtyInput.value;
    if (!rawValue || rawValue.trim() === '') {
      rawValue = qtyInput.dataset.lastValue || '';
    }
    qty = parseInt(rawValue, 10) || (product.minQty || 1);
  }

  // ПРОВЕРКА минимального количества покупки
  const minQty = product.minQty || 1;
  if (qty < minQty) {
    Swal.fire({
      icon: 'warning',
      title: 'Минимальное количество',
      html: `Минимум для покупки этого товара: <b>${minQty}</b> шт`,
      confirmButtonText: 'Понятно'
    });
    // Автоматически исправляем значение в input
    if (qtyInput) qtyInput.value = minQty;
    return;
  }

  // Автоматическое округление до кратного minQty (только если включено roundQty)
  if (product.roundQty && product.minQty && product.minQty > 1) {
    const minQty = product.minQty;
    const remainder = qty % minQty;
    if (remainder !== 0) {
      const oldQty = qty;
      qty = qty + (minQty - remainder);
      if (qtyInput) qtyInput.value = qty;
      Swal.fire({
        icon: 'info',
        title: 'Количество округлено',
        html: `Минимальная покупка: <b>${minQty}</b> шт.<br>Количество изменено: ${oldQty} → <b>${qty}</b> шт`,
        timer: 3000,
        toast: true,
        position: 'bottom',
        showConfirmButton: false
      });
    }
  }
  
  // Проверка на превышение остатка
  if (stock !== null && qty > stock) {
    Swal.fire('Ошибка', `Доступно только ${stock} шт`, 'warning');
    return;
  }

  // Получаем цену (обычную или оптовую)
  let finalPrice = Math.round(price);
  
  // Проверяем условия оптовой цены
  if (product.optQty && qty >= product.optQty && product.optPrice) {
    finalPrice = Math.round(product.optPrice);
  }

  // Проверяем, есть ли уже такой товар в корзине
  const existingIndex = cart.findIndex(item => item.id === id);
  
  if (existingIndex !== -1) {
    // Товар уже есть — увеличиваем количество
    const newQty = cart[existingIndex].qty + qty;
    
    // Проверка остатка при добавлении
    if (stock !== null && newQty > stock) {
      Swal.fire('Ошибка', `В корзине уже ${cart[existingIndex].qty} шт. Доступно всего ${stock} шт`, 'warning');
      return;
    }
    
    cart[existingIndex].qty = newQty;
    
    // Пересчитываем цену с учетом нового количества
    if (product.optQty && newQty >= product.optQty && product.optPrice) {
      cart[existingIndex].price = Math.round(product.optPrice);
    }
    // Обновляем unitsPerBox (могло измениться)
    cart[existingIndex].unitsPerBox = product.unitsPerBox || 72;
  } else {
    // Новый товар
    cart.push({
      id: id,
      title: title,
      price: finalPrice,
      qty: qty,
      image: image,
      costPrice: product.costPrice || 0,
      sellerId: product.sellerId || null,
      sellerName: product.sellerName || null,
      unitsPerBox: product.unitsPerBox || 72,
      isPack: product.isPack || false,
      packQty: product.packQty || null
    });
  }

  // Анимация кнопки
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = '✓ Добавлено!';
    btn.classList.add('added');
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('added');
      btn.disabled = false;
    }, 1200);
  }

  updateCart();
  localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCart() {
  // Проверяем и удаляем заблокированные/удалённые товары из корзины
  const initialLength = cart.length;
  const adjustedTitles = [];
  const validCart = [];

  for (const item of cart) {
    const product = products.find(p => p.id === item.id);
    if (!product || product.blocked) continue;

    const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
    const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
    if (stock !== null) {
      if (stock <= 0) continue;
      if (item.qty > stock) {
        item.qty = stock;
        adjustedTitles.push(item.title);
      }
    }

    validCart.push(item);
  }
  
  // Если товары были удалены, обновляем корзину и показываем уведомление
  if (validCart.length < initialLength || adjustedTitles.length > 0) {
    const removedCount = initialLength - validCart.length;
    
    // Очищаем и заполняем корзину валидными товарами
    cart.length = 0;
    cart.push(...validCart);
    
    localStorage.setItem('cart', JSON.stringify(cart));
    
    if (!isAdmin) { // Показываем уведомление только клиентам
      const parts = [];
      if (removedCount > 0) parts.push(`Удалено недоступных товаров: ${removedCount}`);
      if (adjustedTitles.length > 0) parts.push(`Количество уменьшено по остатку: ${adjustedTitles.length}`);
      if (parts.length > 0) {
        Swal.fire({
          icon: 'info',
          title: 'Внимание',
          text: parts.join('. '),
          timer: 3500,
          showConfirmButton: false
        });
      }
    }
  }
  
  // Показываем подсказку о прокрутке, если товаров больше 4
  const cartList = document.getElementById('cartList');
  if (cartList) {
    let scrollHint = document.getElementById('cartScrollHint');
    if (!scrollHint) {
      scrollHint = document.createElement('div');
      scrollHint.id = 'cartScrollHint';
      scrollHint.className = 'cart-scroll-hint';
      cartList.parentNode.insertBefore(scrollHint, cartList);
    }
    if (cart.length > 4) {
      scrollHint.textContent = 'Прокрутите список товаров ↓';
      scrollHint.style.display = '';
    } else {
      scrollHint.style.display = 'none';
    }
    cartList.innerHTML = '';

    let total = 0;

    cart.forEach((item, i) => {
      // Пересчитываем цену для каждого товара в корзине
      const product = products.find(p => p.id === item.id);
      if (product) {
        if (product.optQty && item.qty >= product.optQty && product.optPrice) {
          item.price = product.optPrice;
        } else {
          item.price = product.price;
        }
      }
      total += item.qty * item.price;

      // Мини-фото (если есть)
      const imgSrc = (product && product.image) ? product.image : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="18"%3EНет фото%3C/text%3E%3C/svg%3E';
      // Определяем единицу измерения (пачка или шт)
      const unitLabel = (product && product.isPack) ? 'пач.' : 'шт.';
      const packBadge = (product && product.isPack) ? '<span style="background:#9c27b0;color:white;padding:2px 5px;border-radius:4px;font-size:10px;margin-left:5px;">ПАЧКА</span>' : '';
      const div = document.createElement('div');
      div.classList.add('cart-item', 'cart-item-compact');
      div.innerHTML = `
        <img src="${imgSrc}" alt="" class="cart-mini-img" style="cursor:pointer;" onclick="showPreview('${imgSrc}')">
        <div class="cart-info-row" style="display:flex;align-items:center;flex:1 1 auto;gap:8px;min-width:0;">
          <span class="cart-title" style="flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}${packBadge}</span>
          <span class="cart-qty" style="white-space:nowrap;">×${item.qty} ${unitLabel}</span>
          <span class="cart-price" style="white-space:nowrap;">${item.price} сом</span>
          <span class="cart-sum" style="white-space:nowrap;font-weight:bold;">${item.qty * item.price} сом</span>
        </div>
        <button class="delete-item" onclick="removeFromCart(${i})">&times;</button>
      `;
      cartList.appendChild(div);
    });

    const totalSum = document.getElementById('totalSum');
    if (totalSum) totalSum.textContent = total + ' сом';
  }

  // Если открыта страница корзины, обновим её
  if (document.getElementById('cartPage') && document.getElementById('cartPage').style.display !== 'none') {
    renderCartPage();
  }

  localStorage.setItem('cart', JSON.stringify(cart));
  
  // ОПТИМИЗАЦИЯ: Отправляем событие для обновления счётчиков навигации
  window.dispatchEvent(new Event('cartUpdated'));
  
  // ОПТИМИЗАЦИЯ: Обновляем отображение только для товаров в корзине, а не для всех
  if (typeof products !== 'undefined') {
    // Собираем ID товаров в корзине
    const cartProductIds = new Set(cart.map(item => item.id));
    
    // Обновляем только товары, которые в корзине или были видимы на экране
    products.forEach(p => {
      // Обновляем только если товар в корзине или имеет соответствующий элемент на странице
      const displayEl = document.getElementById(`pack-qty-${p.id}`) || document.getElementById(`qty-display-${p.id}`);
      if (!displayEl) return; // Элемент не на экране - пропускаем
      
      if (p.isPack && typeof updatePackDisplay === 'function') {
        updatePackDisplay(p.id);
      }
      if (p.useQtyButtons && typeof updateQtyDisplay === 'function') {
        updateQtyDisplay(p.id);
      }
    });
  }
}

function removeFromCart(i) {
  // Анимация удаления
  const cartList = document.getElementById('cartList');
  const itemDiv = cartList ? cartList.children[i] : null;
  const removedItem = cart[i]; // Сохраняем информацию об удаляемом товаре
  
  if (itemDiv) {
    itemDiv.classList.add('cart-item-removing');
    setTimeout(() => {
      cart.splice(i, 1);
      updateCart();
      
      // Обновляем отображение для товара-пачки или с кнопками +/-
      if (removedItem) {
        const product = products.find(p => p.id === removedItem.id);
        if (product && product.isPack && typeof updatePackDisplay === 'function') {
          updatePackDisplay(removedItem.id);
        }
        if (product && product.useQtyButtons && typeof updateQtyDisplay === 'function') {
          updateQtyDisplay(removedItem.id);
        }
      }
    }, 300);
  } else {
    cart.splice(i, 1);
    updateCart();
    
    // Обновляем отображение для товара-пачки или с кнопками +/-
    if (removedItem) {
      const product = products.find(p => p.id === removedItem.id);
      if (product && product.isPack && typeof updatePackDisplay === 'function') {
        updatePackDisplay(removedItem.id);
      }
      if (product && product.useQtyButtons && typeof updateQtyDisplay === 'function') {
        updateQtyDisplay(removedItem.id);
      }
    }
  }
}

// Открыть отдельную страницу-панель корзины
function openCartPage() {
  renderCartPage();
  document.getElementById('cartPage').style.display = '';
  if (typeof lockPageScroll === 'function') lockPageScroll();
}

function closeCartPage() {
  document.getElementById('cartPage').style.display = 'none';
  if (typeof unlockPageScroll === 'function') unlockPageScroll();
}

function renderCartPage() {
  const list = document.getElementById('cartPageList');
  const totalEl = document.getElementById('cartPageTotal');
  const summaryEl = document.getElementById('cartPageSummary');
  const emptyMessage = document.getElementById('cartEmptyMessage');
  const footer = document.getElementById('cartPageFooter');
  
  if (!list) return;
  
  list.innerHTML = '';
  
  // Если корзина пуста
  if (cart.length === 0) {
    if (emptyMessage) emptyMessage.style.display = 'block';
    if (footer) footer.style.display = 'none';
    if (summaryEl) summaryEl.textContent = '';
    return;
  }
  
  if (emptyMessage) emptyMessage.style.display = 'none';
  if (footer) footer.style.display = 'block';
  
  let total = 0;
  let totalItems = 0;
  let packCount = 0;
  
  cart.forEach((item, i) => {
    const product = products.find(p => p.id === item.id);
    const isPack = product && product.isPack;
    const unitLabel = isPack ? 'пач.' : 'шт.';
    const itemTotal = item.qty * item.price;
    total += itemTotal;
    totalItems += item.qty;
    if (isPack) packCount++;
    
    const div = document.createElement('div');
    div.className = 'cart-page-item';
    div.style.cssText = 'background:#fff; border:1px solid #e9ecef; border-radius:12px; padding:12px; display:flex; gap:12px; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.04);';
    
    div.innerHTML = `
      <img src="${item.image || 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\"%3E%3Crect fill=\"%23ddd\" width=\"200\" height=\"200\"/%3E%3Ctext fill=\"%23999\" x=\"50%25\" y=\"50%25\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"18\"%3EНет фото%3C/text%3E%3C/svg%3E'}" class="cart-item-img" style="width:60px; height:60px; object-fit:cover; border-radius:10px; flex-shrink:0; cursor:pointer;" onclick="showPreview('${item.image}')"> 
      <div style="flex:1; min-width:0;">
        <div class="item-title" style="font-weight:600; font-size:13px; margin-bottom:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${item.title}</span>
          ${isPack ? '<span style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:white;padding:2px 6px;border-radius:8px;font-size:9px;font-weight:600;">ПАЧКА</span>' : ''}
        </div>
        ${item.variantName ? `<div style="color:#7b1fa2; font-size:11px; margin-bottom:4px; background:#f3e5f5; padding:3px 8px; border-radius:4px; display:inline-block;">🎨 ${item.variantName}</div>` : ''}
        <div style="color:#666; font-size:12px; margin-bottom:6px;">${item.price} сом / ${unitLabel}</div>
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="display:flex; align-items:center; background:#f0f0f0; border-radius:6px; overflow:hidden;">
            <button onclick="changeCartItemQty(${i}, -1)" style="width:28px; height:28px; border:none; background:#e0e0e0; font-size:16px; cursor:pointer; font-weight:700;">−</button>
            <span style="padding:0 10px; font-weight:700; ">${item.qty}</span>
            <button onclick="changeCartItemQty(${i}, 1)" style="width:28px; height:28px; border:none; background:#e0e0e0; font-size:16px; cursor:pointer; font-weight:700;">+</button>
          </div>
          <span style="color:#888; font-size:11px;">${unitLabel}</span>
        </div>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        <div class="item-price" style="font-size:16px; font-weight:700; color:#e53935; margin-bottom:6px;">${itemTotal} сом</div>
        <button onclick="removeFromCart(${i})" style="background:#ffebee; color:#c62828; border:none; padding:6px 10px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:600;">🗑</button>
      </div>
    `;
    list.appendChild(div);
  });
  
  // Обновляем итого и сводку
  if (totalEl) totalEl.textContent = total + ' сом';
  
  const positionWord = cart.length === 1 ? 'позиция' : (cart.length < 5 ? 'позиции' : 'позиций');
  let summaryText = `${cart.length} ${positionWord}, ${totalItems} товаров`;
  if (packCount > 0) {
    summaryText += ` (${packCount} пачек)`;
  }
  if (summaryEl) summaryEl.textContent = summaryText;
}

// Функция изменения количества товара в корзине
function changeCartItemQty(index, delta) {
  if (index < 0 || index >= cart.length) return;
  
  const item = cart[index];
  const product = products.find(p => p.id === item.id);
  const minQty = (product && product.minQty) ? product.minQty : 1;
  
  // Определяем шаг изменения
  let step = minQty;
  if (product && product.isPack) step = 1; // Для пачек всегда шаг 1
  
  const newQty = item.qty + (delta * step);
  
  // Проверяем остаток
  if (product) {
    const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
    const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
    if (stock !== null && newQty > stock) {
      Swal.fire({
        icon: 'warning',
        title: 'Ограничение',
        text: `Доступно только ${stock} ${product.isPack ? 'пачек' : 'шт'}`,
        toast: true,
        position: 'bottom',
        timer: 2000,
        showConfirmButton: false
      });
      return;
    }
  }
  
  if (newQty <= 0) {
    // Удаляем товар
    removeFromCart(index);
  } else {
    item.qty = newQty;
    
    // Пересчитываем цену с учетом опта
    if (product) {
      if (product.optQty && newQty >= product.optQty && product.optPrice) {
        item.price = product.optPrice;
      } else {
        item.price = product.price;
      }
      // Обновляем unitsPerBox (могло измениться в настройках товара)
      item.unitsPerBox = product.unitsPerBox || 72;
    }
    
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    renderCartPage();
  }
}

// Функция очистки корзины
function clearCart() {
  if (cart.length === 0) return;
  
  Swal.fire({
    title: 'Очистить корзину?',
    text: 'Все товары будут удалены',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Да, очистить',
    cancelButtonText: 'Отмена'
  }).then((result) => {
    if (result.isConfirmed) {
      cart.length = 0;
      localStorage.setItem('cart', JSON.stringify(cart));
      updateCart();
      renderCartPage();
      Swal.fire({
        icon: 'success',
        title: 'Корзина очищена',
        toast: true,
        position: 'bottom',
        timer: 1500,
        showConfirmButton: false
      });
    }
  });
}
