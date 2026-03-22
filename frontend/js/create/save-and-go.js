/* =========================================
   ЗАПУСК ВЕЧЕРИНКИ (saveAndGo)
   Валидация всех данных и отправка
   викторины на сервер, переход в игру.
========================================= */


async function saveAndGo() {
    const titleInput = document.getElementById('quiz-title-input');
    const title = titleInput.value.trim();

    // --- Проверка названия ---
    if (!title) {
        showToast("Введите название вечеринки!");
        titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        titleInput.focus();
        return;
    }

    // --- Проверка наличия вопросов ---
    if (quizQuestions.length === 0) {
        showToast("Добавьте хотя бы один вопрос!");
        const questionInput = document.getElementById('q-input-text');
        questionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        questionInput.focus();
        return;
    }

    // --- Проверка каждого вопроса ---
    for (let i = 0; i < quizQuestions.length; i++) {
        const q = quizQuestions[i];

        if (!q.text.trim()) {
            showToast(`Вопрос №${i + 1} не заполнен!`);
            renderQuestions();
            document.querySelectorAll('.question-row')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('q-input-text').focus();
            return;
        }

        if (q.type === 'text' && (!q.correct || !q.correct.trim())) {
            showToast(`Вопрос №${i + 1}: укажите правильный ответ!`);
            renderQuestions();
            document.querySelectorAll('.question-row')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('q-input-correct').focus();
            return;
        }

        if (q.type === 'options') {
            if (!q.options || q.options.some(opt => !opt.trim())) {
                showToast(`Вопрос №${i + 1}: заполните все варианты ответа!`);
                renderQuestions();
                document.querySelectorAll('.question-row')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (!q.correct || !q.options.includes(q.correct)) {
                showToast(`Вопрос №${i + 1}: выберите правильный вариант!`);
                renderQuestions();
                document.querySelectorAll('.question-row')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
    }

    // --- Создаём комнату и отправляем на сервер ---
    try {
        const response = await fetch('/api/v1/quizzes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, questions: quizQuestions }),
        });

        if (response.ok) {
            const data = await response.json();
            const roomCode = data.code;
            localStorage.removeItem('quizQuestions');
            localStorage.removeItem('quizTitle');
            localStorage.removeItem('quizDraft');
            window.location.href = `game.html?role=host&room=${roomCode}`;
        } else {
            showToast("Сервер не принял данные");
        }
    } catch (e) {
        console.error("Server error:", e);
        showToast("Backend не запущен! Проверь Python.");
    }
}
