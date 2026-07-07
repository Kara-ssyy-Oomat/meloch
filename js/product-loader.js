// ===================================================================
// КЕРБЕН B2B Market — Product Loader (загрузка, кэш, upload)
// ===================================================================

// ОПТИМИЗАЦИЯ COSTS: Кэш для товаров.
// Старые значения (RAM 2 мин, LS 10 мин) приводили к МАССОВЫМ повторным
// чтениям всех 5000 товаров каждые 10 минут у каждого посетителя —
// главная причина 48M Read Ops в сутки.
// Теперь RAM-кэш 30 минут, localStorage 1 час, и пока кэш моложе
// `FRESH_DURATION` (15 минут) — мы вообще НЕ дергаем Firestore в фоне.
let productsCache = [];
let productsCacheTime = 0;
const CACHE_DURATION = 1800000;      // 30 минут — пока в RAM, второй раз не читаем
const LS_CACHE_DURATION = 3600000;   // 60 минут — мгновенный показ из localStorage
const FRESH_DURATION = 900000;       // 15 минут — пока кэш свежий, в Firestore не лезем вообще
// ВАЖНО: используем ОРИГИНАЛЬНЫЕ ключи кэша.
// Раньше был v2-bump, но из-за этого после обновления кода у пользователей
// кэш становился «пустым», и если Firebase в этот момент возвращал
// permission-denied (auth не успел подняться) — на сайте вообще ничего
// не показывалось. Стабильная сортировка _stableProductOrderCompare
// применяется при ЧТЕНИИ из кэша, поэтому старый «кривой» порядок
// автоматически чинится при загрузке — bump-key не нужен.
const LS_PRODUCTS_KEY = 'cachedProducts';
const LS_PRODUCTS_TIME_KEY = 'cachedProductsTime';

// МИГРАЦИЯ из v2-ключей обратно (для тех, кто получил v2-версию кода).
// Если v2-ключи есть, а оригинальных нет — переносим v2 → оригинал.
// Если оба есть — выбираем самый свежий по timestamp.
try {
  var _v2Raw = localStorage.getItem('cachedProducts_v2');
  var _v2Time = parseInt(localStorage.getItem('cachedProductsTime_v2') || '0');
  if (_v2Raw && _v2Raw.length > 2) {
    var _origTime = parseInt(localStorage.getItem('cachedProductsTime') || '0');
    if (_v2Time >= _origTime) {
      localStorage.setItem('cachedProducts', _v2Raw);
      localStorage.setItem('cachedProductsTime', String(_v2Time));
      console.log('[Products] миграция кэша v2 → original (', _v2Raw.length, 'байт)');
    }
  }
  localStorage.removeItem('cachedProducts_v2');
  localStorage.removeItem('cachedProductsTime_v2');
} catch (e) {}

// Флаг: склады приостановлены (все товары без лимита)
let warehousePaused = false;
const LS_WH_PAUSED_KEY = 'warehousePaused';

// Индивидуально приостановленные склады
let pausedWarehouseIds = new Set();
const LS_PAUSED_WH_IDS_KEY = 'pausedWarehouseIds';

// ID главного склада (для отображения остатков на карточках)
let primaryWarehouseId = '';

// Минимальная сумма заказа
let minOrderAmount = 0;
let minOrderEnabled = false;
const LS_MIN_ORDER_KEY = 'minOrderSettings';

