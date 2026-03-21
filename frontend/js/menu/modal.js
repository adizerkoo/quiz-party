/* =========================================
   МОДАЛЬНОЕ ОКНО «Войти в игру»
   Открытие, закрытие, показ ошибок полей.
========================================= */


// Открытие модалки с автофокусом на имя
function openJoinModal() {
    const modal = document.getElementById('join-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('player-name').focus();
    }
}


// Закрытие модалки и сброс ошибок
function closeJoinModal() {
    const modal = document.getElementById('join-modal');
    if (modal) modal.style.display = 'none';

    // Сброс подсветки ошибок
    ['field-name', 'field-code'].forEach(id => {
        const field = document.getElementById(id);
        if (field) field.classList.remove('error-active', 'error-shake');
    });

    // Скрытие текстов ошибок
    ['hint-name', 'hint-code'].forEach(id => {
        const hint = document.getElementById(id);
        if (hint) hint.style.display = 'none';
    });
}


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
