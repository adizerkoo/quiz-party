let quizQuestions = [];

// 3. Профессиональные уведомления вместо алертов
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// 1. Функция переключения типов
function selectType(type, element) {
    document.getElementById('q-input-type').value = type;
    document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
    
    const fields = document.getElementById('options-fields');
    const correctZone = document.getElementById('correct-answer-zone');
    
    if (type === 'options') {
        fields.style.display = 'block';
        correctZone.style.display = 'none';
    } else {
        fields.style.display = 'none';
        correctZone.style.display = 'block';
    }
}

function addQuestionToList() {
    const textEl = document.getElementById('q-input-text');
    const type = document.getElementById('q-input-type').value;
    let correct = "";
    let options = [];

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
        for (let i = 1; i <= 4; i++) {
            const val = document.getElementById(`opt-${i}`).value.trim();
            if (!val) {
                showToast(`Заполните вариант ${i}!`);
                return;
            }
            options.push(val);
        }
        const selectedIndex = document.querySelector('input[name="correct-opt"]:checked').value;
        correct = options[parseInt(selectedIndex)];
    }

    quizQuestions.push({
        text: textEl.value.trim(),
        type: type,
        correct: correct,
        options: type === 'options' ? options : null
    });

    renderQuestions();
    clearForm();
    showToast("Вопрос добавлен!");
}

function renderQuestions() {
    const list = document.getElementById('questions-list');
    const countEl = document.getElementById('q-count');
    list.innerHTML = "";
    countEl.innerText = quizQuestions.length;
    quizQuestions.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = "question-item-complex";
        div.innerHTML = `
            <div class="q-header">
                <b>${index + 1}. ${q.text}</b>
                <button onclick="removeQuestion(${index})" class="btn-remove" style="background:none; border:none; color:red; cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:0.8rem; opacity:0.7;">Тип: ${q.type} | Ответ: ${q.correct}</div>
        `;
        list.appendChild(div);
    });
}

function clearForm() {
    document.getElementById('q-input-text').value = "";
    document.getElementById('q-input-correct').value = "";
    document.querySelectorAll('.opt-input').forEach(i => i.value = "");
}

function removeQuestion(index) {
    quizQuestions.splice(index, 1);
    renderQuestions();
}

function generateRoomCode() {
    return 'QUIZ-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

async function saveAndGo() {
    const quizTitle = document.getElementById('quiz-title-input').value.trim();
    
    if (!quizTitle) {
        showToast("Введите название вечеринки!");
        return;
    }
    
    if (quizQuestions.length === 0) {
        showToast("Добавьте хотя бы один вопрос!");
        return;
    }

    const roomCode = generateRoomCode();
    const quizData = { title: quizTitle, code: roomCode, questions: quizQuestions };

    try {
        const response = await fetch('http://127.0.0.1:8000/api/quizzes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quizData),
        });

        if (response.ok) {
            // 5. Никаких алертов, сразу в игру
            localStorage.setItem('current_quiz', JSON.stringify(quizQuestions));
            window.location.href = `game.html?role=host&room=${roomCode}`;
        } else {
            showToast("Ошибка сохранения!");
        }
    } catch (error) {
        showToast("Ошибка соединения с сервером!");
    }
}