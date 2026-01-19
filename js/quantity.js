// ==================== МОДУЛЬ УПРАВЛЕНИЯ КОЛИЧЕСТВОМ ====================

// Функция анимации "летящего товара" в корзину
function flyToCart(sourceElement, imageUrl) {
  const cartBtn = document.getElementById('cartFloatBtn');
  if (!cartBtn) return;
  
  // Получаем позиции
  const sourceRect = sourceElement.getBoundingClientRect();
  const cartRect = cartBtn.getBoundingClientRect();
  
  // Создаём летящий элемент с изображением
  const flyEl = document.createElement('div');
  flyEl.className = 'flying-item';
  
  // Если есть изображение, используем его
  if (imageUrl) {
    flyEl.innerHTML = `<img src="${imageUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;">`;
  } else {
    flyEl.innerHTML = `<div style="width:60px;height:60px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;">🛒</div>`;
  }
  
  // Начальная позиция (от источника)
  flyEl.style.left = sourceRect.left + sourceRect.width / 2 - 30 + 'px';
  flyEl.style.top = sourceRect.top + 'px';
  flyEl.style.width = '60px';
  flyEl.style.height = '60px';
  flyEl.style.opacity = '1';
  flyEl.style.transform = 'scale(1)';
  
  document.body.appendChild(flyEl);
  
  // Запускаем анимацию полёта
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flyEl.classList.add('animate');
      flyEl.style.left = cartRect.left + cartRect.width / 2 - 15 + 'px';
      flyEl.style.top = cartRect.top + cartRect.height / 2 - 15 + 'px';
      flyEl.style.width = '30px';
      flyEl.style.height = '30px';
      flyEl.style.opacity = '0.5';
      flyEl.style.transform = 'scale(0.3) rotate(360deg)';
    });
  });
  
  // Анимация кнопки корзины при "попадании"
  setTimeout(() => {
    cartBtn.classList.add('cart-bounce');
    
    // Пульсация счётчика
    const cartCount = document.getElementById('cartFloatCount');
    if (cartCount) {
      cartCount.style.transform = 'scale(1.4)';
      cartCount.style.background = '#4caf50';
      cartCount.style.color = 'white';
      setTimeout(() => {
        cartCount.style.transform = 'scale(1)';
        cartCount.style.background = '#fff';
        cartCount.style.color = '#764ba2';
      }, 300);
    }
    
    setTimeout(() => cartBtn.classList.remove('cart-bounce'), 500);
  }, 550);
  
  // Удаляем летящий элемент
  setTimeout(() => flyEl.remove(), 700);
}

// Функция анимации добавления в корзину для кнопок +/-
function animateAddToCart(button, text) {
  // Анимация кнопки
  button.classList.add('adding');
  setTimeout(() => button.classList.remove('adding'), 400);
  
  // Находим изображение товара
  const card = button.closest('.product-card');
  const img = card ? card.querySelector('.card-image img') : null;
  const imageUrl = img ? img.src : null;
  
  // Запускаем анимацию полёта от фото товара
  flyToCart(img || button, imageUrl);
}

// Функции управления количеством пачек
function incrementPack(productId, btnElement) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  if (product.blocked) {
    Swal.fire('Ошибка', 'Этот товар временно недоступен', 'warning');
    return;
  }

  // Проверка остатка
  const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
  const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
  if (stock !== null && stock <= 0) {
    Swal.fire('Ошибка', 'Нет в наличии', 'warning');
    return;
  }

  // Количество штук в коробке (используем unitsPerBox или 72 по умолчанию)
  const unitsPerBox = product.unitsPerBox || 72;
  
  // Определяем цену за штуку
  let pricePerUnit = (product.price || 0) / (product.packQty || 1);
  
  // Добавление или обновление в корзине (сохраняем количество в штуках)
  const cartItem = cart.find(item => item.id === productId);
  const currentUnitsInCart = cartItem ? cartItem.qty : 0;
  const newTotalUnits = currentUnitsInCart + unitsPerBox;
  
  if (cartItem) {
    cartItem.qty = newTotalUnits;
  } else {
    cart.push({ 
      id: productId, 
      title: product.title, 
      price: product.price || 0, 
      qty: unitsPerBox, 
      image: product.image, 
      costPrice: product.costPrice || 0,
      sellerId: product.sellerId || null,
      sellerName: product.sellerName || null,
      unitsPerBox: unitsPerBox
    });
  }

  updateCart();
  localStorage.setItem('cart', JSON.stringify(cart));
  
  // Обновляем отображение количества штук
  updatePackDisplay(productId);
  
  // Анимация добавления в корзину (полёт товара)
  if (btnElement) {
    animateAddToCart(btnElement);
  }
}

