/**
 * @file utils.js
 * @description Вспомогательные функции для работы с UI элементами и общие утилиты
 * @module handlers/utils
 */

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} str - Raw string to escape
 * @returns {string} Escaped string safe for innerHTML
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Переключает видимость элемента разбора вопросов в аккордеоне
 * @param {HTMLElement} element - Элемент шапки аккордеона
 * @returns {void}
 * 
 * @example
 * // HTML: <div class="review-acc-header" onclick="toggleReview(this)">
 * toggleReview(element) // переключает видимость content и поворачивает стрелку
 */
function toggleReview(element) {
  const content = document.getElementById('review-content');
  
  // Переключаем класс у контента для показа/скрытия
  content.classList.toggle('active');
  
  // Переключаем класс у самой шапки для анимации стрелки
  element.classList.toggle('is-active');
}

/**
 * Спавнит конфетти при клике на карточку победителя
 * @param {Event} event - Event объект клика
 * @returns {void}
 */
function spawnConfetti(event) {
  const duration = 2 * 1000; // 2 секунды
  const end = Date.now() + duration;
  
  const rect = event.target.getBoundingClientRect();
  const centerX = (rect.left + rect.right) / 2 / window.innerWidth;
  const centerY = rect.top / window.innerHeight;

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 45 + Math.random() * 90,
      spread: 60,
      origin: { x: centerX, y: centerY },
      colors: ['#FFD700', '#f175ff', '#43fff2']
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
}

/**
 * Показывает современный диалог подтверждения с красивым модальным окном
 * @param {string} message - Текст сообщения (опционально)
 * @param {Function} onConfirm - Callback при подтверждении
 * @returns {void}
 * 
 * @example
 * showModernConfirm("", () => {
 *   proceedToNext();
 * });
 */
let _currentConfirmHandler = null;

function showModernConfirm(message, onConfirm) {
  const overlay = document.getElementById("confirm-overlay");
  const confirmBtn = document.getElementById("confirm-proceed-btn");
  
  if (!overlay || !confirmBtn) {
    // Fallback если элементы не найдены
    console.warn("⚠️ Modal overlay not found, using browser confirm()");
    if (confirm(message)) {
      onConfirm();
    }
    return;
  }

  // Удаляем предыдущий обработчик, чтобы не накапливались
  if (_currentConfirmHandler) {
    confirmBtn.removeEventListener("click", _currentConfirmHandler);
  }

  // Показываем модальное окно
  overlay.style.display = "flex";

  // Обработчик для кнопки "ДА, ДАЛЬШЕ"
  _currentConfirmHandler = () => {
    overlay.style.display = "none";
    confirmBtn.removeEventListener("click", _currentConfirmHandler);
    _currentConfirmHandler = null;
    onConfirm();
  };

  confirmBtn.addEventListener("click", _currentConfirmHandler);
}
