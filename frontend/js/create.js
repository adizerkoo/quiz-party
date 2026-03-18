let quizQuestions = [];
let editIndex = -1;

let questionsLibrary = [];
let currentIdea = null;

function changeIdea() {

    if (!questionsLibrary.length) return;

    const ideaText = document.getElementById("random-idea-text");

    ideaText.style.opacity = 0;
    ideaText.style.transform = "translateY(5px)";

    setTimeout(() => {

        let randomIndex;

        do {
            randomIndex = Math.floor(Math.random() * questionsLibrary.length);
        } 
        while (questionsLibrary.length > 1 && questionsLibrary[randomIndex] === currentIdea);

        currentIdea = questionsLibrary[randomIndex];

        ideaText.textContent = currentIdea.text;

        ideaText.style.opacity = 1;
        ideaText.style.transform = "translateY(0)";

    },200);

}


fetch('/data/questions.json')
    .then(res => res.json())
    .then(data => {
        questionsLibrary = data;

        renderLibrary("all");
        changeIdea();
    })
    .catch(err => {
        console.error("Не удалось загрузить questions.json", err);
    });

function insertIdea() {

    if (!currentIdea) return;

    const questionInput = document.getElementById("q-input-text");
    const typeOptions = document.querySelectorAll(".type-option");

    if (questionInput) {
        questionInput.value = currentIdea.text;

        // эффект вставки
        questionInput.classList.add("idea-inserted");

        setTimeout(() => {
            questionInput.classList.remove("idea-inserted");
        }, 800);
    }

    if (currentIdea.type === "text") {

        selectType("text", typeOptions[0]);

        const correctInput = document.getElementById("q-input-correct");

        if (correctInput) {
            correctInput.value = currentIdea.correct || "";
        }

    } else if (currentIdea.type === "options") {

        selectType("options", typeOptions[1]);

        currentIdea.options.forEach((opt, i) => {

            const input = document.getElementById(`opt-${i+1}`);

            if (input) input.value = opt;

            const radios = document.querySelectorAll('input[name="correct-opt"]');

            if (radios[i] && opt === currentIdea.correct) {
                radios[i].checked = true;
            }

        });
        updateCorrectHighlight();
    }
    updateClearButtons();
    // === Сохраняем черновик после вставки ===
    saveDraftToLocal();
}


document.addEventListener("DOMContentLoaded", () => {

    // ======= 1️⃣ Загружаем сохраненные вопросы =======
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
            d.type === 'options' ? document.querySelectorAll('.type-option')[1] : document.querySelectorAll('.type-option')[0]
        );

        // Текст правильного ответа для type=text
        document.getElementById('q-input-correct').value = d.correctText || '';

        // Варианты для type=options
        d.options.forEach((opt, i) => {
            const el = document.getElementById(`opt-${i+1}`);
            if (el) el.value = opt;
        });

        // Выбранный правильный вариант
        const radios = document.querySelectorAll('input[name="correct-opt"]');
        if (radios[d.selectedIndex]) radios[d.selectedIndex].checked = true;

        // Подсветка правильного варианта и кнопки очистки
        updateCorrectHighlight();
        updateClearButtons();
    }

    // ======= 3️⃣ Загружаем библиотеку вопросов =======
    fetch('/data/questions.json')
        .then(res => res.json())
        .then(data => {
            questionsLibrary = data;
            renderLibrary("all");
            changeIdea();
            setInterval(changeIdea, 4000);
        })
        .catch(err => console.error("Не удалось загрузить questions.json", err));

    // ======= 4️⃣ Автосохранение черновика при вводе =======
    document.addEventListener("input", (e) => {
        if (['quiz-title-input', 'q-input-text', 'q-input-correct', 'opt-1','opt-2','opt-3','opt-4'].includes(e.target.id) ||
            e.target.name === 'correct-opt') {
            saveDraftToLocal();
        }
    });

    // ======= 5️⃣ Слушатели для идеи и смены идеи =======
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