// Функция добавления целой коробки (packsPerBox пачек сразу)
function decrementPack(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  // Находим товар в корзине
  const cartItemIndex = cart.findIndex(item => item.id === productId);
  if (cartItemIndex === -1) {
    Swal.fire({
      title: 'Корзина пуста',
      text: 'Сначала добавьте товар',
      icon: 'info',
      position: 'bottom',
      timer: 1500,
      toast: true
    });
    return;
  }

  const cartItem = cart[cartItemIndex];
  
  // Определяем количество штук в коробке (используем unitsPerBox или 72 по умолчанию)
  const unitsPerBox = product.unitsPerBox || 72;
  
  // Текущее количество штук в корзине
  const currentUnits = cartItem.qty || 0;
  
  if (currentUnits > unitsPerBox) {
    // Убираем одну коробку (unitsPerBox штук)
    cartItem.qty = currentUnits - unitsPerBox;
    
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    updatePackDisplay(productId);
    
    Swal.fire({
      title: '📦 -1 коробка',
      text: `Осталось: ${cartItem.qty} шт`,
      icon: 'info',
      position: 'bottom',
      timer: 1500,
      toast: true
    });
  } else {
    // Если осталось меньше или равно одной коробке - удаляем полностью
    cart.splice(cartItemIndex, 1);
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    updatePackDisplay(productId);
    
    Swal.fire({
      title: 'Удалено из корзины',
      text: `${product.title}`,
      icon: 'info',
      position: 'bottom',
      timer: 1500,
      toast: true
    });
  }
}

// Функция для применения введённого количества пачек (кнопка "Применить")
function applyPackQty(productId) {
  const inputElement = document.getElementById(`pack-qty-${productId}`);
  if (inputElement) {
    setPackQty(productId, inputElement);
  }
}

// Функция для применения введённого количества штук (кнопка "Применить")
function applyQtyInput(productId) {
  const inputElement = document.getElementById(`qty-display-${productId}`);
  if (inputElement) {
    setQtyInput(productId, inputElement);
  }
}

