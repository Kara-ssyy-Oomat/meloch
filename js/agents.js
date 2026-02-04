// ===== СИСТЕМА АГЕНТОВ (2% комиссия) =====

// Текущий агент (хранится в localStorage)
let currentAgent = null;

// ГЛОБАЛЬНАЯ функция закрытия ВСЕХ окон агентов
window.closeAllAgentModals = function() {
  const modalIds = [
    'agentProfitModal',
    'agentClientsListModal',
    'agentAuthModal'
  ];
  
  modalIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  // Разблокируем прокрутку
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.documentElement.style.overflow = '';
  
  if (typeof unlockPageScroll === 'function') {
    unlockPageScroll();
  }
};

// Закрытие по Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    window.closeAllAgentModals();
  }
});

// Загрузка агента при старте
function loadAgentFromStorage() {
  try {
    const saved = localStorage.getItem('currentAgent');
    if (saved) {
      currentAgent = JSON.parse(saved);
      updateAgentButton();
    }
  } catch(e) {
    console.error('Ошибка загрузки агента:', e);
  }
}

// Обновление кнопки агента
function updateAgentButton() {
  const btn = document.getElementById('agentBtn');
  if (!btn) return;
  
  if (currentAgent) {
    btn.innerHTML = ' Моя прибыль';
    btn.style.background = 'linear-gradient(135deg, #4caf50, #388e3c)';
  } else {
    btn.innerHTML = ' Стать агентом';
    btn.style.background = 'linear-gradient(135deg, #9c27b0, #7b1fa2)';
  }
}

// Открытие страницы агента
function openAgentModal() {
  // Перенаправляем на отдельную страницу агента
  window.location.href = 'agent-profit.html';
}

// Закрытие модального окна авторизации (для совместимости)
function closeAgentAuthModal() {
  const modal = document.getElementById('agentAuthModal');
  if (modal) modal.style.display = 'none';
  if (typeof unlockPageScroll === 'function') unlockPageScroll();
}

// Закрытие окна прибыли (для совместимости)
function closeAgentProfitModal() {
  const modal = document.getElementById('agentProfitModal');
  if (modal) modal.style.display = 'none';
  if (typeof unlockPageScroll === 'function') unlockPageScroll();
}

// Инициализация системы агентов при загрузке
document.addEventListener('DOMContentLoaded', function() {
  loadAgentFromStorage();
});

// ===== КОНЕЦ СИСТЕМЫ АГЕНТОВ =====
