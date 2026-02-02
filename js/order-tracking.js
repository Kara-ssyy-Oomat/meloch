// ===== СИСТЕМА ОТСЛЕЖИВАНИЯ ЗАКАЗА ДЛЯ КЛИЕНТА =====

function openTrackOrderModal() {
  document.getElementById('trackOrderModal').style.display = 'flex';
  lockPageScroll();
  
  // Автозаполнение номера телефона если есть
  const savedPhone = localStorage.getItem('lastOrderPhone') || document.getElementById('phone')?.value || '';
  document.getElementById('trackPhoneInput').value = savedPhone;
  
  if (savedPhone) {
    searchMyOrders();
  }
}

function closeTrackOrderModal() {
  document.getElementById('trackOrderModal').style.display = 'none';
  unlockPageScroll();
}

async function searchMyOrders() {
  const phone = document.getElementById('trackPhoneInput').value.trim();
  const listDiv = document.getElementById('trackOrdersList');
  
  if (!phone || phone.length < 5) {
    listDiv.innerHTML = `
      <div style="text-align:center; color:#dc3545; padding:30px;">
        <div style="font-size:36px; margin-bottom:10px;">⚠️</div>
        <div>Введите номер телефона (минимум 5 цифр)</div>
      </div>
    `;
    return;
  }
  
  listDiv.innerHTML = `
    <div style="text-align:center; padding:40px;">
      <div style="font-size:36px; margin-bottom:10px;">🔄</div>
      <div>Поиск заказов...</div>
    </div>
  `;
  
  try {
    // Сохраняем телефон для следующего раза
    localStorage.setItem('lastOrderPhone', phone);
    
    // Ищем заказы по телефону
    const ordersSnapshot = await db.collection('orders')
      .orderBy('timestamp', 'desc')
      .get();
    
    const myOrders = [];
    ordersSnapshot.forEach(doc => {
      const order = { id: doc.id, ...doc.data() };
      // Проверяем совпадение телефона (убираем лишние символы)
      const orderPhone = (order.phone || '').replace(/\D/g, '');
      const searchPhone = phone.replace(/\D/g, '');
      if (orderPhone.includes(searchPhone) || searchPhone.includes(orderPhone)) {
        myOrders.push(order);
      }
    });
    
    if (myOrders.length === 0) {
      listDiv.innerHTML = `
        <div style="text-align:center; color:#666; padding:40px;">
          <div style="font-size:48px; margin-bottom:15px;">📭</div>
          <div style="font-size:16px; font-weight:600; margin-bottom:8px;">Заказы не найдены</div>
          <div style="font-size:14px; color:#999;">Проверьте правильность номера телефона</div>
        </div>
      `;
      return;
    }
    
    // Отображаем заказы
    listDiv.innerHTML = myOrders.map((order, idx) => {
      const date = new Date(order.timestamp);
      const dateStr = date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
      
      const statusColors = {
        pending: { bg: '#fff3cd', color: '#856404', text: '⏳ В обработке', icon: '⏳' },
        preparing: { bg: '#e3f2fd', color: '#1565c0', text: '📦 Готовится', icon: '📦' },
        logistics: { bg: '#fff8e1', color: '#f57c00', text: '🚚 На логистике', icon: '🚚' },
        driver: { bg: '#e8f5e9', color: '#2e7d32', text: '🚗 У водителя', icon: '🚗' },
        completed: { bg: '#d4edda', color: '#155724', text: '✅ Доставлен', icon: '✅' },
        cancelled: { bg: '#f8d7da', color: '#721c24', text: '❌ Отменен', icon: '❌' }
      };
      
      const status = order.status || 'pending';
      const statusInfo = statusColors[status] || statusColors.pending;
      
      const items = order.items || [];
      const totalItems = items.reduce((sum, i) => sum + i.qty, 0);
      
      // Фото заказа
      const photos = order.photos || [];
      const photosHtml = photos.length > 0 ? `
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e0e0e0;">
          <div style="font-size:13px; font-weight:600; color:#555; margin-bottom:8px;">📷 Фото вашего заказа:</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${photos.map(p => `
              <img src="${p.url}" onclick="closeTrackOrderModal(); showPreview('${p.url.replace(/'/g, "\\'")}')" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; border:2px solid #17a2b8;">
            `).join('')}
          </div>
        </div>
      ` : '';
      
      // Прогресс-бар
      const statusOrder = ['pending', 'preparing', 'logistics', 'driver', 'completed'];
      const currentStep = statusOrder.indexOf(status);
      const progressHtml = status !== 'cancelled' ? `
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e0e0e0;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            ${statusOrder.map((s, i) => `
              <div style="flex:1; text-align:center; position:relative;">
                <div style="width:24px; height:24px; border-radius:50%; margin:0 auto; background:${i <= currentStep ? '#17a2b8' : '#e0e0e0'}; color:white; display:flex; align-items:center; justify-content:center; font-size:12px;">
                  ${i < currentStep ? '✓' : (i === currentStep ? statusColors[s].icon : (i + 1))}
                </div>
                <div style="font-size:9px; margin-top:4px; color:${i <= currentStep ? '#17a2b8' : '#999'};">${statusColors[s].text.replace(/[^\u0400-\u04FF\s]/g, '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';
      
      return `
        <div style="background:#fff; border:2px solid ${statusInfo.color}; border-radius:12px; padding:15px; margin-bottom:15px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <div style="font-weight:700; color:#333; font-size:16px;">🛒 Заказ #${myOrders.length - idx}</div>
              <div style="font-size:13px; color:#666; margin-top:4px;">📅 ${dateStr}</div>
              <div style="font-size:13px; color:#666;">📍 ${order.address || 'Адрес не указан'}</div>
              ${order.driverName ? `<div style="font-size:13px; color:#666;">🚗 Водитель: ${order.driverName}</div>` : ''}
            </div>
            <div style="background:${statusInfo.bg}; color:${statusInfo.color}; padding:8px 14px; border-radius:8px; font-weight:600; font-size:14px; white-space:nowrap;">
              ${statusInfo.text}
            </div>
          </div>
          
          <div style="background:#f8f9fa; border-radius:8px; padding:10px; margin-bottom:10px;">
            <div style="font-weight:600; color:#555; margin-bottom:8px;">Товары (${totalItems} шт):</div>
            ${items.slice(0, 5).map(item => `
              <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px;">
                <span>${item.title}</span>
                <span style="color:#007bff; font-weight:600;">${item.qty} шт × ${item.price} сом</span>
              </div>
            `).join('')}
            ${items.length > 5 ? `<div style="color:#666; font-size:12px; margin-top:5px;">... и ещё ${items.length - 5} товар(ов)</div>` : ''}
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #e0e0e0;">
            <span style="font-weight:600; color:#555;">Итого:</span>
            <span style="font-weight:700; font-size:18px; color:#e53935;">${order.total || 0} сом</span>
          </div>
          
          ${progressHtml}
          ${photosHtml}
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Ошибка поиска заказов:', error);
    listDiv.innerHTML = `
      <div style="text-align:center; color:#dc3545; padding:40px;">
        <div style="font-size:48px; margin-bottom:15px;">⚠️</div>
        <div>Ошибка при загрузке заказов</div>
        <div style="font-size:12px; color:#999; margin-top:5px;">${error.message}</div>
      </div>
    `;
  }
}

// ===== КОНЕЦ СИСТЕМЫ ОТСЛЕЖИВАНИЯ =====