// Обновляем отображение количества пачек на карточке товара
function updatePackDisplay(productId) {
  const displayElement = document.getElementById(`pack-qty-${productId}`);
  if (!displayElement) return;
  
  // Не обновляем если элемент в фокусе (пользователь редактирует)
  if (document.activeElement === displayElement) return;
  
  const product = products.find(p => p.id === productId);
  const cartItem = cart.find(item => item.id === productId);
  const qty = cartItem ? cartItem.qty : 0;
  
  // Показываем количество штук
  const displayText = qty > 0 ? `${qty} шт` : '0';
  
  // Обновляем значение (textContent для div, value для input)
  if (displayElement.tagName === 'INPUT') {
    displayElement.value = displayText;
  } else {
    displayElement.textContent = displayText;
  }
  
  // Меняем цвет в зависимости от наличия в корзине
  if (qty > 0) {
    displayElement.style.background = '#e8f5e9';
    displayElement.style.color = '#2e7d32';
    displayElement.style.borderColor = '#66bb6a';
  } else {
    displayElement.style.background = '#f3e5f5';
    displayElement.style.color = '#7b1fa2';
    displayElement.style.borderColor = '#ce93d8';
  }
  
  // Обновляем цену на карточке (оптовая если достигнут порог)
  if (product) {
    const card = displayElement.closest('.product-card');
    if (card) {
      const priceEl = card.querySelector('.card-price');
      const optInfoEl = card.querySelector('.card-opt-info');
      
      if (priceEl) {
        const basePrice = Math.round(product.price || 0);
        const optPrice = product.optPrice ? Math.round(product.optPrice) : null;
        const optQty = product.optQty || null;
        const unitLabel = product.isPack ? 'пачек' : 'шт';
        
        if (optQty && optPrice && qty >= optQty) {
          // Показываем оптовую цену
          priceEl.textContent = optPrice + ' сом' + (product.isPack ? ' / пачка' : '');
          priceEl.style.color = '#2e7d32';
          
          // Показываем старую цену зачеркнутой
          let oldPriceEl = card.querySelector('.card-oldprice');
          if (!oldPriceEl) {
            oldPriceEl = document.createElement('div');
            oldPriceEl.className = 'card-oldprice';
            oldPriceEl.style.marginLeft = '8px';
            oldPriceEl.style.fontSize = '13px';
            oldPriceEl.style.color = '#888';
            if (priceEl.parentNode) priceEl.parentNode.appendChild(oldPriceEl);
          }
          oldPriceEl.textContent = basePrice + ' сом';
          
          if (optInfoEl) {
            optInfoEl.textContent = `✅ Оптовая цена: ${optPrice} сом (при ${optQty} ${unitLabel})`;
            optInfoEl.style.color = '#2e7d32';
            optInfoEl.style.fontWeight = '700';
          }
        } else {
          // Показываем обычную цену
          priceEl.textContent = basePrice + ' сом' + (product.isPack ? ' / пачка' : '');
          priceEl.style.color = '#e53935';
          
          // Удаляем старую зачеркнутую цену
          const oldPriceEl = card.querySelector('.card-oldprice');
          if (oldPriceEl && oldPriceEl.parentNode) oldPriceEl.parentNode.removeChild(oldPriceEl);
          
          if (optInfoEl && optPrice && optQty) {
            optInfoEl.textContent = `Опт: ${optPrice} сом/${product.isPack ? 'пачка' : 'шт'} при ${optQty} ${unitLabel}`;
            optInfoEl.style.color = '#007bff';
            optInfoEl.style.fontWeight = 'normal';
          }
        }
      }
    }
  }
}

// Функция для установки количества пачек через ввод
function setPackQty(productId, inputElement) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  // Читаем значение (textContent для div, value для input)
  const rawValue = inputElement.tagName === 'INPUT' ? inputElement.value : inputElement.textContent;
  let newQty = parseInt(rawValue) || 0;
  if (newQty < 0) newQty = 0;
  
  // Функция для установки значения
  function setValue(val) {
    if (inputElement.tagName === 'INPUT') {
      inputElement.value = val;
    } else {
      inputElement.textContent = val;
    }
  }
  
  // Проверка остатка
  const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
  const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
  
  if (stock !== null && newQty > stock) {
    newQty = stock;
    setValue(newQty);
    Swal.fire({
      title: 'Ограничение',
      text: `Доступно только ${stock} пачек`,
      icon: 'warning',
      toast: true,
      position: 'bottom',
      timer: 2000,
      showConfirmButton: false
    });
  }
  
  // Находим или создаём элемент корзины
  const cartItemIndex = cart.findIndex(item => item.id === productId);
  
  if (newQty <= 0) {
    // Удаляем из корзины
    if (cartItemIndex !== -1) {
      cart.splice(cartItemIndex, 1);
    }
    setValue(0);
  } else {
    // Определяем цену
    let finalPrice = Math.round(product.price || 0);
    if (product.optQty && newQty >= product.optQty && product.optPrice) {
      finalPrice = Math.round(product.optPrice || 0);
    }
    
    if (cartItemIndex !== -1) {
      cart[cartItemIndex].qty = newQty;
      cart[cartItemIndex].price = finalPrice;
    } else {
      cart.push({
        id: productId,
        title: product.title,
        price: finalPrice,
        qty: newQty,
        image: product.image,
        costPrice: product.costPrice || 0,
        sellerId: product.sellerId || null,
        sellerName: product.sellerName || null
      });
    }
  }
  
  updateCart();
  localStorage.setItem('cart', JSON.stringify(cart));
  updatePackDisplay(productId);
}