// Загрузка флага паузы складов (кэшируется в localStorage для мгновенного чтения)
function loadWarehousePausedFromLS() {
  try { warehousePaused = localStorage.getItem(LS_WH_PAUSED_KEY) === '1'; } catch(e) {}
  try {
    const raw = localStorage.getItem(LS_PAUSED_WH_IDS_KEY);
    pausedWarehouseIds = raw ? new Set(JSON.parse(raw)) : new Set();
  } catch(e) { pausedWarehouseIds = new Set(); }
  try {
    const cached = JSON.parse(localStorage.getItem(LS_MIN_ORDER_KEY) || '{}');
    minOrderAmount = cached.amount || 0;
    minOrderEnabled = cached.enabled === true;
  } catch(e) {}
}
async function loadWarehousePausedFlag() {
  try {
    const doc = await db.collection('settings').doc('warehouse').get();
    warehousePaused = doc.exists && doc.data().paused === true;
    if (doc.exists && doc.data().primaryWarehouseId) {
      primaryWarehouseId = doc.data().primaryWarehouseId;
    }
    try { localStorage.setItem(LS_WH_PAUSED_KEY, warehousePaused ? '1' : '0'); } catch(e) {}
  } catch(e) { /* при ошибке сети оставляем значение из localStorage */ }
  // Загружаем индивидуально приостановленные склады
  try {
    const whSnap = await db.collection('warehouses').where('paused', '==', true).get();
    pausedWarehouseIds = new Set();
    whSnap.forEach(d => pausedWarehouseIds.add(d.id));
    try { localStorage.setItem(LS_PAUSED_WH_IDS_KEY, JSON.stringify([...pausedWarehouseIds])); } catch(e) {}
  } catch(e) { pausedWarehouseIds = new Set(); }
  // Загружаем минимальную сумму заказа
  try {
    const moDoc = await db.collection('settings').doc('minOrder').get();
    if (moDoc.exists) {
      const moData = moDoc.data();
      minOrderAmount = moData.amount || 0;
      minOrderEnabled = moData.enabled === true;
      console.log('[MinOrder] Загружено из Firebase:', { amount: minOrderAmount, enabled: minOrderEnabled });
    } else {
      minOrderAmount = 0;
      minOrderEnabled = false;
      console.log('[MinOrder] Документ не найден в Firebase — ограничение выключено');
    }
    try { localStorage.setItem(LS_MIN_ORDER_KEY, JSON.stringify({ amount: minOrderAmount, enabled: minOrderEnabled })); } catch(e) {}
  } catch(e) {
    // При ошибке сети — загружаем из localStorage
    try {
      const cached = JSON.parse(localStorage.getItem(LS_MIN_ORDER_KEY) || '{}');
      minOrderAmount = cached.amount || 0;
      minOrderEnabled = cached.enabled === true;
    } catch(e2) {}
  }
}

// Стабильная функция сравнения товаров по позиции.
// Гарантирует, что один и тот же набор товаров ВСЕГДА получит одну и ту же
// последовательность независимо от:
//  - наличия/отсутствия поля order у отдельных товаров,
//  - совпадения значений order у нескольких товаров,
//  - локали браузера/устройства (Safari/Chrome/iOS/Android).
function _stableProductOrderCompare(a, b) {
  // 1) Основной ключ — числовой order. Отсутствует/не число → в самый конец.
  var ao = (typeof a.order === 'number' && isFinite(a.order))
    ? a.order : Number.MAX_SAFE_INTEGER;
  var bo = (typeof b.order === 'number' && isFinite(b.order))
    ? b.order : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  // 2) При совпадении order — стабильный тай-брейк по времени создания.
  var ac = (typeof a.createdAt === 'number') ? a.createdAt : 0;
  var bc = (typeof b.createdAt === 'number') ? b.createdAt : 0;
  if (ac !== bc) return ac - bc;
  // 3) Финальный тай-брейк по id — никогда не равны → порядок строго детерминированный.
  var aid = a.id || '';
  var bid = b.id || '';
  if (aid < bid) return -1;
  if (aid > bid) return 1;
  return 0;
}

// Эффективный остаток товара (исключая приостановленные склады)
// Возвращает null если остаток не отслеживается (безлимит), число если отслеживается
function getEffectiveStock(product) {
  if (!product) return null;
  if (warehousePaused) return null;
  if (typeof product.stock !== 'number' || !isFinite(product.stock)) return null;

  const ws = product.warehouseStock;
  const hasWarehouseSetup = ws && typeof ws === 'object' && Object.keys(ws).length > 0;

  // Если stock <= 0 и склад не настроен (нет warehouseStock или пустой {}) —
  // значит складской учёт фактически не ведётся → безлимит.
  // Это покрывает случай после сброса остатков и возобновления работы склада.
  if (product.stock <= 0 && !hasWarehouseSetup) return null;

  // Если нет приостановленных складов — обычный остаток
  if (pausedWarehouseIds.size === 0) return Math.max(0, Math.floor(product.stock));

  // Если есть разбивка по складам — проверяем
  if (hasWarehouseSetup) {
    for (const whId of Object.keys(ws)) {
      if (pausedWarehouseIds.has(whId)) return null;
    }
    return Math.max(0, Math.floor(product.stock));
  }
  // Нет разбивки по складам — возвращаем общий остаток
  return Math.max(0, Math.floor(product.stock));
}

