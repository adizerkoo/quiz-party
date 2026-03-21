/* =========================================
   ЛОГИКА ВХОДА В ИГРУ
   Валидация имени и кода комнаты,
   проверка существования комнаты на сервере.
========================================= */


async function startJoining() {
    const nameInput = document.getElementById('player-name');
    const codeInput = document.getElementById('room-code');

    // Контейнеры полей для подсветки
    const fieldName = document.getElementById('field-name');
    const fieldCode = document.getElementById('field-code');

    // Тексты подсказок
    const hintName = document.getElementById('hint-name');
    const hintCode = document.getElementById('hint-code');

    const name = nameInput.value.trim();
    const code = codeInput.value.trim();

    // Сброс всех ошибок перед новой проверкой
    [fieldName, fieldCode].forEach(f => f.classList.remove('error-active', 'error-shake'));
    [hintName, hintCode].forEach(h => h.style.display = 'none');

    // Проверка имени
    if (!name) {
        showFieldError(fieldName, hintName, "Как тебя называть? ✨");
        return;
    }

    // Проверка кода
    if (!code) {
        showFieldError(fieldCode, hintCode, "Введите код комнаты 🔑");
        return;
    }

    try {
        const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}`);
        if (response.ok) {
            sessionStorage.setItem('quiz_player_name', name);
            window.location.href = `game.html?room=${encodeURIComponent(code)}&role=player`;
        } else {
            showFieldError(fieldCode, hintCode, "Такой комнаты не существует 🔍");
        }
    } catch (e) {
        showFieldError(fieldCode, hintCode, "Ошибка сервера. Попробуй позже 🛠");
    }
}