// Функция для установки количества штук через ввод (для не-пачек)
function setQtyInput(productId, inputElement) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  // Читаем значение (textContent для div, value для input)
  const rawValue = inputElement.tagName === 'INPUT' ? inputElement.value : inputElement.textContent;
  let newQty = parseInt(rawValue) || 0;
  if (newQty < 0) newQty = 0;
  
  // Функция для установки значения
  function setValue(val) {
    if (inputElement.tagName === 'INPUT') {
      inputElement.value = val;
    } else {
      inputElement.textContent = val;
    }
  }
  
  // Автоматическое округление до кратного minQty (только если включено roundQty)
  const minQty = product.minQty || 1;
  if (product.roundQty && minQty > 1 && newQty > 0) {
    const remainder = newQty % minQty;
    if (remainder !== 0) {
      const oldQty = newQty;
      newQty = newQty + (minQty - remainder);
      setValue(newQty);
      Swal.fire({
        icon: 'info',
        title: 'Количество округлено',
        html: `Минимальная покупка: <b>${minQty}</b> шт.<br>Количество изменено: ${oldQty} → <b>${newQty}</b> шт`,
        timer: 2500,
        toast: true,
        position: 'bottom',
        showConfirmButton: false
      });
    }
  }
  
  // Проверка остатка
  const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
  const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
  
  if (stock !== null && newQty > stock) {
    // Округляем вниз до кратного minQty, но не больше остатка (только если roundQty)
    if (product.roundQty && minQty > 1) {
      newQty = Math.floor(stock / minQty) * minQty;
    } else {
      newQty = stock;
    }
    setValue(newQty);
    Swal.fire({
      title: 'Ограничение',
      text: `Доступно только ${stock} шт (округлено до ${newQty})`,
      icon: 'warning',
      toast: true,
      position: 'bottom',
      timer: 2000,
      showConfirmButton: false
    });
  }
  
  const cartItemIndex = cart.findIndex(item => item.id === productId);
  
  if (newQty <= 0) {
    if (cartItemIndex !== -1) {
      cart.splice(cartItemIndex, 1);
    }
    setValue(0);
  } else {
    let finalPrice = Math.round(product.price || 0);
    if (product.optQty && newQty >= product.optQty && product.optPrice) {
      finalPrice = Math.round(product.optPrice || 0);
    }
    
    if (cartItemIndex !== -1) {
      cart[cartItemIndex].qty = newQty;
      cart[cartItemIndex].price = finalPrice;
    } else {
      cart.push({
        id: productId,
        title: product.title,
        price: finalPrice,
        qty: newQty,
        image: product.image,
        costPrice: product.costPrice || 0,
        sellerId: product.sellerId || null,
        sellerName: product.sellerName || null
      });
    }
  }
  
  updateCart();
  localStorage.setItem('cart', JSON.stringify(cart));
  updateQtyDisplay(productId);
}

// Функции для товаров с кнопками +/- (не пачки, но с минимальным количеством)
function incrementQty(productId, btnElement) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  if (product.blocked) {
    Swal.fire('Ошибка', 'Этот товар временно недоступен', 'warning');
    return;
  }

  const hasStock = typeof product.stock === 'number' && isFinite(product.stock);
  const stock = hasStock ? Math.max(0, Math.floor(product.stock)) : null;
  if (stock !== null && stock <= 0) {
    Swal.fire('Ошибка', 'Нет в наличии', 'warning');
    return;
  }

  const minQty = product.minQty || 1;
  const cartItem = cart.find(item => item.id === productId);
  const currentQty = cartItem ? cartItem.qty : 0;
  
  // Проверяем остаток
  if (stock !== null && (currentQty + minQty) > stock) {
    Swal.fire('Ошибка', `Доступно только ${stock} шт`, 'warning');
    return;
  }

  // Определяем цену (оптовую или обычную)
  const totalQtyAfter = currentQty + minQty;
  let finalPrice = product.price || 0;
  if (product.optQty && totalQtyAfter >= product.optQty && product.optPrice) {
    finalPrice = product.optPrice;
  }

  if (cartItem) {
    cartItem.qty += minQty;
    cartItem.price = (product.optQty && cartItem.qty >= product.optQty && product.optPrice)
      ? product.optPrice
      : product.price;
  } else {
    cart.push({ 
      id: productId, 
      title: product.title, 
      price: finalPrice, 
      qty: minQty, 
      image: product.image, 
      costPrice: product.costPrice || 0,
      sellerId: product.sellerId || null,
      sellerName: product.sellerName || null
    });
  }

  updateCart();
  localStorage.setItem('cart', JSON.stringify(cart));
  updateQtyDisplay(productId);
  
  // Анимация добавления в корзину (полёт товара)
  if (btnElement) {
    animateAddToCart(btnElement);
  }
}

