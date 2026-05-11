// ===================================================================
// КЕРБЕН B2B Market — Firebase Configuration & Initialization
// ===================================================================

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBRQ6hH7kXq7ApJmqbvTG1EQsXwxWEnaGg",
  authDomain: "svoysayet.firebaseapp.com",
  projectId: "svoysayet",
  storageBucket: "svoysayet.firebasestorage.app",
  messagingSenderId: "450143000217",
  appId: "1:450143000217:web:7495cefaea0b94966e8a08",
  measurementId: "G-Y8VG9E29FY"
};

// Глобальные переменные Firebase
let db, storage;

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') throw new Error('Firebase SDK не загружен');
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    storage = firebase.storage();

    // ОПТИМИЗАЦИЯ COSTS: включаем оффлайн-кэш Firestore (IndexedDB).
    // После первой загрузки документа SDK будет отдавать его из локального
    // IndexedDB, не списывая Read из платного плана. Сильно снижает расход
    // у постоянных посетителей и вернувшихся клиентов.
    // synchronizeTabs = true — кэш разделяется между вкладками одного клиента.
    try {
      db.enablePersistence({ synchronizeTabs: true })
        .then(() => console.log('🗃️ Firestore offline-cache включён (IndexedDB)'))
        .catch((err) => {
          if (err && err.code === 'failed-precondition') {
            console.log('🗃️ Offline-cache: открыто несколько вкладок без synchronizeTabs');
          } else if (err && err.code === 'unimplemented') {
            console.log('🗃️ Offline-cache: браузер не поддерживает IndexedDB');
          }
        });
    } catch (e) { /* старый SDK — игнорируем */ }

    console.log('Firebase initialized successfully');

    if (typeof kerbenStartAppCheckSetup === 'function') {
      kerbenStartAppCheckSetup(db);
    }

    // АУТЕНТИФИКАЦИЯ: каждому посетителю даём Firebase auth.uid (анонимно).
    // Это позволяет в Firestore Rules использовать `request.auth != null`
    // и закрыть базы от случайных скриптов / ботов с улицы.
    // Если SDK не загружен или Anonymous Auth выключен в Console — сайт всё
    // равно продолжит работать (правила пока разрешают чтение всем).
    if (typeof kerbenEnsureSignedIn === 'function') {
      kerbenEnsureSignedIn();
    }

    // ОПТИМИЗАЦИЯ COSTS: НЕ создаём onSnapshot для каждого посетителя.
    // Раньше это держало постоянное соединение и читало все сообщения у каждого клиента —
    // главная причина огромных расходов на Firestore Read Ops.
    // Теперь проверяем непрочитанные сообщения только по событиям:
    //  - при открытии чата (внутри toggleChat/loadChatMessages)
    //  - при возврате вкладки на передний план (visibilitychange)
    //  - при первой загрузке (один раз)
    setupCheapChatBadgeCheck();
    
  } catch (error) {
    console.error('Firebase initialization error:', error);
    Swal.fire('Ошибка', 'Ошибка инициализации Firebase: ' + error.message, 'error');
  }
}

// ОПТИМИЗАЦИЯ COSTS: вместо постоянного onSnapshot — лёгкая разовая проверка
// непрочитанных сообщений. Запускается:
//  - при загрузке страницы (один раз)
//  - при возврате вкладки из фона
//  - принудительно по событию 'kerben-recheck-chat-badge'
let _chatBadgeCheckBusy = false;
let _chatBadgeLastCheck = 0;

async function checkUnreadChatMessages() {
  if (_chatBadgeCheckBusy) return;
  // Антиспам: не чаще 1 раза в 30 секунд
  if (Date.now() - _chatBadgeLastCheck < 30000) return;
  _chatBadgeCheckBusy = true;
  _chatBadgeLastCheck = Date.now();
  try {
    const clientId = localStorage.getItem('chatClientId');
    if (!clientId) return;
    if (typeof db === 'undefined' || !db) return;

    // Ждём готовности Firebase Auth (анонимного логина).
    // Без этого первый запрос мог уйти ДО появления request.auth и
    // правила вида `if isAuthed()` блокировали бы его permission-denied.
    if (typeof kerbenWaitForAuth === 'function') {
      await kerbenWaitForAuth();
    }

    // Лёгкий запрос: только непрочитанные сообщения от админа этому клиенту,
    // максимум 50 штук — этого достаточно для отображения цифры в badge.
    const snap = await db.collection('chatMessages')
      .where('clientId', '==', clientId)
      .where('sender', '==', 'admin')
      .where('read', '==', false)
      .limit(50)
      .get();

    const unreadCount = snap.size;
    const badge = document.getElementById('navChatBadge');
    if (badge) {
      badge.textContent = unreadCount > 0 ? unreadCount : '!';
      badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
  } catch (e) {
    // тихо игнорируем — не ломаем UI
  } finally {
    _chatBadgeCheckBusy = false;
  }
}

function setupCheapChatBadgeCheck() {
  // Первичная проверка через 5 секунд после загрузки (не блокируем старт)
  setTimeout(checkUnreadChatMessages, 5000);

  // Когда пользователь возвращается во вкладку — проверяем
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) checkUnreadChatMessages();
  });

  // Возможность перепроверить по событию (например, после открытия/закрытия чата)
  window.addEventListener('kerben-recheck-chat-badge', checkUnreadChatMessages);
}

// Совместимость со старым кодом, который мог звать subscribeToNewChatMessages.
// Теперь это просто разовая проверка, без постоянного слушателя.
function subscribeToNewChatMessages() {
  checkUnreadChatMessages();
}

// Инициализация Firebase
if (typeof firebase !== 'undefined') {
  initFirebase();
} else {
  window.addEventListener('load', initFirebase);
}
