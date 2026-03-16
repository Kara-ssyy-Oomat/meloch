// ===================================================================
// КЕРБЕН B2B Market — Push Notifications (FCM)
// Уведомления как в WhatsApp — даже когда сайт закрыт
// ===================================================================

// VAPID ключ — получите в Firebase Console:
// Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
const VAPID_KEY = 'BCdA8I-AhgwdmbQmyCcvh_oAJ4KyMTMG5niUHMlJzZPhv3VWeDKfexWDpfL5LNpRy-CBUuL4k9YMPY9CVSGrlds';

let _messaging = null;
let _pushToken = null;

// Инициализация Firebase Messaging
function initPushNotifications() {
  if (!('Notification' in window)) {
    console.log('🔔 Браузер не поддерживает уведомления');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.log('🔔 Service Worker не поддерживается');
    return;
  }

  if (typeof firebase === 'undefined' || !firebase.messaging) {
    console.log('🔔 Firebase Messaging SDK не загружен');
    return;
  }

  try {
    _messaging = firebase.messaging();

    // Обработка уведомлений когда сайт ОТКРЫТ (foreground)
    _messaging.onMessage((payload) => {
      console.log('🔔 Уведомление (foreground):', payload);
      showForegroundNotification(payload);
    });

    // Автоматическая подписка если уже разрешено
    if (Notification.permission === 'granted') {
      subscribeToPush();
    }

    console.log('🔔 Push-уведомления инициализированы');
  } catch (error) {
    console.error('🔔 Ошибка инициализации push:', error);
  }
}

// Запрос разрешения и подписка на push-уведомления
async function subscribeToPush() {
  try {
    // Запрашиваем разрешение
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('🔔 Пользователь отклонил уведомления');
      return false;
    }

    // Ждём регистрацию Service Worker
    const registration = await navigator.serviceWorker.ready;

    // Получаем FCM токен
    const token = await _messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      _pushToken = token;
      console.log('🔔 FCM Token получен:', token.substring(0, 20) + '...');

      // Сохраняем токен в Firestore
      await saveTokenToFirestore(token);
      return true;
    }
  } catch (error) {
    console.error('🔔 Ошибка подписки на push:', error);
  }
  return false;
}