function decrementQty(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const cartItemIndex = cart.findIndex(item => item.id === productId);
  if (cartItemIndex === -1) {
    Swal.fire({
      title: 'Корзина пуста',
      text: 'Сначала добавьте товар',
      icon: 'info',
      position: 'bottom',
      timer: 1500,
      toast: true
    });
    return;
  }

  const cartItem = cart[cartItemIndex];
  const minQty = product.minQty || 1;
  
  if (cartItem.qty > minQty) {
    cartItem.qty -= minQty;
    
    if (product.optQty && cartItem.qty >= product.optQty && product.optPrice) {
      cartItem.price = product.optPrice;
    } else {
      cartItem.price = product.price;
    }
    
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    updateQtyDisplay(productId);
    
    Swal.fire({
      title: 'Убрано!',
      text: `-${minQty} шт. Осталось: ${cartItem.qty} шт`,
      icon: 'info',
      position: 'bottom',
      timer: 1500,
      toast: true
    });
  } else {
    cart.splice(cartItemIndex, 1);
    updateCart();
    localStorage.setItem('cart', JSON.stringify(cart));
    updateQtyDisplay(productId);
    
    Swal.fire({
      title: 'Удалено из корзины',
      text: `${product.title}`,
      icon: 'info',
      position: 'bottom',
      timer: 1500,
      toast: true
    });
  }
}

// Обновляем отображение количества для товаров с кнопками +/-
function updateQtyDisplay(productId) {
  const displayElement = document.getElementById(`qty-display-${productId}`);
  if (!displayElement) return;
  
  // Не обновляем если элемент в фокусе (пользователь редактирует)
  if (document.activeElement === displayElement) return;
  
  const product = products.find(p => p.id === productId);
  const cartItem = cart.find(item => item.id === productId);
  const qty = cartItem ? cartItem.qty : 0;
  
  // Обновляем значение (textContent для div, value для input)
  if (displayElement.tagName === 'INPUT') {
    displayElement.value = qty;
  } else {
    displayElement.textContent = qty;
  }
  
  if (qty > 0) {
    displayElement.style.background = '#e8f5e9';
    displayElement.style.color = '#2e7d32';
    displayElement.style.borderColor = '#66bb6a';
  } else {
    displayElement.style.background = '#e3f2fd';
    displayElement.style.color = '#1565c0';
    displayElement.style.borderColor = '#90caf9';
  }
  
  // Обновляем цену на карточке (оптовая если достигнут порог)
  if (product) {
    const card = displayElement.closest('.product-card');
    if (card) {
      const priceEl = card.querySelector('.card-price');
      const optInfoEl = card.querySelector('.card-opt-info');
      
      if (priceEl) {
        const basePrice = Math.round(product.price || 0);
        const optPrice = product.optPrice ? Math.round(product.optPrice) : null;
        const optQty = product.optQty || null;
        
        if (optQty && optPrice && qty >= optQty) {
          // Показываем оптовую цену
          priceEl.textContent = optPrice + ' сом';
          priceEl.style.color = '#2e7d32';
          
          // Показываем старую цену зачеркнутой
          let oldPriceEl = card.querySelector('.card-oldprice');
          if (!oldPriceEl) {
            oldPriceEl = document.createElement('div');
            oldPriceEl.className = 'card-oldprice';
            oldPriceEl.style.marginLeft = '8px';
            oldPriceEl.style.fontSize = '13px';
            oldPriceEl.style.color = '#888';
            if (priceEl.parentNode) priceEl.parentNode.appendChild(oldPriceEl);
          }
          oldPriceEl.textContent = basePrice + ' сом';
          
          if (optInfoEl) {
            optInfoEl.textContent = `✅ Оптовая цена: ${optPrice} сом (при ${optQty} шт)`;
            optInfoEl.style.color = '#2e7d32';
            optInfoEl.style.fontWeight = '700';
          }
        } else {
          // Показываем обычную цену
          priceEl.textContent = basePrice + ' сом';
          priceEl.style.color = '#e53935';
          
          // Удаляем старую зачеркнутую цену
          const oldPriceEl = card.querySelector('.card-oldprice');
          if (oldPriceEl && oldPriceEl.parentNode) oldPriceEl.parentNode.removeChild(oldPriceEl);
          
          if (optInfoEl && optPrice && optQty) {
            optInfoEl.textContent = `Опт: ${optPrice} сом/шт при ${optQty} шт`;
            optInfoEl.style.color = '#007bff';
            optInfoEl.style.fontWeight = 'normal';
          }
        }
      }
    }
  }
}