// Скрытие splash-экрана (вызывается при первом показе товаров)
function hideSplashScreen() {
  var splash = document.getElementById('splashScreen');
  if (splash && !splash.classList.contains('splash-hide')) {
    splash.classList.add('splash-hide');
    // Восстанавливаем белый фон и theme-color после splash
    document.documentElement.style.background = '#fff';
    document.body.style.background = '#fff';
    var tc = document.querySelector('meta[name=\"theme-color\"]');
    if (tc) tc.setAttribute('content', '#4CAF50');
    setTimeout(function() { splash.remove(); }, 350);
  }
}

// Загрузка товаров с мгновенным отображением из localStorage
async function loadProducts() {
  try {
    // Сразу читаем флаг паузы из localStorage (мгновенно)
    loadWarehousePausedFromLS();

    // Ждём готовности Firebase Auth (анонимный логин). Без этого первый
    // запрос к Firestore может уйти ДО появления request.auth, и правила
    // вида `read: if isAuthed()` развернут его permission-denied. Auth уже
    // запущен в auth.js при загрузке скрипта, обычно ждём <200мс.
    if (typeof kerbenWaitForAuth === 'function') {
      try { await kerbenWaitForAuth(); } catch (e) {}
    }

    // 1) Проверяем in-memory кэш (самый быстрый)
    const now = Date.now();
    if (productsCache.length > 0 && (now - productsCacheTime) < CACHE_DURATION) {
      console.log('📦 Загрузка из RAM-кэша');
      // Применяем стабильную сортировку и здесь — на случай если RAM-кэш
      // был наполнен старой версией кода с нестабильной сортировкой.
      products = productsCache.slice().sort(_stableProductOrderCompare);
      productsReady = true;
      renderProducts();
      hideSplashScreen();
      // Обновляем флаг с сервера в фоне и перерисовываем если изменился
      const pausedBefore = warehousePaused;
      const pausedIdsBefore = new Set(pausedWarehouseIds);
      const minOrderBefore = minOrderEnabled;
      const minOrderAmountBefore = minOrderAmount;
      loadWarehousePausedFlag().then(() => {
        if (pausedBefore !== warehousePaused ||
            pausedIdsBefore.size !== pausedWarehouseIds.size ||
            [...pausedWarehouseIds].some(id => !pausedIdsBefore.has(id))) {
          renderProducts();
        }
        // Обновляем корзину если настройки минимальной суммы изменились
        if (minOrderBefore !== minOrderEnabled || minOrderAmountBefore !== minOrderAmount) {
          if (typeof updateCart === 'function') updateCart();
        }
      });
      return;
    }
    
    // 2) Показываем товары из localStorage мгновенно (пока грузим с сервера)
    // ВАЖНО: показываем кэш ЛЮБОГО возраста, лучше старые товары чем
    // пустой экран. Если кэш старее LS_CACHE_DURATION — всё равно
    // покажем, но дальше пойдём в Firestore за свежими данными.
    let showedFromCache = false;
    let lsAgeMs = Infinity;
    try {
      const lsTime = parseInt(localStorage.getItem(LS_PRODUCTS_TIME_KEY) || '0');
      lsAgeMs = now - lsTime;
      const lsProducts = JSON.parse(localStorage.getItem(LS_PRODUCTS_KEY) || '[]');
      if (Array.isArray(lsProducts) && lsProducts.length > 0) {
        lsProducts.sort(_stableProductOrderCompare);
        products = lsProducts;
        productsReady = true;
        renderProducts();
        showedFromCache = true;
        hideSplashScreen();
        productsCache = lsProducts;
        productsCacheTime = now - Math.min(lsAgeMs, CACHE_DURATION);
        console.log('📦 Мгновенная загрузка из localStorage:', lsProducts.length, 'товаров (возраст: ' + Math.round(lsAgeMs/60000) + ' мин)');
      }
    } catch(e) { /* localStorage может быть недоступен */ }

    // ОПТИМИЗАЦИЯ COSTS: если кэш моложе FRESH_DURATION — ВООБЩЕ не дергаем
    // Firestore. Раньше каждый визит дотягивал 5000 товаров «для свежести»,
    // даже если localStorage был совсем недавним. Это съедало ~80% всех
    // Read Ops. Теперь свежий кэш = ноль чтений на визит.
    if (showedFromCache && lsAgeMs < FRESH_DURATION) {
      // Только проверим флаг паузы складов и настройки минимального заказа
      // (это дешёво — 1-3 doc reads, и нужно для корректного UI).
      loadWarehousePausedFlag().then(() => {
        if (typeof updateCart === 'function') updateCart();
      });
      // Догружаем категории продавцов, если ещё не кэшированы
      try { if (typeof sellerCategoriesLoaded !== 'undefined' && !sellerCategoriesLoaded) loadSellerCategoriesCache(); } catch(e) {}
      return;
    }

    // 3) Загружаем свежие данные с Firebase (в фоне если кэш показан)
    console.log('Loading products from Firebase... (возраст кэша: ' + Math.round(lsAgeMs/60000) + ' мин)');
    if (!showedFromCache) productsReady = false;
    
    // Грузим флаг паузы складов параллельно с товарами
    const pausePromise = loadWarehousePausedFlag();
    
    // ОПТИМИЗАЦИЯ COSTS: жёсткий лимит 5000 товаров для защиты от
    // «убежавшего» расхода. Магазин с >5000 SKU — редкость; при
    // необходимости поднять лимит здесь.
    //
    // ВАЖНО: НЕ используем .orderBy('order') в запросе Firestore.
    // Причины:
    //  1) Firestore с orderBy('order') ПРОПУСКАЕТ документы у которых нет
    //     этого поля (например, товары, добавленные продавцами без order).
    //     Из-за этого часть товаров "исчезала" при загрузке.
    //  2) Сортировку всё равно делаем на клиенте (см. ниже) — там она более
    //     надёжная и стабильная.
    //
    // Защита от race-condition с Firebase Auth: правила products требуют
    // request.auth != null. Если первый запрос ушёл раньше, чем поднялась
    // анонимная/админ сессия — Firestore вернёт permission-denied. В этом
    // случае РЕАЛЬНО ждём появления firebase.auth().currentUser (а не
    // просто фиксированное время) и повторяем запрос до 4 попыток.
    async function _waitForFirebaseUser(maxWaitMs) {
      var deadline = Date.now() + (maxWaitMs || 6000);
      while (Date.now() < deadline) {
        try {
          if (typeof firebase !== 'undefined' && firebase.auth
              && firebase.auth().currentUser) {
            return firebase.auth().currentUser;
          }
        } catch (_) {}
        // Пробуем дёрнуть kerbenWaitForAuth/kerbenEnsureSignedIn,
        // если они есть — это запустит signInAnonymously если ещё не запущен.
        try {
          if (typeof kerbenEnsureSignedIn === 'function') kerbenEnsureSignedIn();
        } catch (_) {}
        await new Promise(function (r) { setTimeout(r, 200); });
      }
      return null;
    }

    let snapshot;
    let _attempt = 0;
    const MAX_ATTEMPTS = 4;
    while (true) {
      try {
        // Перед запросом проверяем что auth user есть. Если нет — ждём.
        try {
          if (typeof firebase !== 'undefined' && firebase.auth
              && !firebase.auth().currentUser) {
            await _waitForFirebaseUser(6000);
          }
        } catch (_) {}
        snapshot = await db.collection('products').limit(5000).get();
        break; // успех
      } catch (e) {
        _attempt++;
        const code = e && e.code ? e.code : '';
        const msg = e && e.message ? e.message : '';
        const isPerm = code === 'permission-denied'
                    || /permission|insufficient/i.test(msg);
        if (isPerm && _attempt < MAX_ATTEMPTS) {
          var fbUser = null;
          try { fbUser = firebase.auth().currentUser; } catch (_) {}
          console.warn('[Products] permission-denied, попытка', _attempt,
            '— firebase user:', fbUser ? (fbUser.isAnonymous ? 'anon ' + fbUser.uid.substring(0,6) : fbUser.email) : 'NULL',
            '— жду auth и пробую ещё раз');
          // Реально ждём появления firebase user (до 6 сек)
          await _waitForFirebaseUser(6000);
          // Плюс маленький буфер для прокидки токена в SDK
          await new Promise(r => setTimeout(r, 300 + 300 * _attempt));
          continue;
        }
        // Не permission или попытки кончились — пробрасываем дальше
        throw e;
      }
    }
    products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      products.push({ id: doc.id, ...data });
    });
    
    const withPhoto = products.filter(p => p.image).length;
    console.log(`📦 Загружено ${products.length} товаров, с фото: ${withPhoto}`);
    
    // СТАБИЛЬНАЯ СОРТИРОВКА (один и тот же порядок при каждой загрузке).
    // Раньше тут была проблема: если хоть один товар без `order` —
    // ВЕСЬ список перестраивался по названию, и порядок «прыгал».
    // Теперь:
    //  - сортируем по `order` (товары без него уходят в конец)
    //  - при равных `order` — по времени создания (новый позже)
    //  - при равных времени — по id (всегда стабильный финальный тай-брейк)
    products.sort(_stableProductOrderCompare);
    
    // Сохраняем в оба кэша
    productsCache = [...products];
    productsCacheTime = Date.now();
    
    // Сохраняем в localStorage (без тяжёлых полей для экономии места)
    try {
      const lightProducts = products.map(p => ({
        id: p.id, title: p.title, price: p.price, image: p.image,
        category: p.category, stock: p.stock, order: p.order,
        optPrice: p.optPrice, optQty: p.optQty, oldPrice: p.oldPrice,
        isPack: p.isPack, packQty: p.packQty, showPackInfo: p.showPackInfo,
        blocked: p.blocked, minQty: p.minQty, sellerId: p.sellerId,
        createdAt: p.createdAt, description: p.description,
        extraImages: p.extraImages, useQtyButtons: p.useQtyButtons,
        unitsPerBox: p.unitsPerBox, showPricePerUnit: p.showPricePerUnit,
        warehouseStock: p.warehouseStock || null,
        // Админ-поля: без них при рендере из localStorage-кэша админ видел
        // карточки без цены закупки, веса и пр. Раньше эта проблема пряталась
        // тем, что кэш быстро протухал и каждый визит лез в Firestore — но
        // это сжигало миллионы reads. Теперь кэш живёт 15 минут «свежим»,
        // поэтому админ-поля обязаны переживать localStorage-сериализацию.
        costPrice: p.costPrice,
        packsPerBox: p.packsPerBox,
        roundQty: p.roundQty,
        sellerName: p.sellerName,
        weight: p.weight,
        variants: p.variants,
        subcategory: p.subcategory,
        priceWholesale: p.priceWholesale
      }));
      localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(lightProducts));
      localStorage.setItem(LS_PRODUCTS_TIME_KEY, String(Date.now()));
    } catch(e) { /* если превышен лимит localStorage — не критично */ }
    
    productsReady = true;
    
    // Запоминаем старое значение флага (из localStorage) перед обновлением с Firebase
    const pausedBeforeFirebase = warehousePaused;
    // Дождёмся загрузки флага паузы перед финальным рендером
    await pausePromise;
    
    // Перерисовываем — данные или флаг паузы могли измениться
    if (showedFromCache) {
      const oldCount = (productsCache.length || 0);
      if (oldCount !== products.length || pausedBeforeFirebase !== warehousePaused) {
        renderProducts();
      }
    } else {
      renderProducts();
    }
    
    // Обновляем корзину после загрузки настроек (минимальная сумма заказа)
    if (typeof updateCart === 'function') updateCart();
    
    // Скрываем splash если ещё не скрыт (для случая без кэша)
    hideSplashScreen();
    
    // Загружаем кэш категорий продавцов
    await loadSellerCategoriesCache();
  } catch (error) {
    console.error('Error loading products:', error);
    const code = error && error.code ? error.code : '';
    const msg = error && error.message ? error.message : '';
    const isPerm = code === 'permission-denied'
                || /permission|insufficient/i.test(msg);

    // ВСЕГДА скрываем splash, чтобы пользователь видел хоть что-то.
    hideSplashScreen();

    // ГРАЦИОЗНАЯ ДЕГРАДАЦИЯ при permission-denied:
    // Если у нас УЖЕ есть какие-то товары на экране (из RAM/localStorage-
    // кэша), не показываем модальную ошибку — пользователь продолжает
    // видеть товары, а в консоль пишем подробности.
    if (isPerm && Array.isArray(products) && products.length > 0) {
      console.warn('[Products] permission-denied при фоновом обновлении — оставляем кэш на экране');
      productsReady = true;
      return;
    }

    // Если кэш в памяти пуст, но в localStorage что-то лежит (даже
    // устаревшее) — лучше показать старые товары, чем пустой экран.
    if (isPerm && (!Array.isArray(products) || products.length === 0)) {
      try {
        const lsRaw = localStorage.getItem(LS_PRODUCTS_KEY) || '[]';
        const lsProducts = JSON.parse(lsRaw);
        if (Array.isArray(lsProducts) && lsProducts.length > 0) {
          lsProducts.sort(_stableProductOrderCompare);
          products = lsProducts;
          productsCache = lsProducts;
          productsCacheTime = Date.now() - CACHE_DURATION;
          productsReady = true;
          if (typeof renderProducts === 'function') renderProducts();
          console.warn('[Products] permission-denied + пустой RAM — показал устаревший localStorage кэш (',
                       lsProducts.length, 'тов.)');
          return;
        }
      } catch (_) {}
    }

    productsReady = false;
    let fbUserInfo = 'неизвестно';
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        const u = firebase.auth().currentUser;
        fbUserInfo = u ? (u.isAnonymous ? 'аноним' : u.email || 'без email') : 'НЕТ';
      }
    } catch (_) {}

    if (isPerm) {
      Swal.fire({
        icon: 'error',
        title: 'Не удалось загрузить товары',
        html:
          '<div style="text-align:left; font-size:13px;">' +
          'Сервер не разрешил чтение (permission-denied).<br><br>' +
          '<b>Что попробовать:</b><br>' +
          '1. Обновите страницу (Ctrl+F5 / Cmd+Shift+R).<br>' +
          '2. Проверьте интернет.<br>' +
          '3. Если повторяется — в Firebase Console: <b>Authentication → Sign-in method → Anonymous → Enable</b>.<br><br>' +
          '<small>Auth user: ' + fbUserInfo + '</small>' +
          '</div>',
        confirmButtonColor: '#dc3545'
      });
    } else {
      Swal.fire('Ошибка', 'Не удалось загрузить товары: ' + msg, 'error');
    }
  }
}

