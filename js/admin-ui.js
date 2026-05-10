// ===================================================================
// КЕРБЕН B2B Market — Admin UI (панель, детали, выход, категории, голос)
// ===================================================================

// --- Функция для показа/скрытия админ-панели ---
function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (panel.classList.contains('admin-panel-hidden')) {
    panel.classList.remove('admin-panel-hidden');
    document.getElementById('hideAdminPanelBtn').textContent = 'Скрыть панель';
  } else {
    panel.classList.add('admin-panel-hidden');
    document.getElementById('hideAdminPanelBtn').textContent = 'Показать панель';
  }
}

// Функция для показа детальной информации о товаре (для корейских товаров и часов)
function showProductDetailModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  Swal.fire({
    title: product.title || 'Товар',
    html: `
      <div style="text-align:center;">
        <img loading="eager" src="${product.image || ''}" alt="${product.title || ''}" style="max-width:100%; max-height:300px; border-radius:12px; margin-bottom:15px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
        <div style="background:linear-gradient(135deg, #fff3e0, #ffe0b2); padding:15px; border-radius:10px; margin-top:10px;">
          <div style="font-size:24px; font-weight:bold; color:#e65100; margin-bottom:10px;">${product.price || 0} сом</div>
          <div style="font-size:15px; color:#5d4037; line-height:1.6; text-align:left;">${product.description || 'Описание отсутствует'}</div>
        </div>
      </div>
    `,
    width: 450,
    showCloseButton: true,
    showConfirmButton: false,
    background: '#fffbf0',
    customClass: {
      popup: 'korean-product-modal'
    }
  });
}

// Выход из режима администратора
function logoutAdmin() {
  isAdmin = false;
  userRole = 'guest';
  isEditorMode = false; // Выключаем режим редактора
  isBulkSelectMode = false;
  bulkSelectedProducts.clear();
  const bulkBar = document.getElementById('bulkActionBar');
  if (bulkBar) bulkBar.style.display = 'none';
  
  const managementHeader = document.getElementById('managementHeader');
  
  if (managementHeader) managementHeader.style.display = 'none';
  
  // Скрываем кнопку редактора товаров
  const editorBtnContainer = document.getElementById('editorBtnContainer');
  if (editorBtnContainer) editorBtnContainer.style.display = 'none';
  
  // Сбрасываем стиль кнопки редактора
  const editorModeBtn = document.getElementById('editorModeBtn');
  if (editorModeBtn) {
    editorModeBtn.style.background = 'linear-gradient(135deg,#6c757d,#495057)';
    editorModeBtn.innerHTML = '✏️ Редактор';
  }
  
  // Показываем все кнопки категорий обратно
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.style.display = 'block';
  });
  
  renderProducts();
  
  Swal.fire('Выход', 'Вы вышли из режима администратора', 'info');
}

// Функция переключения видимости других категорий
let otherCategoriesVisible = false;
function toggleOtherCategories() {
  const container = document.getElementById('otherCategoriesContainer');
  const btn = document.getElementById('otherCategoriesBtn');
  otherCategoriesVisible = !otherCategoriesVisible;
  if (otherCategoriesVisible) {
    container.style.display = '';
    container.classList.add('visible');
    btn.innerHTML = '📂 Скрыть категории ▲';
  } else {
    container.style.display = 'none';
    container.classList.remove('visible');
    btn.innerHTML = '📂 Другие категории ▼';
  }
}

// ============ ГЛОБАЛЬНАЯ ФУНКЦИЯ ГОЛОСОВОГО ПОИСКА ============

window.startVoiceSearch = function() {
  // Проверяем глобальную переменную recognition
  if (!window.recognition) {
    if (typeof window.initVoiceSearch === 'function') {
      window.initVoiceSearch();
    }
  }
  
  if (window.recognition) {
    if (window.isListening) {
      window.recognition.stop();
    } else {
      try {
        window.recognition.start();
      } catch (error) {
        console.error('Ошибка голосового поиска:', error);
      }
    }
  } else {
    Swal.fire({
      icon: 'warning',
      title: 'Не поддерживается',
      text: 'Ваш браузер не поддерживает голосовой поиск',
      timer: 3000
    });
  }
};
