// ===================================================================
// КЕРБЕН B2B Market — Order Submit (оформление заказа)
// ===================================================================

document.getElementById('submitOrder').onclick = async () => {
  const submitBtn = document.getElementById('submitOrder');
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  let driverName = document.getElementById('driverName').value.trim();
  let driverPhone = document.getElementById('driverPhone').value.trim();
  const referredBy = document.getElementById('referredBy').value.trim();
  
  // Проверяем сохранённые данные водителя
  const savedUserData = JSON.parse(localStorage.getItem('userData') || '{}');
  const savedDriverName = savedUserData.driverName || '';
  const savedDriverPhone = savedUserData.driverPhone || '';
  
  // Если есть сохранённый водитель и текущие поля пустые или совпадают - спрашиваем подтверждение
  if (savedDriverName || savedDriverPhone) {
    const result = await Swal.fire({
      title: '🚗 Данные водителя',
      html: `
        <div style="text-align:left; padding:10px 0;">
          <p style="margin-bottom:15px; color:#666;">Подтвердите или измените данные водителя:</p>
          <div style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">Имя водителя:</label>
            <input type="text" id="swal-driver-name" value="${driverName || savedDriverName}" placeholder="Имя водителя" style="width:100%; padding:12px; border:2px solid #17a2b8; border-radius:8px; font-size:16px; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:5px; font-weight:600; color:#333;">Телефон водителя:</label>
            <input type="tel" id="swal-driver-phone" value="${driverPhone || savedDriverPhone}" placeholder="Номер водителя" style="width:100%; padding:12px; border:2px solid #17a2b8; border-radius:8px; font-size:16px; box-sizing:border-box;">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '✅ Подтвердить и заказать',
      cancelButtonText: '❌ Отмена',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      preConfirm: () => {
        return {
          driverName: document.getElementById('swal-driver-name').value.trim(),
          driverPhone: document.getElementById('swal-driver-phone').value.trim()
        };
      }
    });
    
    if (!result.isConfirmed) {
      return; // Отмена заказа
    }
    
    // Обновляем данные водителя из диалога
    driverName = result.value.driverName;
    driverPhone = result.value.driverPhone;
    
    // Обновляем поля формы
    document.getElementById('driverName').value = driverName;
    document.getElementById('driverPhone').value = driverPhone;
  }

  // Анти-спам при 429/Quota exceeded
  try {
    const cooldownUntil = parseInt(localStorage.getItem('firestoreCooldownUntil') || '0', 10) || 0;
    if (Date.now() < cooldownUntil) {
      const sec = Math.ceil((cooldownUntil - Date.now()) / 1000);
      Swal.fire('Подождите', `Слишком много запросов. Повторите через ${sec} сек.`, 'warning');
      return;
    }
  } catch (e) {}

  if (!name || !phone || !address || cart.length === 0) {
    Swal.fire('Ошибка', 'Заполните все поля и добавьте товары', 'warning');
    return;
  }

  // Блокируем кнопку
  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.5';
  submitBtn.style.cursor = 'not-allowed';
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Проверка товаров...';

  try {
    // ВАЖНО: Проверяем все товары в корзине - существуют ли они и не заблокированы ли
    const validCart = [];
    const blockedItems = [];
    const deletedItems = [];
    const outOfStockItems = [];
    
    for (const cartItem of cart) {
      const product = products.find(p => p.id === cartItem.id);
      
      if (!product) {
        // Товар удалён из базы
        deletedItems.push(cartItem.title);
      } else if (product.blocked) {
        // Товар заблокирован
        blockedItems.push(cartItem.title);
      } else if (getEffectiveStock(product) !== null) {
        const stock = getEffectiveStock(product);
        // Если stock === 0 и склад не настроен — пропускаем проверку (товар доступен)
        const hasWarehouseSetup = product.warehouseStock && typeof product.warehouseStock === 'object' && Object.keys(product.warehouseStock).length > 0;
        if (stock <= 0 && !hasWarehouseSetup) {
          // Склад не настроен — разрешаем заказ без ограничений
          validCart.push({
            ...cartItem,
            title: product.title,
            price: product.price,
            costPrice: product.costPrice || 0,
            sellerId: product.sellerId || cartItem.sellerId || null,
            sellerName: product.sellerName || cartItem.sellerName || null
          });
        } else if (stock <= 0) {
          outOfStockItems.push(`${cartItem.title} (нет в наличии)`);
        } else if ((cartItem.qty || 0) > stock) {
          outOfStockItems.push(`${cartItem.title} (доступно ${stock} шт)`);
        } else {
          // Товар валидный, обновляем данные из базы
          validCart.push({
            ...cartItem,
            title: product.title, // Берём актуальное название
            price: product.price, // Берём актуальную цену
            costPrice: product.costPrice || 0, // Берём актуальную себестоимость
            sellerId: product.sellerId || cartItem.sellerId || null, // ID продавца
            sellerName: product.sellerName || cartItem.sellerName || null
          });
        }
      } else {
        // Товар валидный, обновляем данные из базы
        validCart.push({
          ...cartItem,
          title: product.title,
          price: product.price,
          costPrice: product.costPrice || 0,
          sellerId: product.sellerId || cartItem.sellerId || null,
          sellerName: product.sellerName || cartItem.sellerName || null
        });
      }
    }
    
    // Если есть проблемные товары, показываем предупреждение
    if (blockedItems.length > 0 || deletedItems.length > 0 || outOfStockItems.length > 0) {
      let warningText = '';
      
      if (blockedItems.length > 0) {
        warningText += '<div style="color:#dc3545; margin:10px 0;"><strong>❌ Заблокированные товары (недоступны):</strong><br>' + blockedItems.join('<br>') + '</div>';
      }
      
      if (deletedItems.length > 0) {
        warningText += '<div style="color:#dc3545; margin:10px 0;"><strong>🗑️ Удалённые товары:</strong><br>' + deletedItems.join('<br>') + '</div>';
      }

      if (outOfStockItems.length > 0) {
        warningText += '<div style="color:#dc3545; margin:10px 0;"><strong>📦 Недостаточно остатка:</strong><br>' + outOfStockItems.join('<br>') + '</div>';
      }
      
      if (validCart.length === 0) {
        // Все товары проблемные
        Swal.fire({
          icon: 'error',
          title: 'Невозможно оформить заказ',
          html: warningText + '<br><strong>Все товары в корзине недоступны. Корзина будет очищена.</strong>',
          confirmButtonText: 'Понятно'
        });
        
        // Очищаем корзину
        cart.length = 0;
        updateCart();
        localStorage.removeItem('cart');
        
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        submitBtn.textContent = originalText;
        return;
      }
      
      // Есть валидные товары, предлагаем продолжить без проблемных
      const result = await Swal.fire({
        icon: 'warning',
        title: 'Внимание!',
        html: warningText + '<br><strong style="color:#28a745;">✓ Доступные товары (' + validCart.length + ' шт) можно заказать.</strong><br><br>Продолжить оформление заказа только с доступными товарами?',
        showCancelButton: true,
        confirmButtonText: 'Да, продолжить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d'
      });
      
      if (!result.isConfirmed) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        submitBtn.textContent = originalText;
        return;
      }
      
      // Обновляем корзину - удаляем проблемные товары
      cart.length = 0;
      cart.push(...validCart);
      updateCart();
    }
    
    submitBtn.textContent = 'Отправка...';
    
    const items = cart.map(i => {
      const product = products.find(p => p.id === i.id);
      const unitLabel = (product && product.isPack) ? 'пачка' : 'шт';
      const packInfo = (product && product.isPack && product.packQty) ? ` (~${product.packQty} шт/пачка)` : '';
      const variantInfo = i.variant ? ` [${i.variant}]` : '';
      return `${i.title}${variantInfo}${packInfo} — ${i.qty} ${unitLabel} × ${i.price} сом = ${i.qty * i.price} сом`;
    }).join('\n');
    const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const currentTime = new Date().toLocaleString();

    // Получаем партнера из URL (если есть) или из поля формы
    let partner = getCurrentPartner();
    if (!partner && referredBy) {
      partner = referredBy; // Если клиент сам указал партнера
    }
    
    // Проверяем, есть ли этот клиент в базе привязок к агентам
    if (!partner && phone) {
      try {
        const clientAgentDoc = await db.collection('clientAgents').doc(phone).get();
        if (clientAgentDoc.exists) {
          const clientAgentData = clientAgentDoc.data();
          partner = clientAgentData.agentName;
          console.log('📌 Клиент привязан к агенту:', partner);
        }
      } catch(e) {
        console.log('Не удалось проверить привязку клиента к агенту:', e);
      }
    }

    // Сохраняем партнера если клиент указал
    if (referredBy) {
      try {
        localStorage.setItem('savedReferredBy', referredBy);
      } catch(e) {}
    }

    // Списание остатков + сохранение заказа
    submitBtn.textContent = 'Отправка в базу...';

    const orderRef = db.collection('orders').doc();
    const batch = db.batch();

    for (const item of cart) {
      const localProduct = products.find(p => p.id === item.id);
      const hasLocalStock = localProduct && typeof localProduct.stock === 'number' && isFinite(localProduct.stock);
      if (!hasLocalStock) continue;

      // Если склад не настроен (stock=0, нет warehouseStock) — пропускаем списание
      const hasWarehouseSetup = localProduct.warehouseStock && typeof localProduct.warehouseStock === 'object' && Object.keys(localProduct.warehouseStock).length > 0;
      const localStock = Math.max(0, Math.floor(localProduct.stock));
      if (localStock <= 0 && !hasWarehouseSetup) continue;

      const need = Math.max(0, Math.floor(item.qty || 0));
      if (need <= 0) {
        throw new Error(`Некорректное количество: ${item.title}`);
      }

      // Предварительная проверка по локальному кэшу
      if (localStock < need) {
        throw new Error(`Недостаточно остатка для товара: ${localProduct.title || item.title}. Доступно ${localStock} шт`);
      }

      const productRef = db.collection('products').doc(item.id);
      batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(-need) });

      // === СПИСАНИЕ СО СКЛАДОВ ===
      const ws = localProduct.warehouseStock;
      if (ws && typeof ws === 'object') {
        let remaining = need;
        const sortedWarehouses = Object.entries(ws)
          .filter(([, qty]) => qty > 0)
          .sort((a, b) => b[1] - a[1]);
        
        const updatedWs = { ...ws };
        for (const [whId, whQty] of sortedWarehouses) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, whQty);
          updatedWs[whId] = whQty - deduct;
          remaining -= deduct;
        }
        
        batch.update(productRef, { warehouseStock: updatedWs });
      }
    }

    batch.set(orderRef, {
      name,
      phone,
      address,
      driverName: driverName || null,
      driverPhone: driverPhone || null,
      items: cart.map(item => ({
        id: item.id,
        title: item.title,
        qty: item.qty,
        price: item.price,
        image: item.image || null,
        costPrice: item.costPrice || 0,
        sellerId: item.sellerId || null,
        sellerName: item.sellerName || null,
        variant: item.variant || null
      })),
      total,
      timestamp: Date.now(),
      time: currentTime,
      status: 'pending',
      partner: partner || null,
      referredBy: referredBy || null
    });

    await batch.commit();

    const driverInfo = (driverName || driverPhone) ? `\nВодитель: ${driverName || '-'}\nТел. водителя: ${driverPhone || '-'}` : '';
    const msg = `Новый заказ:\nИмя: ${name}\nТелефон: ${phone}\nАдрес: ${address}${driverInfo}\nТовары:\n${items}\n\nИтого: ${total} сом`;

    // СРАЗУ показываем успех клиенту и ЖДЁМ закрытия
    await Swal.fire('Успех!', 'Ваш заказ принят и отправляется!', 'success');
    
    // Автоматическая регистрация/вход после первого заказа (после закрытия Успех! диалога)
    if (typeof autoRegisterAfterOrder === 'function') {
      await autoRegisterAfterOrder(name, phone, address);
    }
    
    // Обновляем статистику клиента если он авторизован
    if (typeof updateCustomerStats === 'function') {
      updateCustomerStats(total);
    }
    
    // Сохраняем заказ в историю
    saveOrderToHistory({
      name,
      phone,
      address,
      driverName: driverName || null,
      driverPhone: driverPhone || null,
      items: [...cart],
      total,
      timestamp: Date.now(),
      time: currentTime,
      status: 'pending'
    });
    
    // Разблокируем кнопку после показа успеха
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
    submitBtn.textContent = originalText;
    
    // Копируем данные для фоновой отправки
    const orderData = {
      name: name,
      phone: phone,
      address: address,
      driverName: driverName,
      driverPhone: driverPhone,
      cart: [...cart],
      total: total,
      currentTime: currentTime
    };
    
    // Очищаем корзину сразу
    cart.length = 0;
    updateCart();
    localStorage.removeItem('cart');

    // Обновляем остатки локально и перерисовываем UI
    try {
      for (const orderedItem of orderData.cart) {
        const p = products.find(x => x.id === orderedItem.id);
        if (!p) continue;
        if (typeof p.stock === 'number' && isFinite(p.stock)) {
          const nextStock = Math.max(0, Math.floor(p.stock) - Math.max(0, Math.floor(orderedItem.qty || 0)));
          p.stock = nextStock;
        }
      }
      renderProducts();
      updateCart();
    } catch (e) {}
    
    // Сохраняем данные пользователя (включая водителя)
    localStorage.setItem('userData', JSON.stringify({
      name,
      phone,
      address,
      driverName,
      driverPhone
    }));
    
    // Отправка файлов в фоновом режиме (без await)
    // 1. Excel файл
    sendOrderAsExcelFile(orderData.name, orderData.phone, orderData.address, orderData.driverName, orderData.driverPhone, orderData.cart, orderData.total, orderData.currentTime)
      .then(() => console.log('Excel файл отправлен успешно'))
      .catch(err => console.error('Ошибка отправки Excel:', err));
    
    // 2. PDF для печати (без фото)
    sendOrderAsPrintPDF(orderData.name, orderData.phone, orderData.address, orderData.driverName, orderData.driverPhone, orderData.cart, orderData.total, orderData.currentTime)
      .then(() => console.log('PDF для печати отправлен успешно'))
      .catch(err => console.error('Ошибка отправки PDF для печати:', err));
    
    // 3. PDF с фото
    sendOrderAsPDF(orderData.name, orderData.phone, orderData.address, orderData.driverName, orderData.driverPhone, orderData.cart, orderData.total, orderData.currentTime)
      .then(() => console.log('PDF с фото отправлен успешно'))
      .catch(err => console.error('Ошибка отправки PDF с фото:', err));

  } catch (error) {
    console.error('Error submitting order:', error);
    Swal.fire('Ошибка', error && error.message ? error.message : 'Не удалось отправить заказ. Попробуйте позже.', 'error');

    // Если уперлись в лимит/429 — ставим кулдаун
    try {
      const msg = (error && error.message) ? String(error.message) : '';
      const code = (error && error.code) ? String(error.code) : '';
      const isQuota = code.includes('resource-exhausted') || msg.toLowerCase().includes('quota') || msg.includes('429') || msg.toLowerCase().includes('too many requests');
      if (isQuota) {
        const ms = 45 * 1000;
        localStorage.setItem('firestoreCooldownUntil', String(Date.now() + ms));
      }
    } catch (e) {}
    
    // Разблокируем кнопку при ошибке
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
    submitBtn.textContent = originalText;
  }
};
