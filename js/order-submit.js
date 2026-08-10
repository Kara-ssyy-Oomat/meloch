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

  // Ждём готовности Firebase Auth — все запросы (orders, products, settings,
  // clientAgents) должны уйти с auth-токеном, иначе строгие rules
  // (isAuthed) блокируют их permission-denied.
  if (typeof kerbenWaitForAuth === 'function') {
    try { await kerbenWaitForAuth(); } catch (e) {}
  }

  if (!name || !phone || !address || cart.length === 0) {
    Swal.fire('Ошибка', 'Заполните все поля и добавьте товары', 'warning');
    return;
  }

  // Проверка минимальной суммы заказа
  try {
    const minOrderDoc = await db.collection('settings').doc('minOrder').get();
    if (minOrderDoc.exists) {
      const moData = minOrderDoc.data();
      if (moData.enabled && moData.amount > 0) {
        const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
        if (cartTotal < moData.amount) {
          // Проверяем: есть ли у клиента заказ за сутки >= минимума
          let hasTodayBigOrder = false;
          try {
            const bypass = localStorage.getItem('minOrderBypass');
            if (bypass) {
              const bp = JSON.parse(bypass);
              if (bp.phone === phone && bp.until > Date.now()) hasTodayBigOrder = true;
            }
          } catch(e) {}
          // Если локального флага нет — проверяем через Firebase
          if (!hasTodayBigOrder && phone) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const snap = await db.collection('orders')
              .where('phone', '==', phone)
              .where('timestamp', '>=', todayStart.getTime())
              .limit(20).get();
            snap.forEach(doc => {
              const d = doc.data();
              if (!d.deleted && d.status !== 'cancelled' && (d.total || 0) >= moData.amount) {
                hasTodayBigOrder = true;
              }
            });
          }
          if (!hasTodayBigOrder) {
            Swal.fire({
              icon: 'warning',
              title: 'Минимальная сумма заказа',
              html: `Минимальная сумма заказа: <b>${moData.amount.toLocaleString()} сом</b>.<br>Сейчас в корзине: <b>${cartTotal.toLocaleString()} сом</b>.<br><br>Добавьте ещё товаров на <b>${(moData.amount - cartTotal).toLocaleString()} сом</b>.`,
              confirmButtonText: 'Понятно'
            });
            return;
          }
        }
      }
    }
  } catch(e) { console.error('Min order check error:', e); }

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
        // stock === 0 всегда означает «нет в наличии» (в т.ч. без warehouseStock).
        // Если склад работает (не на паузе) и остаток отслеживается — не даём
        // оформить заказ на распроданный/незаведённый товар.
        if (stock <= 0) {
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
    
    // let (не const) — эти значения могут быть пересчитаны после
    // финальной проверки остатков (см. блок «ФИНАЛЬНАЯ ПРОВЕРКА» ниже),
    // если часть товаров пришлось убрать или урезать по количеству.
    let items = cart.map(i => {
      const product = products.find(p => p.id === i.id);
      const unitLabel = (product && product.isPack) ? 'пачка' : 'шт';
      const packInfo = (product && product.isPack && product.packQty) ? ` (~${product.packQty} шт/пачка)` : '';
      const variantInfo = i.variant ? ` [${i.variant}]` : '';
      return `${i.title}${variantInfo}${packInfo} — ${i.qty} ${unitLabel} × ${i.price} сом = ${i.qty * i.price} сом`;
    }).join('\n');
    let total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const currentTime = new Date().toLocaleString();

    // Получаем партнера из URL (если есть) или из поля формы
    let partner = getCurrentPartner();
    if (!partner && referredBy) {
      partner = referredBy; // Если клиент сам указал партнера
    }

    // Проверяем, есть ли этот клиент в базе привязок к агентам —
    // ПАРАЛЛЕЛЬНО с fresh-check ниже (не блокируем). Таймаут 1.2с:
    // если clientAgents отвечает медленно, идём без partner (не критично,
    // админ назначит вручную).
    const partnerLookupP = (!partner && phone)
      ? Promise.race([
          db.collection('clientAgents').doc(phone).get().catch(() => null),
          new Promise(r => setTimeout(() => r(null), 1200))
        ]).then(doc => {
          if (doc && doc.exists) {
            const d = doc.data();
            if (d && d.agentName) {
              console.log('📌 Клиент привязан к агенту:', d.agentName);
              return d.agentName;
            }
          }
          return null;
        }).catch(() => null)
      : Promise.resolve(null);

    // Сохраняем партнера если клиент указал
    if (referredBy) {
      try {
        localStorage.setItem('savedReferredBy', referredBy);
      } catch(e) {}
    }

    // ══════════════════════════════════════════════════════════════════
    // ФИНАЛЬНАЯ ПРОВЕРКА ОСТАТКОВ ПРОТИВ БД (защита от гонок)
    //
    // Локальный кэш товаров может быть до 15-30 минут старым. Пока клиент
    // размышлял, кто-то другой мог уже купить последнюю штуку. Читаем
    // свежий stock только по товарам корзины (обычно 1-10 doc.get,
    // параллельно ~100-300 мс), сравниваем с нужным количеством:
    //   • товар исчез или stock=0 → УБИРАЕМ из корзины
    //   • нужно 5, а осталось 3 → УРЕЗАЕМ количество до 3
    //   • всё ок → пропускаем без изменений
    //
    // Если ВСЕ товары корзины оказались недоступны → заказ ВСЁ РАВНО
    // создаётся (по требованию заказчика), но с флагом `unfulfilledOrder`
    // и статусом `unfulfilled` — админ видит потерянную продажу, склад
    // не списывается. Клиенту показывается сообщение «менеджер свяжется».
    //
    // Пропускаем всю проверку если склад глобально на паузе (безлимит).
    // ══════════════════════════════════════════════════════════════════
    let orderAdjustments = [];     // строки для истории (админ увидит в заказе)
    let isUnfulfilledOrder = false; // весь заказ ушёл в никуда — только заявка
    // Снимок корзины ДО корректировки — если всё удалим, восстановим,
    // чтобы админ видел что именно клиент хотел заказать.
    const originalCartSnapshot = cart.map(i => ({ ...i }));

    if ((typeof warehousePaused === 'undefined' || !warehousePaused) && cart.length > 0) {
      submitBtn.textContent = '⏳ Отправка заказа...';
      try {
        // ЖЁСТКИЙ ТАЙМАУТ 3 сек: клиенту нельзя долго ждать перед
        // отправкой. Если проверка не успела — уезжаем как есть,
        // CF на сервере защитит склад через Math.min(available, need).
        const freshDocsP = Promise.all(
          cart.map(item => db.collection('products').doc(item.id).get())
        );
        // 1.5с (было 3с) — на медленной сети клиенты уходили не дождавшись
        // отправки. CF на сервере всё равно защитит склад Math.min(available, need).
        const freshTimeoutP = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('__FRESH_CHECK_TIMEOUT__')), 1500)
        );
        const freshDocs = await Promise.race([freshDocsP, freshTimeoutP]);
        const summaryLinesHtml = []; // для toast (с <strong>)
        const summaryLinesText = []; // для истории заказа (без HTML)
        const newCart = [];
        for (let i = 0; i < freshDocs.length; i++) {
          const cartItem = cart[i];
          const snap = freshDocs[i];
          if (!snap.exists) {
            summaryLinesHtml.push('🗑️ <strong>' + cartItem.title + '</strong> — товар удалён, убран из корзины');
            summaryLinesText.push('🗑️ ' + cartItem.title + ' — товар удалён из каталога');
            continue;
          }
          const p = snap.data();
          // Обновляем локальный кэш чтобы UI сразу отражал актуальные остатки
          const localP = products.find(x => x.id === cartItem.id);
          if (localP) {
            if (p.stock !== undefined) localP.stock = p.stock;
            if (p.warehouseStock !== undefined) localP.warehouseStock = p.warehouseStock;
          }
          // stock не число → безлимит, пропускаем
          if (typeof p.stock !== 'number' || !isFinite(p.stock)) {
            newCart.push(cartItem);
            continue;
          }
          // Все склады товара на паузе → считаем безлимитным
          const ws = p.warehouseStock;
          const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
          if (hasWarehouseSetup) {
            const allPaused = Object.keys(ws).every(whId =>
              (typeof pausedWarehouseIds !== 'undefined') && pausedWarehouseIds.has(whId)
            );
            if (allPaused) {
              newCart.push(cartItem);
              continue;
            }
          }
          const freshStock = Math.max(0, Math.floor(p.stock));
          const need = Math.max(0, Math.floor(cartItem.qty || 0));
          if (freshStock <= 0) {
            summaryLinesHtml.push('😔 <strong>' + cartItem.title + '</strong> — только что закончился, убран из корзины');
            summaryLinesText.push('😔 ' + cartItem.title + ' × ' + need + ' — распродано в момент оформления');
          } else if (freshStock < need) {
            summaryLinesHtml.push('⚠️ <strong>' + cartItem.title + '</strong> — было ' + need + ' → осталось только ' + freshStock);
            summaryLinesText.push('⚠️ ' + cartItem.title + ' — хотели ' + need + ', отгружено ' + freshStock);
            newCart.push({ ...cartItem, qty: freshStock });
          } else {
            newCart.push(cartItem);
          }
        }

        // Есть корректировки → фиксируем для админа + обновляем корзину
        if (summaryLinesHtml.length > 0) {
          orderAdjustments = summaryLinesText.slice();

          if (newCart.length === 0) {
            // ВЕСЬ заказ невыполним. НЕ блокируем — создаём как unfulfilled.
            // Восстанавливаем корзину чтобы админ видел что клиент хотел.
            isUnfulfilledOrder = true;
            cart.length = 0;
            cart.push(...originalCartSnapshot);
            // total/items не пересчитываем — они по-прежнему соответствуют
            // «хотелке» клиента (см. верх функции).
          } else {
            // Часть товаров можно отправить → работаем как раньше:
            // подрезаем корзину и показываем неблокирующий toast.
            cart.length = 0;
            cart.push(...newCart);
            if (typeof saveCart === 'function') try { saveCart(); } catch(e) {}
            if (typeof updateCart === 'function') try { updateCart(); } catch(e) {}
            if (typeof renderProducts === 'function') try { renderProducts(); } catch(e) {}

            // Пересчитываем total/items — они уйдут в orderRef.set / историю
            total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
            items = cart.map(i => {
              const product = products.find(p => p.id === i.id);
              const unitLabel = (product && product.isPack) ? 'пачка' : 'шт';
              const packInfo = (product && product.isPack && product.packQty) ? ` (~${product.packQty} шт/пачка)` : '';
              const variantInfo = i.variant ? ` [${i.variant}]` : '';
              return `${i.title}${variantInfo}${packInfo} — ${i.qty} ${unitLabel} × ${i.price} сом = ${i.qty * i.price} сом`;
            }).join('\n');

            Swal.fire({
              toast: true,
              position: 'top',
              icon: 'warning',
              title: 'Корзина обновлена',
              html: summaryLinesHtml.join('<br>') +
                '<div style="margin-top:6px; color:#2e7d32; font-weight:700;">Заказ на ' + total.toLocaleString() + ' сом</div>',
              timer: 8000,
              timerProgressBar: true,
              showConfirmButton: false,
              showCloseButton: true
            });
          }
        }
      } catch (freshErr) {
        // Ошибка сети / таймаут — не блокируем оформление.
        // Cloud Function на сервере сработает как последний барьер по стоку.
        if (freshErr && freshErr.message === '__FRESH_CHECK_TIMEOUT__') {
          console.warn('[Order] Проверка остатков >1.5с — пропускаем, отправляем как есть');
        } else {
          console.warn('[Order] Не удалось перепроверить остатки перед заказом:', freshErr);
        }
      }
    }

    // Заказ быстро. Склад списывает только Cloud Function (deductStockOnOrderCreate).
    // Клиент НЕ пишет остатки → нет двойного списания и нет «зависшего» фона.
    submitBtn.textContent = '⏳ Отправка...';

    const orderRef = db.collection('orders').doc();

    // Ждём Firebase Auth перед записью И одновременно дожидаемся
    // поиска партнёра (partnerLookupP запущен выше параллельно).
    // 500мс auth hard-таймаут — раньше было 1.5с, но Firestore
    // offline-persistence запишет заказ в IndexedDB даже без auth,
    // а SDK сам добьёт auth-токен при синхронизации.
    const authWaitP = (typeof kerbenWaitForAuth === 'function')
      ? kerbenWaitForAuth(500).catch(() => {})
      : Promise.resolve();
    const [ , partnerFromLookup ] = await Promise.all([authWaitP, partnerLookupP]);
    if (!partner && partnerFromLookup) partner = partnerFromLookup;

    const orderPayload = {
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
      status: isUnfulfilledOrder ? 'unfulfilled' : 'pending',
      partner: partner || null,
      referredBy: referredBy || null,
      stockDeducted: false,
      // stockDeductionStatus ВСЕГДА 'pending' — так требуют правила Firestore
      // (клиент не может подделать статус списания). Для unfulfilled-заказов
      // Cloud Function проверяет data.status и пропускает списание, ставя
      // stockDeductionStatus='skipped_unfulfilled' сама.
      stockDeductionStatus: 'pending',
      warehouseDeductions: null,
      // Информация для админа: что было скорректировано / что клиент хотел
      orderAdjustments: orderAdjustments.length > 0 ? orderAdjustments : null,
      unfulfilledOrder: isUnfulfilledOrder || null,
      unfulfilledReason: isUnfulfilledOrder ? 'stock_out_at_checkout' : null
    };

    // ВАЖНО: Firestore SDK имеет offline-persistence — set() мгновенно
    // пишет в локальный IndexedDB и ставит в очередь синхронизации.
    // Даже если промис не резолвится за 8с (слабый сигнал), заказ уже
    // гарантированно сохранён локально и уйдёт когда появится связь —
    // даже если клиент закроет вкладку.

    // ДОП. ЗАЩИТА: копия в localStorage на случай если Firestore
    // persistence не работает (incognito и т.п.). При след. открытии
    // сайта js/pending-orders.js досошлёт заказ.
    if (typeof savePendingOrderBackup === 'function') {
      try { savePendingOrderBackup(orderRef.id, orderPayload); } catch (e) {}
    }

    // ГАРАНТИЯ ДОСТАВКИ + SERVER-CONFIRMED УДАЛЕНИЕ BACKUP.
    // См. подробный комментарий в cart.html (line ~1554).
    // Кратко: orderRef.set().then() НЕ является server-confirmation
    // (Firestore SDK offline persistence резолвит его на локальном IDB
    // write, даже если сервер потом откажет из-за auth 403). Единственное
    // надёжное подтверждение — orderNotify HTTP endpoint возвращает
    // firestoreOk===true (запись через admin SDK).
    // ═══════════════════════════════════════════════════════════
    //   v4.26: orderNotify — ГЛАВНЫЙ канал доставки заказа.
    // ═══════════════════════════════════════════════════════════
    // См. подробный комментарий в cart.html.
    //   • orderNotify — HTTPS POST → admin SDK. Server-confirmed.
    //   • orderRef.set() — параллельно, как fallback (offline UX).
    //   • Race с таймаутом 5с — оптимистичный показ «Принят».
    let notifyFirestoreOk = false;
    const orderNotifyPromise = (typeof sendOrderTextToTelegram === 'function')
      ? sendOrderTextToTelegram(orderPayload, orderRef.id)
          .then(function (res) {
            res = res || {};
            if (res.firestoreOk === true) {
              notifyFirestoreOk = true;
              if (typeof removePendingOrderBackup === 'function') {
                try { removePendingOrderBackup(orderRef.id); } catch (e) {}
              }
            } else {
              console.warn('[OrderSubmit] orderNotify без server-confirm — backup оставляем для retry', res);
            }
            return res;
          })
          .catch(function (e) {
            console.warn('[OrderSubmit] orderNotify упал:', e && e.message);
            return null;
          })
      : Promise.resolve(null);

    const orderCommitPromise = orderRef.set(orderPayload);
    orderCommitPromise.catch(() => {}); // тихо (fallback канал)

    // Ждём первый успех: orderNotify.firestoreOk=true / .set() резолв / 5 сек.
    const uiConfirmPromise = new Promise(function (resolve) {
      let resolved = false;
      const finish = function (reason) {
        if (resolved) return;
        resolved = true;
        resolve(reason);
      };
      orderNotifyPromise.then(function (r) {
        if (r && r.firestoreOk === true) finish('notify');
      }, function () {});
      orderCommitPromise.then(function () { finish('set'); }, function () {});
      setTimeout(function () { finish('timeout'); }, 5000);
    });
    let _timedOut = false;
    const confirmReason = await uiConfirmPromise;
    console.log('[Order] UI confirmed by "' + confirmReason + '" (notifyOk=' + notifyFirestoreOk + '):', orderRef.id);
    if (confirmReason === 'timeout') {
      _timedOut = true;
      console.warn('[Order] Сеть медленная — доотправляем в фоне');
      orderCommitPromise
        .then(() => console.log('[Order] Заказ дописан в фоне:', orderRef.id))
        .catch(e => console.error('[Order] Заказ не сохранился:', e && e.message));
    }

    // Показываем клиенту итог — разный текст для успеха и unfulfilled
    if (isUnfulfilledOrder) {
      Swal.fire({
        icon: 'warning',
        title: 'Ваш запрос зарегистрирован',
        html: '<div style="text-align:left; margin-top:6px;">' +
          '<div style="color:#c62828; font-weight:600; margin-bottom:8px;">К сожалению, все товары были распроданы прямо в момент оформления:</div>' +
          '<div style="font-size:13px; color:#555; line-height:1.6;">' + orderAdjustments.join('<br>') + '</div>' +
          '<div style="background:#e3f2fd; border-left:3px solid #1976d2; padding:10px; margin-top:12px; border-radius:4px; font-size:13px; color:#1565c0;">📞 Наш менеджер свяжется с вами по указанному номеру и подскажет альтернативы или сроки поставки.</div>' +
          '</div>',
        confirmButtonText: 'Понятно',
        confirmButtonColor: '#28a745'
      });
    } else {
      Swal.fire({
        icon: 'success',
        title: 'Заказ принят! ✅',
        text: 'Ваш заказ успешно отправлен.',
        timer: 2500,
        showConfirmButton: false
      });
    }

    // Автоматическая регистрация/вход после первого заказа
    if (typeof autoRegisterAfterOrder === 'function') {
      autoRegisterAfterOrder(name, phone, address).catch(e => console.error('autoRegister error:', e));
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
    
    // Если заказ >= минимума, сохраняем флаг обхода на сутки
    try {
      if (typeof minOrderAmount !== 'undefined' && minOrderEnabled && total >= minOrderAmount) {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        localStorage.setItem('minOrderBypass', JSON.stringify({
          phone: phone,
          until: endOfDay.getTime()
        }));
      }
    } catch(e) {}
    
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

    // Оптимистично минусуем остатки в локальном UI (Firestore спишет Cloud Function)
    try {
      for (const orderedItem of orderData.cart) {
        const p = products.find(x => x.id === orderedItem.id);
        if (!p) continue;
        if (typeof p.stock !== 'number' || !isFinite(p.stock)) continue;
        if (typeof getEffectiveStock === 'function' && getEffectiveStock(p) === null) continue;
        const need = Math.max(0, Math.floor(orderedItem.qty || 0));
        const nextStock = Math.max(0, Math.floor(p.stock) - need);
        p.stock = nextStock;
        if (p.warehouseStock && typeof p.warehouseStock === 'object') {
          let rem = need;
          const entries = Object.entries(p.warehouseStock)
            .filter(([, q]) => q > 0)
            .sort((a, b) => b[1] - a[1]);
          for (const [whId, whQty] of entries) {
            if (rem <= 0) break;
            const d = Math.min(rem, whQty);
            p.warehouseStock[whId] = whQty - d;
            rem -= d;
          }
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
    
    // Отправка файлов в Telegram: ТОЛЬКО PDF с фото (большие фото товаров).
    // В ФОНЕ — клиент уже видит "Заказ принят", не блокируем UI.
    if (typeof sendOrderAsPDF === 'function') {
      sendOrderAsPDF(
        orderData.name, orderData.phone, orderData.address,
        orderData.driverName, orderData.driverPhone,
        orderData.cart, orderData.total, orderData.currentTime
      )
        .then(() => console.log('PDF с фото отправлен'))
        .catch(err => console.error('Ошибка отправки PDF с фото:', err));
    }

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
  } finally {
    // ВСЕГДА разблокируем кнопку — при успехе, ошибке и любых
    // неожиданных исключениях. Раньше разблокировка была только в
    // catch — если что-то падало посередине после успешной записи
    // заказа, кнопка «⏳ Проверка остатков…» оставалась вечно.
    try {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
      submitBtn.textContent = originalText;
    } catch (e) {}
  }
};
