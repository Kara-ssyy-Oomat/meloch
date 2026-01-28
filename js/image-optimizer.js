// ===========================================
// Модуль оптимизации загрузки изображений
// ===========================================

/**
 * Инициализация оптимизации изображений
 * Использует Intersection Observer API для lazy loading
 */
function initImageOptimization() {
  if (!('IntersectionObserver' in window)) {
    console.log('IntersectionObserver не поддерживается, используется стандартный lazy loading');
    return;
  }

  // Настройки для наблюдателя
  const config = {
    rootMargin: '100px', // Начинаем загрузку за 100px до появления
    threshold: 0.01 // Срабатывает когда хотя бы 1% изображения виден
  };

  // Создаем наблюдатель для изображений
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        
        // Если изображение ещё не загружено
        if (!img.classList.contains('lazy-loaded')) {
          const src = img.dataset.src || img.src;
          
          if (src && src !== img.src) {
            // Загружаем изображение
            img.src = src;
          }
          
          // Добавляем обработчики загрузки
          img.onload = () => {
            img.classList.add('lazy-loaded');
            img.classList.add('loaded');
          };
          
          img.onerror = () => {
            img.classList.add('lazy-loaded');
            img.classList.add('loaded');
            console.warn('Ошибка загрузки изображения:', src);
          };
        }
        
        // Прекращаем наблюдение за этим изображением
        observer.unobserve(img);
      }
    });
  }, config);

  // Наблюдаем за всеми изображениями с классом lazy
  function observeLazyImages() {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]:not(.lazy-observed)');
    lazyImages.forEach(img => {
      img.classList.add('lazy-observed');
      imageObserver.observe(img);
    });
  }

  // Запускаем при загрузке страницы
  observeLazyImages();

  // Наблюдаем за изменениями DOM для новых изображений
  const mutationObserver = new MutationObserver((mutations) => {
    let hasNewImages = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.tagName === 'IMG' && node.loading === 'lazy') {
              hasNewImages = true;
            } else if (node.querySelector) {
              const imgs = node.querySelectorAll('img[loading="lazy"]');
              if (imgs.length > 0) hasNewImages = true;
            }
          }
        });
      }
    });
    
    if (hasNewImages) {
      observeLazyImages();
    }
  });

  // Начинаем наблюдение за изменениями в body
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Предзагрузка критичных изображений
 * @param {Array<string>} urls - массив URL изображений для предзагрузки
 */
function preloadImages(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  
  urls.forEach(url => {
    if (!url) return;
    
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  });
}

/**
 * Оптимизация изображений в контейнере
 * @param {HTMLElement} container - контейнер с изображениями
 */
function optimizeImagesInContainer(container) {
  if (!container) return;
  
  const images = container.querySelectorAll('img:not(.lazy-observed)');
  
  images.forEach(img => {
    // Добавляем loading="lazy" если его нет
    if (!img.loading) {
      img.loading = 'lazy';
    }
    
    // Добавляем обработчики для плавного появления
    if (!img.onload) {
      img.onload = () => {
        img.classList.add('loaded');
      };
    }
    
    if (!img.onerror) {
      img.onerror = () => {
        img.classList.add('loaded');
      };
    }
    
    // Если изображение уже загружено
    if (img.complete) {
      img.classList.add('loaded');
    }
  });
}

/**
 * Создание placeholder для изображения
 * @param {number} width - ширина
 * @param {number} height - высота
 * @param {string} text - текст placeholder
 * @returns {string} - data URI
 */
function createPlaceholder(width = 200, height = 200, text = 'Загрузка...') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect fill="#f0f0f0" width="${width}" height="${height}"/>
      <text fill="#999" x="50%" y="50%" 
            dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial" font-size="14">
        ${text}
      </text>
    </svg>
  `;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initImageOptimization);
} else {
  initImageOptimization();
}

// Экспорт функций для использования в других модулях
window.imageOptimizer = {
  init: initImageOptimization,
  preload: preloadImages,
  optimize: optimizeImagesInContainer,
  placeholder: createPlaceholder
};