// Сохранение FCM токена в Firestore (привязка к клиенту)
async function saveTokenToFirestore(token) {
  if (typeof db === 'undefined') return;

  // Генерируем clientId если ещё нет
  let cId = localStorage.getItem('chatClientId');
  if (!cId) {
    cId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chatClientId', cId);
  }
  const cName = localStorage.getItem('chatClientName') || 'Клиент';

  try {
    // Сохраняем в коллекцию pushTokens
    await db.collection('pushTokens').doc(token).set({
      token: token,
      clientId: cId,
      clientName: cName,
      platform: getPlatformInfo(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Обновляем токен в chatClients
    await db.collection('chatClients').doc(cId).set({
      pushToken: token,
      pushEnabled: true,
      name: cName,
      lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('🔔 Токен сохранён в Firestore для:', cId);
  } catch (error) {
    console.error('🔔 Ошибка сохранения токена:', error);
  }
}

// Определение платформы
function getPlatformInfo() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}

// Показ уведомления когда сайт открыт (foreground)
// Показываем СИСТЕМНОЕ уведомление + SweetAlert на странице
function showForegroundNotification(payload) {
  const data = payload.data || payload.notification || {};
  const title = data.title || 'Кербен';
  const body = data.body || 'Новое уведомление';

  // 1. СИСТЕМНОЕ уведомление (чтобы было видно на панели телефона)
  if (Notification.permission === 'granted' && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(function(reg) {
      reg.showNotification(title, {
        body: body,
        icon: './icon-kerben.jpg',
        badge: './icon-kerben.jpg',
        vibrate: [300, 150, 300, 150, 300],
        tag: data.tag || 'kerben-foreground',
        renotify: true,
        requireInteraction: true,
        silent: false,
        data: { url: data.url || './index.html', type: data.type || 'general' }
      });
    });
  }

  // 2. SweetAlert на странице
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: title,
      text: body,
      icon: 'info',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 5000,
      timerProgressBar: true,
      showCloseButton: true
    });
  }

  // 3. Обновляем badge на иконке чата
  const badge = document.getElementById('navChatBadge');
  if (badge && data.type === 'chat') {
    const current = parseInt(badge.textContent) || 0;
    badge.textContent = current + 1;
    badge.style.display = 'flex';
  }
}

// Отписка от push-уведомлений
async function unsubscribeFromPush() {
  try {
    if (_messaging && _pushToken) {
      await _messaging.deleteToken();

      // Удаляем токен из Firestore
      if (typeof db !== 'undefined') {
        await db.collection('pushTokens').doc(_pushToken).delete();

        const cId = localStorage.getItem('chatClientId');
        if (cId) {
          await db.collection('chatClients').doc(cId).update({
            pushEnabled: false,
            pushToken: firebase.firestore.FieldValue.delete()
          });
        }
      }

      _pushToken = null;
      console.log('🔔 Отписка от push-уведомлений');
      return true;
    }
  } catch (error) {
    console.error('🔔 Ошибка отписки:', error);
  }
  return false;
}

// UI: Кнопка подписки/отписки с анимацией
async function togglePushNotifications() {
  if (Notification.permission === 'denied') {
    Swal.fire({
      icon: 'warning',
      title: 'Уведомления заблокированы',
      html: 'Разрешите уведомления в настройках браузера:<br><br>' +
        '<b>Chrome:</b> Нажмите 🔒 слева от адресной строки → Уведомления → Разрешить<br><br>' +
        '<b>Firefox:</b> Нажмите 🔒 → Разрешения → Уведомления',
      confirmButtonText: 'Понятно'
    });
    return;
  }

  if (_pushToken) {
    // Уже подписан — отписываемся
    const result = await Swal.fire({
      icon: 'question',
      title: 'Отключить уведомления?',
      text: 'Вы больше не будете получать уведомления о сообщениях и заказах',
      showCancelButton: true,
      confirmButtonText: 'Отключить',
      cancelButtonText: 'Отмена'
    });

    if (result.isConfirmed) {
      const ok = await unsubscribeFromPush();
      if (ok) {
        updatePushButtonUI(false);
        Swal.fire({ icon: 'success', title: 'Уведомления отключены', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
      }
    }
  } else {
    // Не подписан — подписываемся
    const ok = await subscribeToPush();
    if (ok) {
      updatePushButtonUI(true);
      Swal.fire({ icon: 'success', title: '🔔 Уведомления включены!', text: 'Вы будете получать уведомления даже когда сайт закрыт', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
    }
  }
}

// Обновление UI кнопки уведомлений
function updatePushButtonUI(enabled) {
  const btn = document.getElementById('pushToggleBtn');
  if (btn) {
    btn.innerHTML = enabled
      ? '🔔 <span>Уведомления ВКЛ</span>'
      : '🔕 <span>Включить уведомления</span>';
    btn.style.background = enabled ? '#4CAF50' : '#ff9800';
  }
}

// Проверка статуса при загрузке
function checkPushStatus() {
  const btn = document.getElementById('pushToggleBtn');
  if (!btn) return;

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    btn.style.display = 'none';
    return;
  }

  const enabled = Notification.permission === 'granted' && _pushToken;
  updatePushButtonUI(!!enabled);
}

// ==================== АДМИН: Отправка уведомлений ====================

// Админ: отправка уведомления всем подписчикам
async function sendBroadcastNotification(title, body) {
  if (typeof db === 'undefined') return;

  try {
    await db.collection('notificationQueue').add({
      type: 'broadcast',
      title: title,
      body: body,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('🔔 Broadcast уведомление добавлено в очередь');
    return true;
  } catch (error) {
    console.error('🔔 Ошибка отправки broadcast:', error);
    return false;
  }
}

// Админ: отправка уведомления конкретному клиенту (при ответе в чате)
async function sendChatNotification(targetClientId, messageText, senderName) {
  if (typeof db === 'undefined') return;

  try {
    await db.collection('notificationQueue').add({
      type: 'chat',
      targetClientId: targetClientId,
      title: senderName || 'Кербен',
      body: messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('🔔 Chat уведомление добавлено в очередь для:', targetClientId);
  } catch (error) {
    console.error('🔔 Ошибка отправки chat notification:', error);
  }
}

// Админ: UI для отправки broadcast уведомления
async function showBroadcastNotificationDialog() {
  const { value: formValues } = await Swal.fire({
    title: '📢 Отправить уведомление всем',
    html:
      '<input id="swal-notif-title" class="swal2-input" placeholder="Заголовок" style="font-size:14px">' +
      '<textarea id="swal-notif-body" class="swal2-textarea" placeholder="Текст уведомления" style="font-size:14px;height:100px"></textarea>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Отправить 📤',
    cancelButtonText: 'Отмена',
    preConfirm: () => {
      const title = document.getElementById('swal-notif-title').value.trim();
      const body = document.getElementById('swal-notif-body').value.trim();
      if (!title || !body) {
        Swal.showValidationMessage('Заполните все поля');
        return false;
      }
      return { title, body };
    }
  });

  if (formValues) {
    const ok = await sendBroadcastNotification(formValues.title, formValues.body);
    if (ok) {
      Swal.fire({ icon: 'success', title: 'Уведомление отправлено!', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    }
  }
}

// Инициализация при загрузке
window.addEventListener('load', () => {
  // Даём время на загрузку Firebase
  setTimeout(() => {
    initPushNotifications();
    checkPushStatus();
  }, 2000);
});
