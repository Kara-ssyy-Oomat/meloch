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
 * На мобильных проксируем Cloudinary через wsrv.nl с ресайзом
 * @param {string} url - оригинальный URL
 * @param {number} width - ширина миниатюры (по умолчанию - без ресайза)
 */
function getImageUrl(url, width) {
  if (!url || typeof url !== 'string') return '';
  
  // На мобильных устройствах проксируем через wsrv.nl с оптимизацией размера
  if (IS_MOBILE && url.includes('cloudinary.com')) {
    let proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url);
    if (width) {
      proxyUrl += '&w=' + width + '&q=80&output=webp'; // WebP + сжатие + размер
    }
    return proxyUrl;
  }
  
  // Десктоп: используем Cloudinary трансформации если доступны
  if (width && url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/w_${width},q_80,f_auto/`);
  }
  
  return url;
}

/**
 * Обработчик ошибки загрузки изображения
 * Пробует разные прокси или показывает placeholder
 */
function handleImageError(img, originalUrl) {
  if (!img || img.dataset.failCount >= 2) {
    // Уже пробовали 2 раза - показываем placeholder
    img.src = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<rect fill="#f0f0f0" width="200" height="200"/>' +
      '<text fill="#999" font-family="Arial" font-size="14" x="100" y="95" text-anchor="middle">📷</text>' +
      '<text fill="#999" font-family="Arial" font-size="12" x="100" y="115" text-anchor="middle">Нет фото</text>' +
      '</svg>'
    );
    img.classList.add('loaded');
    return;
  }
  
  const failCount = parseInt(img.dataset.failCount || '0');
  img.dataset.failCount = failCount + 1;
  
  const url = originalUrl || img.dataset.originalUrl || img.src;
  if (!url || url.startsWith('data:')) return;
  
  console.log('🔄 Изображение не загружено, попытка', failCount + 1, ':', url.substring(0, 50));
  
  // Попытка 1: Прокси images.weserv.nl (работает на мобильных)
  if (failCount === 0) {
    img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&default=1';
  }
  // Попытка 2: placeholder
  else {
    img.src = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<rect fill="#f0f0f0" width="200" height="200"/>' +
      '<text fill="#999" font-family="Arial" font-size="14" x="100" y="95" text-anchor="middle">📷</text>' +
      '<text fill="#999" font-family="Arial" font-size="12" x="100" y="115" text-anchor="middle">Нет фото</text>' +
      '</svg>'
    );
    img.classList.add('loaded');
  }
}

// Делаем функции глобальными
window.getImageUrl = getImageUrl;
window.handleImageError = handleImageError;
