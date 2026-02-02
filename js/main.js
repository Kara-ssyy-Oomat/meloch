// ===========================================
// Main.js - Shared functionality for all pages
// ===========================================

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBRQ6hH7kXq7ApJmqbvTG1EQsXwxWEnaGg",
  authDomain: "svoysayet.firebaseapp.com",
  projectId: "svoysayet",
  storageBucket: "svoysayet.firebasestorage.app",
  messagingSenderId: "450143000217",
  appId: "1:450143000217:web:7495cefaea0b94966e8a08",
  measurementId: "G-Y8VG9E29FY"
};

// Firebase initialization
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
  } catch (error) {
    console.error('Firebase initialization error:', error);
    if (typeof Swal !== 'undefined') {
      Swal.fire('Ошибка', 'Ошибка инициализации Firebase: ' + error.message, 'error');
    }
  }
}

if (typeof firebase !== 'undefined') {
  initFirebase();
} else {
  window.addEventListener('load', initFirebase);
}

// Client ID system
let clientId = localStorage.getItem('chatClientId');
let clientName = localStorage.getItem('chatClientName');

// Partner referral system
let partnerRef = null;
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.has('ref')) {
  partnerRef = urlParams.get('ref');
  
  const partnerData = {
    name: partnerRef,
    timestamp: Date.now()
  };
  sessionStorage.setItem('partnerData', JSON.stringify(partnerData));
  try {
    localStorage.setItem('partnerData', JSON.stringify(partnerData));
  } catch(e) {}
  
  setTimeout(() => {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'info',
        title: 'Добро пожаловать! 🤝',
        html: `Вы перешли по партнерской ссылке <strong>${partnerRef}</strong>.<br><br>Все ваши заказы будут закреплены за этим партнером!`,
        timer: 5000,
        showConfirmButton: true,
        confirmButtonText: 'Понятно'
      });
    }
  }, 1000);
} else {
  let savedData = sessionStorage.getItem('partnerData');
  if (!savedData) {
    savedData = localStorage.getItem('partnerData');
  }
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      partnerRef = parsed.name;
    } catch(e) {}
  }
}

// Scroll locking utilities
function forceUnlockScroll() {
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.documentElement.style.position = '';
  document.body.style.position = '';
}

function lockScroll() {
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}

// Active page detection for navigation
function getActivePage() {
  const path = window.location.pathname;
  if (path.includes('cart.html')) return 'cart';
  if (path.includes('profile.html')) return 'profile';
  if (path.includes('stock.html')) return 'stock';
  return 'home';
}

// Update navigation active state based on current page
function updateNavActive() {
  const activePage = getActivePage();
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === activePage);
  });
}

// Call on page load
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(updateNavActive, 100);
});