function renderLibrary(category="all") {

    const container = document.getElementById("library-list");

    container.innerHTML = "";

    const filtered = category === "all"
        ? questionsLibrary
        : questionsLibrary.filter(q => q.cat === category);

    filtered.forEach(q => {

        const item = document.createElement("div");

        item.className = "library-item";

        item.innerHTML = `
            <b>${q.text}</b>
            <div class="library-answer-preview">
                Ответ: ${q.correct}
            </div>
        `;

        item.onclick = () => importQuestion(q);

        container.appendChild(item);

    });

}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Исправленная функция выбора типа
function selectType(type, element) {
    const typeInput = document.getElementById('q-input-type');
    if (typeInput) typeInput.value = type;

    // Убираем активный класс у всех и добавляем текущему
    document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('active'));
    if (element) element.classList.add('active');
    
    const fields = document.getElementById('options-fields');
    const correctZone = document.getElementById('correct-answer-zone');
    
    if (type === 'options') {
        if (fields) fields.style.display = 'block';
        if (correctZone) correctZone.style.display = 'none';
    } else {
        if (fields) fields.style.display = 'none';
        if (correctZone) correctZone.style.display = 'block';
    }
}

function addQuestionToList() {
    const textEl = document.getElementById('q-input-text');
    const typeEl = document.getElementById('q-input-type');
    
    if (!textEl || !typeEl) {
        console.error("Не найдены поля ввода текста или типа вопроса");
        return;
    }

    const type = typeEl.value;
    let correct = "";
    let options = []; // ОБЯЗАТЕЛЬНО инициализируем массив здесь

    // Проверка самого вопроса
    if (!textEl.value.trim()) {
        showToast("Введите текст вопроса!");
        return;
    }

    if (type === 'text') {
        correct = document.getElementById('q-input-correct').value.trim();
        if (!correct) {
            showToast("Укажите правильный ответ!");
            return;
        }
    } else {
        // Логика для типа 'options'
        for (let i = 1; i <= 4; i++) {
            const val = document.getElementById(`opt-${i}`).value.trim();
            if (!val) {
                showToast(`Заполните вариант ${i}!`);
                return;
            }
            options.push(val);
        }
        
        const selectedRadio = document.querySelector('input[name="correct-opt"]:checked');
        if (!selectedRadio) {
            showToast("Выберите правильный вариант!");
            return;
        }
        const selectedIndex = parseInt(selectedRadio.value);
        correct = options[selectedIndex];
    }

    const questionData = {
        text: textEl.value.trim(),
        type: type,
        correct: correct,
        options: type === 'options' ? options : null
    };

    if (editIndex > -1) {
        quizQuestions[editIndex] = questionData;
        editIndex = -1;
        document.getElementById('add-btn').innerText = "ДОБАВИТЬ ВОПРОС";
        showToast("Вопрос обновлен!");
    } else {
        quizQuestions.push(questionData);
        showToast("Вопрос добавлен!");
    }

    renderQuestions();
    clearForm();

    // Сохраняем текущие вопросы и название вечеринки в localStorage
    localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));
    localStorage.setItem('quizTitle', document.getElementById('quiz-title-input').value.trim());
}

function renderQuestions() {
    const list = document.getElementById('questions-list');
    const countEl = document.getElementById('q-count');
    const listZone = document.querySelector('.list-zone');

    list.innerHTML = "";
    countEl.innerText = quizQuestions.length;

    // Если нет вопросов — скрываем весь блок
    if (quizQuestions.length === 0) {
        listZone.style.display = "none";
        return;
    } else {
        listZone.style.display = "block";
    }

    quizQuestions.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = "question-row";

        let answersHtml = "";
        if (q.type === 'options') {
            answersHtml = `<div class="preview-options-grid">`;
            q.options.forEach(opt => {
                const isCorrect = opt === q.correct;
                answersHtml += `<div class="preview-opt-item ${isCorrect ? 'is-correct' : ''}">${opt} ${isCorrect ? '<i class="fa fa-check"></i>' : ''}</div>`;
            });
            answersHtml += `</div>`;
        } else {
            answersHtml = `<div class="preview-correct-text">Ответ: ${q.correct}</div>`;
        }

        div.innerHTML = `
        <div class="question-card">

            <div class="question-top">
                <div class="question-number">${index + 1}</div>

                <div class="question-text">
                    ${q.text}
                </div>

                <div class="question-actions">
                    <button class="action-btn btn-edit" onclick="editQuestion(${index})">
                        <i class="fa fa-pen"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="removeQuestion(${index})">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>

            ${answersHtml}

        </div>
        `;
        list.appendChild(div);
    });
}

document.getElementById("idea-container").onclick = () => {

    if (!currentIdea) return;

    document.getElementById("q-input-text").value = currentIdea.text;

    if (currentIdea.type === "options") {

        currentIdea.options.forEach((opt, i) => {
            const el = document.getElementById(`opt-${i+1}`);
            if (el) el.value = opt;

            if (opt === currentIdea.correct) {
                document.querySelectorAll('input[name="correct-opt"]')[i].checked = true;
            }
        });

    } else {

        document.getElementById("q-input-correct").value = currentIdea.correct;
    }

};