// Обновляем настройку "Кнопки +/-" для товара
async function updateProductQtyButtons(productId, useButtons) {
  try {
    await db.collection('products').doc(productId).update({ useQtyButtons: useButtons });
    const product = products.find(p => p.id === productId);
    if (product) product.useQtyButtons = useButtons;
    renderProducts();
    Swal.fire({
      icon: 'success',
      title: useButtons ? 'Кнопки +/- включены' : 'Кнопки +/- выключены',
      timer: 1500,
      toast: true,
      position: 'bottom'
    });
  } catch (e) {
    console.error('Ошибка обновления useQtyButtons:', e);
    Swal.fire('Ошибка', 'Не удалось сохранить настройку', 'error');
  }
}

// Обновляем настройку "Округлять количество" для товара
async function updateProductRoundQty(productId, roundQty) {
  try {
    await db.collection('products').doc(productId).update({ roundQty: roundQty });
    const product = products.find(p => p.id === productId);
    if (product) product.roundQty = roundQty;
    renderProducts();
    Swal.fire({
      icon: 'success',
      title: roundQty ? '🔄 Округление включено' : 'Округление выключено',
      timer: 1500,
      toast: true,
      position: 'bottom'
    });
  } catch (e) {
    console.error('Ошибка обновления roundQty:', e);
    Swal.fire('Ошибка', 'Не удалось сохранить настройку', 'error');
  }
}

// Обновляем настройку "Показать цену за штуку" для товара
async function updateProductShowPricePerUnit(productId, show) {
  try {
    await db.collection('products').doc(productId).update({ showPricePerUnit: show });
    const product = products.find(p => p.id === productId);
    if (product) product.showPricePerUnit = show;
    renderProducts();
    Swal.fire({
      icon: 'success',
      title: show ? 'Цена за шт включена' : 'Цена за шт выключена',
      timer: 1500,
      toast: true,
      position: 'bottom'
    });
  } catch (e) {
    console.error('Ошибка обновления showPricePerUnit:', e);
    Swal.fire('Ошибка', 'Не удалось сохранить настройку', 'error');
  }
}

// Обновляем настройку "Показать пачка = шт" для товара
async function updateProductShowPackInfo(productId, show) {
  try {
    await db.collection('products').doc(productId).update({ showPackInfo: show });
    const product = products.find(p => p.id === productId);
    if (product) product.showPackInfo = show;
    renderProducts();
    Swal.fire({
      icon: 'success',
      title: show ? 'Пачка=шт включена' : 'Пачка=шт выключена',
      timer: 1500,
      toast: true,
      position: 'bottom'
    });
  } catch (e) {
    console.error('Ошибка обновления showPackInfo:', e);
    Swal.fire('Ошибка', 'Не удалось сохранить настройку', 'error');
  }
}
