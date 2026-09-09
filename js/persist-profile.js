// ===========================================
// Модуль сохранения профиля (Persistent Profile)
// Защита данных клиента от очистки Android/браузером
// ===========================================
// Стратегия: localStorage (быстро) + IndexedDB (надёжно) + cookie (минимальный бэкап)
// При потере localStorage — автовосстановление из IndexedDB

(function() {
  'use strict';

  var DB_NAME = 'KerbenProfileDB';
  var DB_VERSION = 1;
  var STORE_NAME = 'profile';
  var COOKIE_NAME = 'kerben_profile_backup';
  var COOKIE_DAYS = 365;

  // ============ IndexedDB ============
  function openDB(callback) {
    if (!window.indexedDB) {
      if (callback) callback(null);
      return;
    }
    try {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = function(e) {
        if (callback) callback(e.target.result);
      };
      request.onerror = function() {
        console.log('[PersistProfile] IndexedDB ошибка открытия');
        if (callback) callback(null);
      };
    } catch(e) {
      console.log('[PersistProfile] IndexedDB недоступна');
      if (callback) callback(null);
    }
  }

  function saveToIDB(key, value, callback) {
    openDB(function(db) {
      if (!db) { if (callback) callback(false); return; }
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put(value, key);
        tx.oncomplete = function() { if (callback) callback(true); };
        tx.onerror = function() { if (callback) callback(false); };
      } catch(e) {
        if (callback) callback(false);
      }
    });
  }

  function loadFromIDB(key, callback) {
    openDB(function(db) {
      if (!db) { callback(null); return; }
      try {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(key);
        request.onsuccess = function() { callback(request.result || null); };
        request.onerror = function() { callback(null); };
      } catch(e) {
        callback(null);
      }
    });
  }

  function removeFromIDB(key, callback) {
    openDB(function(db) {
      if (!db) { if (callback) callback(); return; }
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = function() { if (callback) callback(); };
        tx.onerror = function() { if (callback) callback(); };
      } catch(e) {
        if (callback) callback();
      }
    });
  }

  // ============ Cookie (минимальный бэкап) ============
  function saveToCookie(data) {
    try {
      if (!data || !data.phone) return;
      var mini = { p: data.phone, n: data.name || '' };
      var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(mini))));
      var expires = new Date();
      expires.setDate(expires.getDate() + COOKIE_DAYS);
      document.cookie = COOKIE_NAME + '=' + encoded + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
    } catch(e) {}
  }

  function loadFromCookie() {
    try {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].trim();
        if (c.indexOf(COOKIE_NAME + '=') === 0) {
          var encoded = c.substring(COOKIE_NAME.length + 1);
          var decoded = decodeURIComponent(escape(atob(encoded)));
          return JSON.parse(decoded);
        }
      }
    } catch(e) {}
    return null;
  }

  function removeCookie() {
    try {
      document.cookie = COOKIE_NAME + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax';
    } catch(e) {}
  }

  // ============ Главные функции ============

  /**
   * Сохранить профиль клиента во все хранилища
   * @param {object} data - данные клиента (customerData)
   */
  function saveProfile(data) {
    if (!data) return;
    var json = JSON.stringify(data);

    // 1. localStorage (быстрый доступ)
    try { localStorage.setItem('customerData', json); } catch(e) {}

    // 2. IndexedDB (надёжное хранилище)
    saveToIDB('customerData', json);

    // 3. Cookie (минимальный бэкап - телефон + имя)
    saveToCookie(data);

    // 4. Timestamp последнего сохранения
    try { localStorage.setItem('customerData_ts', Date.now().toString()); } catch(e) {}
    saveToIDB('customerData_ts', Date.now().toString());
  }

  /**
   * Загрузить профиль из всех хранилищ (с автовосстановлением)
   * @param {function} callback - функция(data) с данными или null
   */
  function loadProfile(callback) {
    // 1. Быстрая проверка localStorage
    var localData = null;
    try {
      var raw = localStorage.getItem('customerData');
      if (raw) localData = JSON.parse(raw);
    } catch(e) {}

    if (localData && localData.phone) {
      // Данные есть в localStorage - всё ок
      callback(localData);
      // Но на всякий случай обновляем IndexedDB
      saveToIDB('customerData', JSON.stringify(localData));
      return;
    }

    // 2. localStorage пуст — пробуем IndexedDB
    console.log('[PersistProfile] localStorage пуст, пробуем IndexedDB...');
    loadFromIDB('customerData', function(idbRaw) {
      if (idbRaw) {
        try {
          var idbData = JSON.parse(idbRaw);
          if (idbData && idbData.phone) {
            console.log('[PersistProfile] ✅ Восстановлено из IndexedDB:', idbData.name);
            // Восстанавливаем в localStorage
            try { localStorage.setItem('customerData', idbRaw); } catch(e) {}
            callback(idbData);
            return;
          }
        } catch(e) {}
      }

      // 3. IndexedDB тоже пуста — пробуем cookie
      var cookieMini = loadFromCookie();
      if (cookieMini && cookieMini.p) {
        console.log('[PersistProfile] ⚠️ Найден бэкап в cookie, телефон:', cookieMini.p);
        // Возвращаем минимальные данные с флагом что нужно перелогиниться
        callback({
          phone: cookieMini.p,
          name: cookieMini.n || '',
          _restoredFromCookie: true
        });
        return;
      }

      // 4. Нигде нет данных
      callback(null);
    });
  }

  /**
   * Удалить профиль из всех хранилищ (logout)
   */
  function clearAgent() {
    try { localStorage.removeItem('currentAgent'); } catch(e) {}
    removeFromIDB('currentAgent');
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i++) keys.push(sessionStorage.key(i));
      keys.forEach(function (k) {
        if (k && (k.indexOf('isAgent_') === 0 || k === 'agentProfitCache')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (e) {}
  }

  function removeProfile() {
    try { localStorage.removeItem('customerData'); } catch(e) {}
    try { localStorage.removeItem('customerData_ts'); } catch(e) {}
    removeFromIDB('customerData');
    removeFromIDB('customerData_ts');
    removeCookie();
    clearAgent();
  }

  /**
   * Запросить постоянное хранилище у браузера (Android)
   * Предотвращает автоматическую очистку данных
   */
  function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(function(granted) {
        if (granted) {
          console.log('[PersistProfile] ✅ Постоянное хранилище разрешено');
        } else {
          console.log('[PersistProfile] ⚠️ Постоянное хранилище отклонено');
        }
      }).catch(function() {});
    }
  }

  // ============ Периодическая проверка целостности данных ============
  function startIntegrityCheck() {
    // Каждые 30 секунд проверяем что данные не исчезли
    setInterval(function() {
      try {
        var raw = localStorage.getItem('customerData');
        if (!raw) {
          // localStorage очищен! Пробуем восстановить
          loadFromIDB('customerData', function(idbRaw) {
            if (idbRaw) {
              try {
                localStorage.setItem('customerData', idbRaw);
                console.log('[PersistProfile] 🔄 Данные автовосстановлены из IndexedDB');
              } catch(e) {}
            }
          });
        }
      } catch(e) {}
    }, 30000);
  }

  // ============ Инициализация ============
  requestPersistentStorage();
  startIntegrityCheck();

  // Сохраняем данные при переходе/закрытии страницы
  window.addEventListener('beforeunload', function() {
    try {
      var raw = localStorage.getItem('customerData');
      if (raw) {
        saveToIDB('customerData', raw);
        saveToCookie(JSON.parse(raw));
      }
    } catch(e) {}
  });

  // Восстанавливаем при возвращении на вкладку (Android может очистить фоновые)
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      try {
        var raw = localStorage.getItem('customerData');
        if (!raw) {
          loadFromIDB('customerData', function(idbRaw) {
            if (idbRaw) {
              try {
                localStorage.setItem('customerData', idbRaw);
                console.log('[PersistProfile] 🔄 Восстановлено после возврата на вкладку');
              } catch(e) {}
            }
          });
        }
      } catch(e) {}
    } else {
      // Уходим с вкладки — сохраняем в IDB на всякий случай
      try {
        var raw = localStorage.getItem('customerData');
        if (raw) saveToIDB('customerData', raw);
      } catch(e) {}
    }
  });

  // ============ Экспорт глобально ============
  window.PersistProfile = {
    save: saveProfile,
    load: loadProfile,
    remove: removeProfile,
    requestPersist: requestPersistentStorage,
    // Утилиты для бэкапа других данных (currentAgent) в IndexedDB
    _saveToIDB: saveToIDB,
    _loadFromIDB: loadFromIDB,
    _removeFromIDB: removeFromIDB,
    clearAgent: clearAgent
  };

})();