function editQuestion(index) {
    const q = quizQuestions[index];
    editIndex = index;

    // Заполняем форму данными вопроса
    document.getElementById('q-input-text').value = q.text;
    
    // Переключаем тип
    const typeOptions = document.querySelectorAll('.type-option');
    if (q.type === 'text') {
        selectType('text', typeOptions[0]);
        document.getElementById('q-input-correct').value = q.correct;
    } else {
        selectType('options', typeOptions[1]);
        q.options.forEach((opt, i) => {
            document.getElementById(`opt-${i+1}`).value = opt;
            if (opt === q.correct) {
                document.querySelectorAll('input[name="correct-opt"]')[i].checked = true;
            }
        });
    }

    document.getElementById('add-btn').innerText = "СОХРАНИТЬ ИЗМЕНЕНИЯ";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearForm() {
    document.getElementById('q-input-text').value = "";
    document.getElementById('q-input-correct').value = "";
    document.querySelectorAll('.opt-input').forEach(i => i.value = "");
    
    // Сброс на "Текст" по умолчанию
    const typeOptions = document.querySelectorAll('.type-option');
    if (typeOptions.length > 0) {
        selectType('text', typeOptions[0]);
    }
    updateCorrectHighlight();
    updateClearButtons();
}

function removeQuestion(index) {
    quizQuestions.splice(index, 1);
    renderQuestions();
    showToast("Вопрос удален");
}

// Проверь saveAndGo, чтобы не было ошибок если сервер упал
async function saveAndGo() {
    const title = document.getElementById('quiz-title-input').value.trim();
    if (!title) { showToast("Введите название вечеринки!"); return; }
    if (quizQuestions.length === 0) { showToast("Добавьте хотя бы один вопрос!"); return; }

    const roomCode = 'PARTY-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    // Сначала пробуем отправить, если не вышло — ловим ошибку
    try {
        const response = await fetch('/api/quizzes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, code: roomCode, questions: quizQuestions }),
        });
        
        if (response.ok) {
            // Очистка кеша перед запуском игры
            localStorage.removeItem('quizQuestions');
            localStorage.removeItem('quizTitle');

            window.location.href = `game.html?role=host&room=${roomCode}`;
        } else {
             showToast("Сервер не принял данные");
        }
    } catch (e) {
        console.error("Server error:", e);
        showToast("Backend не запущен! Проверь Python.");
    }
}

// Запрет зума через жесты
document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) { 
        event.preventDefault(); 
    }
}, { passive: false });

// Запрет зума через двойной тап
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);


// Функция для обновления визуальной подсветки правильного варианта
function updateCorrectHighlight() {
    document.querySelectorAll('.opt-create-row').forEach((row, index) => {
        const radio = row.querySelector('input[name="correct-opt"]');
        if (radio && radio.checked) {
            row.classList.add('correct-selected');
        } else {
            row.classList.remove('correct-selected');
        }
    });
}

// Делегирование события: вешаем один слушатель на всю зону вариантов
document.addEventListener('change', (e) => {
    if (e.target.name === 'correct-opt') {
        updateCorrectHighlight();
    }
});

// Вызываем один раз при загрузке, чтобы подсветить вариант по умолчанию
document.addEventListener('DOMContentLoaded', () => {
    updateCorrectHighlight();
});

//Идет код с  библиотекой



function toggleLibrary() {
    const modal = document.getElementById('library-modal');
    const body = document.body;
    const isVisible = modal.style.display === 'flex';
    
    if (isVisible) {
        modal.style.display = 'none';
        body.classList.remove('modal-open'); // Включаем скролл сайта обратно
    } else {
        modal.style.display = 'flex';
        body.classList.add('modal-open');    // Отключаем скролл сайта
        filterLibrary('all');
    }
}

