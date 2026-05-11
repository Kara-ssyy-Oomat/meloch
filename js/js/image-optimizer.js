// ===========================================
// Модуль оптимизации загрузки изображений (упрощённый)
// ===========================================

// Определяем платформу
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);
const isMobile = isIOS || isAndroid;

console.log(' Платформа:', isIOS ? 'iOS' : (isAndroid ? 'Android' : 'Desktop'));

/**
 * Инициализация - просто логируем
 */
function initImageOptimization() {
  console.log(' Image optimizer инициализирован');
  
  // Считаем изображения на странице
  setTimeout(() => {
    const allImages = document.querySelectorAll('img');
    const loadedImages = document.querySelectorAll('img.loaded');
    console.log(' Изображений на странице:', allImages.length, 'загружено:', loadedImages.length);
  }, 3000);
}

/**
 * Загрузка всех изображений
 */
function loadAllImages() {
  document.querySelectorAll('img').forEach(img => {
    if (img.dataset.src && !img.src) {
      img.src = img.dataset.src;
    }
  });
}

/**
 * Предзагрузка изображений
 */
function preloadImages(urls) {
  if (!Array.isArray(urls)) return;
  urls.forEach(url => {
    if (url) {
      const img = new Image();
      img.src = url;
    }
  });
}

/**
 * Оптимизация изображений в контейнере
 */
function optimizeImagesInContainer(container) {
  // Пустая функция для совместимости
}

/**
 * Создание placeholder
 */
function createPlaceholder(width = 200, height = 200, text = 'Загрузка...') {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + width + '\" height=\"' + height + '\"><rect fill=\"#f0f0f0\" width=\"' + width + '\" height=\"' + height + '\"/><text fill=\"#999\" x=\"50%\" y=\"50%\" text-anchor=\"middle\" dy=\".3em\" font-family=\"Arial\" font-size=\"14\">' + text + '</text></svg>'
  );
}

// Инициализация
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initImageOptimization);
} else {
  initImageOptimization();
}

// Экспорт функций
window.imageOptimizer = {
  init: initImageOptimization,
  preload: preloadImages,
  optimize: optimizeImagesInContainer,
  placeholder: createPlaceholder,
  loadAll: loadAllImages,
  isIOS: isIOS,
  isAndroid: isAndroid,
  isMobile: isMobile
};
