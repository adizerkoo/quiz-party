/* =========================================
   ИНИЦИАЛИЗАЦИЯ (DOMContentLoaded)
   Загрузка сохранённых данных, подключение
   слушателей, запуск автосохранения.
========================================= */


// === Главная инициализация при загрузке страницы ===
document.addEventListener("DOMContentLoaded", () => {

    // ======= 1️⃣ Загружаем сохранённые вопросы =======
    const savedQuestions = localStorage.getItem('quizQuestions');
    if (savedQuestions) {
        quizQuestions = JSON.parse(savedQuestions);
        renderQuestions();
    }

    // ======= 2️⃣ Загружаем черновик формы =======
    const draft = localStorage.getItem('quizDraft');
    if (draft) {
        const d = JSON.parse(draft);

        // Название вечеринки
        document.getElementById('quiz-title-input').value = d.title || '';

        // Текст вопроса
        document.getElementById('q-input-text').value = d.questionText || '';

        // Тип вопроса
        selectType(
            d.type || 'text',
            d.type === 'options'
                ? document.querySelectorAll('.type-option')[1]
                : document.querySelectorAll('.type-option')[0]
        );

        // Текстовый правильный ответ
        document.getElementById('q-input-correct').value = d.correctText || '';

        // Варианты ответа
        d.options.forEach((opt, i) => {
            const el = document.getElementById(`opt-${i + 1}`);
            if (el) el.value = opt;
        });

        // Выбранный правильный вариант
        const radios = document.querySelectorAll('input[name="correct-opt"]');
        if (radios[d.selectedIndex]) radios[d.selectedIndex].checked = true;

        // Подсветка и кнопки очистки
        updateCorrectHighlight();
        updateClearButtons();
    }

    // ======= 3️⃣ Загружаем библиотеку вопросов =======
    fetch('/data/questions.json')
        .then(res => res.json())
        .then(data => {
            questionsLibrary = data;
            filterLibrary("all");
            changeIdea();
            setInterval(changeIdea, 4000);
        })
        .catch(err => console.error("Не удалось загрузить questions.json", err));

    // ======= 4️⃣ Автосохранение черновика при вводе =======
    document.addEventListener("input", (e) => {
        if (
            ['quiz-title-input', 'q-input-text', 'q-input-correct', 'opt-1', 'opt-2', 'opt-3', 'opt-4'].includes(e.target.id) ||
            e.target.name === 'correct-opt'
        ) {
            saveDraftToLocal();
        }
    });

    // ======= 5️⃣ Слушатели для идеи =======
    const ideaContainer = document.getElementById("idea-container");
    if (ideaContainer) ideaContainer.onclick = insertIdea;

    const refreshBtn = document.getElementById("refresh-idea");
    if (refreshBtn) {
        refreshBtn.onclick = (e) => {
            e.preventDefault();
            changeIdea();
        };
    }

    // ======= 6️⃣ Подсветка правильного варианта при старте =======
    updateCorrectHighlight();
});


// === Подсветка при переключении правильного варианта ===
document.addEventListener('change', (e) => {
    if (e.target.name === 'correct-opt') {
        updateCorrectHighlight();
    }
});


// === Показ/скрытие кнопки очистки в полях ввода ===
document.addEventListener("input", (e) => {
    if (
        e.target.classList.contains("opt-input") ||
        e.target.classList.contains("text-correct-input")
    ) {
        const wrapper = e.target.closest(".input-with-clear");
        const clearBtn = wrapper.querySelector(".clear-input");
        if (clearBtn) {
            clearBtn.style.display = e.target.value ? "block" : "none";
        }
    }
});


// === Запрет зума через жесты ===
document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) {
        event.preventDefault();
    }
}, { passive: false });


// === Запрет зума через двойной тап ===
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