function filterLibrary(category) {
    const container = document.getElementById('library-list');
    if (!container) return;

    // 1. Переключаем подсветку кнопок
    document.querySelectorAll('.filter-btn').forEach(btn => {
        // Проверяем совпадение атрибута data-category с выбранной категорией
        if (btn.getAttribute('data-category') === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 2. Очищаем список
    container.innerHTML = "";

    // 3. Фильтруем и отрисовываем вопросы
    const filtered = category === 'all' 
        ? questionsLibrary 
        : questionsLibrary.filter(q => q.cat === category);

    filtered.forEach(q => {
        const item = document.createElement('div');
        item.className = 'library-item';
        
        const typeMarkup = q.type === 'text' 
            ? `<i class="fa-solid fa-pen"></i> Текст` 
            : `<i class="fa-solid fa-circle-dot"></i> Выбор`;

        item.innerHTML = `
            <div class="library-item-content">
                <span class="library-tag">${typeMarkup}</span>
                <b>${q.text}</b>
                <div class="library-answer-preview">
                    <i class="fa-solid fa-check-double"></i> Ответ: ${q.correct}
                </div>
            </div>
        `;
        
        item.onclick = () => {
            importQuestion(q);
            toggleLibrary();
        };
        container.appendChild(item);
    });

    // Скроллим список вверх при смене категории
    container.scrollTop = 0;
}

function importQuestion(q) {
    const questionInput = document.getElementById('q-input-text');
    const typeOptions = document.querySelectorAll('.type-option');
    const typeInput = document.getElementById('q-input-type');

    const inputField = document.getElementById('q-input-text');
    inputField.value = q.text;

    // 2. Добавляем эффект вспышки (тот же, что и для рандомных идей)
    inputField.classList.remove('idea-inserted'); // Сбрасываем, если была
    void inputField.offsetWidth; // Магия для перезапуска анимации (reflow)
    inputField.classList.add('idea-inserted');

    if (!questionInput || !typeInput) return;

    questionInput.value = q.text;

    // Переключаем тип
    selectType(q.type, q.type === 'text' ? typeOptions[0] : typeOptions[1]);

    if (q.type === 'text') {
        document.getElementById('q-input-correct').value = q.correct || '';
    } else if (q.type === 'options') {
        q.options.forEach((opt, i) => {
            const optInput = document.getElementById(`opt-${i+1}`);
            if (optInput) optInput.value = opt;
        });
        // Отмечаем правильный вариант
        const radios = document.querySelectorAll('input[name="correct-opt"]');
        radios.forEach((r, i) => r.checked = (q.options[i] === q.correct));

        updateCorrectHighlight();
    }

    setTimeout(() => {
        inputField.classList.remove('idea-inserted');
    }, 800);
    updateClearButtons();

    // === Сохраняем черновик после вставки ===
    saveDraftToLocal();
}

function clearOptions() {
    document.querySelectorAll('.opt-input').forEach(input => {
        input.value = "";
    });

    // сбрасываем радиокнопку на первую
    const radios = document.querySelectorAll('input[name="correct-opt"]');
    if (radios.length) radios[0].checked = true;

    updateCorrectHighlight();
}


function updateClearButtons() {
    document.querySelectorAll(".opt-input, .text-correct-input").forEach(input => {
        const wrapper = input.closest(".input-with-clear");
        const clearBtn = wrapper.querySelector(".clear-input");

        if (clearBtn) {
            clearBtn.style.display = input.value ? "block" : "none";
        }
    });
}

document.addEventListener("input", (e) => {
    if (e.target.classList.contains("opt-input") || 
        e.target.classList.contains("text-correct-input")) {

        const wrapper = e.target.closest(".input-with-clear");
        const clearBtn = wrapper.querySelector(".clear-input");

        if (clearBtn) {
            clearBtn.style.display = e.target.value ? "block" : "none";
        }
    }
});

function clearSingleInput(el) {
    const input = el.previousElementSibling;
    input.value = "";
    el.style.display = "none";
}


function saveDraftToLocal() {
    const title = document.getElementById('quiz-title-input').value.trim();

    // Текущий черновик вопроса
    const questionText = document.getElementById('q-input-text').value.trim();
    const type = document.getElementById('q-input-type').value;
    const correctText = document.getElementById('q-input-correct').value.trim();
    const options = [];

    for (let i = 1; i <= 4; i++) {
        const val = document.getElementById(`opt-${i}`).value.trim();
        options.push(val);
    }

    const selectedRadio = document.querySelector('input[name="correct-opt"]:checked');
    const selectedIndex = selectedRadio ? parseInt(selectedRadio.value) : 0;

    // ===== Сохраняем уже добавленные вопросы =====
    localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));

    // ===== Сохраняем черновик текущего вопроса + название вечеринки =====
    localStorage.setItem('quizDraft', JSON.stringify({
        title,
        questionText,
        type,
        correctText,
        options,
        selectedIndex
    }));
}