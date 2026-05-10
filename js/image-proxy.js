// ===================================================================
// КЕРБЕН B2B Market — Image Proxy & Mobile Detection
// ===================================================================

// Определяем мобильное устройство глобально
const IS_MOBILE = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const IS_ANDROID = /Android/.test(navigator.userAgent);
console.log('📱 Мобильное устройство:', IS_MOBILE, 'iOS:', IS_IOS, 'Android:', IS_ANDROID);

/**
 * Получает URL изображения с оптимизацией размера
 * Используем Cloudinary трансформации напрямую (самый надёжный способ)
 * Прокси используется ТОЛЬКО как запасной вариант при ошибке
 */
function getImageUrl(url, width) {
  if (!url || typeof url !== 'string') return '';
  
  // Cloudinary трансформации — работают на всех устройствах
  if (width && url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/w_' + width + ',q_80,f_auto/');
  }
  
  return url;
}

/**
 * Обработчик ошибки загрузки изображения
 * Попытка 1: оригинальный URL без трансформаций
 * Попытка 2: прокси wsrv.nl
 * Попытка 3: placeholder
 */
function handleImageError(img, originalUrl) {
  var failCount = parseInt(img.dataset.failCount || '0');
  img.dataset.failCount = failCount + 1;
  
  var url = originalUrl || '';
  if (!url || url.startsWith('data:')) {
    showPlaceholder(img);
    return;
  }
  
  console.log('🔄 Изображение не загружено, попытка', failCount + 1, ':', url.substring(0, 60));
  
  if (failCount === 0) {
    // Попытка 1: оригинальный URL без трансформаций
    img.src = url;
  } else if (failCount === 1) {
    // Попытка 2: прокси
    img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=300&q=80&default=1';
  } else {
    // Попытка 3: placeholder
    showPlaceholder(img);
  }
}

function showPlaceholder(img) {
  img.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">' +
    '<rect fill="#f0f0f0" width="200" height="150"/>' +
    '<text fill="#999" font-family="Arial" font-size="14" x="100" y="70" text-anchor="middle">📷</text>' +
    '<text fill="#999" font-family="Arial" font-size="12" x="100" y="90" text-anchor="middle">Нет фото</text>' +
    '</svg>'
  );
}

// Делаем функции глобальными
window.getImageUrl = getImageUrl;
window.handleImageError = handleImageError;
window.showPlaceholder = showPlaceholder;