// Функция загрузки изображений на ImgBB (для редактирования товаров)
// ВАЖНО: ключ ImgBB можно поменять в одном месте — global.IMGBB_API_KEY.
// Тот же ключ используется в admin-products.html. Если получаешь
// "Invalid API v1 key" — сгенерируй новый на https://api.imgbb.com/
// (Account → Settings → API → Generate key) и подставь сюда.
async function uploadToImgBB(file) {
  console.log('📤 Начинаем загрузку на ImgBB:', file.name);
  
  const apiKey = (typeof window !== 'undefined' && window.IMGBB_API_KEY)
    || 'e33ec8bedb69f464ba02984709267456';
  
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
      var imgErrMsg = (data.error && data.error.message) || JSON.stringify(data);
      // Понятная подсказка при невалидном ключе.
      if (/invalid api(\s*v\d+)? key/i.test(imgErrMsg)) {
        imgErrMsg += '\n\nКЛЮЧ ImgBB больше не работает. Нужно:\n' +
                     '1) Зайти https://api.imgbb.com → Sign In.\n' +
                     '2) Account → Settings → API → Generate key.\n' +
                     '3) Подставить ключ в window.IMGBB_API_KEY или в js/product-loader.js (строка ~485).';
      }
      throw new Error('Ошибка загрузки на ImgBB: ' + imgErrMsg);
    }
  } catch (err) {
    console.error('❌ Ошибка при загрузке:', err);
    throw err;
  }
}


