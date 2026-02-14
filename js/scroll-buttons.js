// ===================================================================
// КЕРБЕН B2B Market — Scroll Buttons (кнопки прокрутки вверх/вниз)
// ===================================================================

(function() {
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  const scrollBottomBtn = document.getElementById('scrollBottomBtn');
  let scrollTimeout;
  
  function updateScrollButtons() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    // Минимальная высота страницы для показа кнопок
    if (scrollHeight <= clientHeight + 300) {
      scrollTopBtn.style.display = 'none';
      scrollBottomBtn.style.display = 'none';
      return;
    }
    
    // Порог для определения краёв страницы
    const topThreshold = 200;
    const bottomThreshold = 200;
    const isAtTop = scrollTop < topThreshold;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - bottomThreshold;
    
    // Кнопка "ВВЕРХ" - показываем если не вверху
    if (!isAtTop) {
      scrollTopBtn.style.display = 'flex';
      scrollTopBtn.style.alignItems = 'center';
      scrollTopBtn.style.justifyContent = 'center';
      setTimeout(() => { scrollTopBtn.style.opacity = '1'; }, 10);
    } else {
      scrollTopBtn.style.opacity = '0';
      setTimeout(() => { scrollTopBtn.style.display = 'none'; }, 300);
    }
    
    // Кнопка "ВНИЗ" - показываем если не внизу
    if (!isAtBottom) {
      scrollBottomBtn.style.display = 'flex';
      scrollBottomBtn.style.alignItems = 'center';
      scrollBottomBtn.style.justifyContent = 'center';
      setTimeout(() => { scrollBottomBtn.style.opacity = '1'; }, 10);
    } else {
      scrollBottomBtn.style.opacity = '0';
      setTimeout(() => { scrollBottomBtn.style.display = 'none'; }, 300);
    }
  }
  
  // Слушаем прокрутку
  window.addEventListener('scroll', function() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(updateScrollButtons, 50);
  }, { passive: true });
  
  // Проверяем при загрузке
  setTimeout(updateScrollButtons, 500);
})();
