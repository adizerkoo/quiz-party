/* =========================================
   МОДАЛЬНОЕ ОКНО «Войти в игру»
   Открытие с анимацией, закрытие с fade-out,
   показ ошибок полей, закрытие по оверлею.
========================================= */


// Открытие модалки с анимацией
function openJoinModal() {
    const modal = document.getElementById('join-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Плавный fade-in оверлея
    modal.style.opacity = '0';
    requestAnimationFrame(() => {
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '1';
    });

    const roomCodeInput = document.getElementById('room-code');
    if (roomCodeInput) roomCodeInput.focus();
}


// Закрытие модалки с fade-out
function closeJoinModal() {
    const modal = document.getElementById('join-modal');
    if (!modal) return;

    const card = modal.querySelector('.light-glass-card');

    // Анимация выхода
    modal.style.transition = 'opacity 0.25s ease';
    modal.style.opacity = '0';
    if (card) {
        card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
        card.style.transform = 'translateY(20px) scale(0.97)';
        card.style.opacity = '0';
    }

    setTimeout(() => {
        modal.style.display = 'none';
        // Сбрасываем стили для повторного открытия
        if (card) {
            card.style.transition = '';
            card.style.transform = '';
            card.style.opacity = '';
        }
        modal.style.transition = '';
        modal.style.opacity = '';

        // Сброс подсветки ошибок
        ['field-code'].forEach(id => {
            const field = document.getElementById(id);
            if (field) field.classList.remove('error-active', 'error-shake');
        });

        // Скрытие текстов ошибок
        ['hint-code'].forEach(id => {
            const hint = document.getElementById(id);
            if (hint) hint.style.display = 'none';
        });
    }, 250);
}


// Закрытие по клику на оверлей (вне карточки)
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('join-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeJoinModal();
        });
    }
});


// Показ ошибки на конкретном поле с тряской и вибрацией
function showFieldError(field, hint, message) {
    field.classList.add('error-active', 'error-shake');

    if (hint) {
        hint.innerText = message;
        hint.style.display = 'block';
    }

    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

    // Убираем тряску, чтобы можно было тряхнуть ещё раз
    setTimeout(() => {
        field.classList.remove('error-shake');
    }, 400);
}