// addNewExtraPhotoToEdit() определена в gallery.js

// Флаг загрузки категорий
let sellerCategoriesLoaded = false;

// Функция гарантированной загрузки категорий
async function ensureSellerCategoriesLoaded() {
  if (!sellerCategoriesLoaded || cachedSellerCategories.length === 0) {
    await loadSellerCategoriesCache();
    sellerCategoriesLoaded = true;
  }
}

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
  if (typeof cachedSellerCategories !== 'undefined' && cachedSellerCategories.length > 0) {
    cachedSellerCategories.forEach(cat => {
      const catLower = cat.toLowerCase();
      if (!standardOptions.find(o => o.value === catLower)) {
        const selected = (currentCat || '').toLowerCase() === catLower ? 'selected' : '';
        html += `<option value="${catLower}" ${selected}>🏪 ${cat}</option>`;
      }
    });
  }
  
  // НЕ добавляем неизвестные категории из товаров - только официальные
  
  return html;
}

// Функция загрузки категорий продавцов
async function loadSellerCategoriesCache() {
  try {
    const standardCategories = ['все', 'ножницы', 'скотч', 'нож', 'корейские', 'часы', 'электроника', 'бытовые'];
    const categories = new Set();

    // Ждём auth перед чтением (правила требуют isAuthed())
    if (typeof kerbenWaitForAuth === 'function') {
      try { await kerbenWaitForAuth(); } catch (e) {}
    }

    // Загружаем ТОЛЬКО из коллекции seller_categories (лимит 500)
    const snapshot = await db.collection('seller_categories').limit(500).get();
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
