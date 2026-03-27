/* =========================================
   JOIN FLOW
   Вход в игру по коду с уже сохранённым профилем пользователя.
========================================= */


async function startJoining() {
    const codeInput = document.getElementById('room-code');
    const fieldCode = document.getElementById('field-code');
    const hintCode = document.getElementById('hint-code');

    const profile = window.QuizUserProfile?.getStoredUserProfile?.();
    if (!profile) {
        if (typeof openProfileModal === 'function') {
            openProfileModal({ locked: true });
        }
        return;
    }

    const code = codeInput.value.trim().toUpperCase();
    codeInput.value = code;

    if (fieldCode) {
        fieldCode.classList.remove('error-active', 'error-shake');
    }
    if (hintCode) {
        hintCode.style.display = 'none';
    }

    if (!code) {
        showFieldError(fieldCode, hintCode, 'Введите код комнаты 🔑');
        return;
    }

    try {
        const response = await fetch(`/api/v1/quizzes/${encodeURIComponent(code)}`);
        if (!response.ok) {
            showFieldError(fieldCode, hintCode, 'Такой комнаты не существует 🔍');
            return;
        }

        const quiz = await response.json();
        if (quiz.status === 'cancelled') {
            showFieldError(fieldCode, hintCode, 'Эта игра уже отменена 🛑');
            return;
        }

        window.QuizUserProfile?.setPlayerSessionFromProfile?.(profile);
        window.location.href = `game.html?room=${encodeURIComponent(code)}&role=player`;
    } catch (error) {
        showFieldError(fieldCode, hintCode, 'Ошибка сервера. Попробуй позже 🛠');
    }
}
