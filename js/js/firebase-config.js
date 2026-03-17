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
    console.log('Firebase initialized successfully');
    
    // Подписка на новые сообщения в чате
    subscribeToNewChatMessages();
    
  } catch (error) {
    console.error('Firebase initialization error:', error);
    Swal.fire('Ошибка', 'Ошибка инициализации Firebase: ' + error.message, 'error');
  }
}

// Храним unsubscribe-функцию чтобы не создавать дублирующие слушатели
let _chatUnsubscribe = null;

// Подписка на новые сообщения от админа для badge на иконке чата
function subscribeToNewChatMessages() {
  const clientId = localStorage.getItem('chatClientId');
  if (!clientId) {
    console.log('💬 Нет chatClientId - не подписываемся на сообщения');
    return;
  }
  
  // Отписываемся от старого слушателя если есть
  if (_chatUnsubscribe) {
    _chatUnsubscribe();
    _chatUnsubscribe = null;
  }
  
  _chatUnsubscribe = db.collection('chatMessages')
    .where('clientId', '==', clientId)
    .orderBy('timestamp', 'asc')
    .onSnapshot(snapshot => {
      let unreadCount = 0;
      snapshot.forEach(doc => {
        const msg = doc.data();
        if (msg.sender === 'admin' && msg.read === false) {
          unreadCount++;
        }
      });
      
      const badge = document.getElementById('navChatBadge');
      if (badge) {
        badge.textContent = unreadCount > 0 ? unreadCount : '!';
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
      }
      console.log('💬 Непрочитанных сообщений:', unreadCount);
    }, error => {
      console.log('Ошибка подписки на чат:', error.message);
    });
}

// Инициализация Firebase
if (typeof firebase !== 'undefined') {
  initFirebase();
} else {
  window.addEventListener('load', initFirebase);
}
