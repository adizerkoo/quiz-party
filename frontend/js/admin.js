let quizQuestions = [];
let editIndex = -1; // Индекс редактируемого вопроса

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

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
}

function renderQuestions() {
    const list = document.getElementById('questions-list');
    const countEl = document.getElementById('q-count');
    list.innerHTML = "";
    countEl.innerText = quizQuestions.length;

    quizQuestions.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = "question-item-complex";

        let answersHtml = "";
        if (q.type === 'options') {
            answersHtml = `<div class="preview-options-grid">`;
            q.options.forEach(opt => {
                const isCorrect = opt === q.correct;
                answersHtml += `<div class="preview-opt-item ${isCorrect ? 'is-correct' : ''}">${opt} ${isCorrect ? '✓' : ''}</div>`;
            });
            answersHtml += `</div>`;
        } else {
            answersHtml = `<div class="preview-correct-text">Правильный ответ: ${q.correct}</div>`;
        }

        div.innerHTML = `
            <div class="q-header-row">
                <div style="flex: 1; padding-right: 20px;">
                    <b style="color: #6c5ce7; font-size: 1.1rem;">${index + 1}. ${q.text}</b>
                </div>
                <div class="q-actions">
                    <button class="action-btn btn-edit" onclick="editQuestion(${index})" title="Редактировать">✏️</button>
                    <button class="action-btn btn-delete" onclick="removeQuestion(${index})" title="Удалить">🗑️</button>
                </div>
            </div>
            ${answersHtml}
        `;
        list.appendChild(div);
    });
}

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
    // Сброс типа на дефолтный (Выбор)
    selectType('options', document.querySelectorAll('.type-option')[1]);
}

function removeQuestion(index) {
    quizQuestions.splice(index, 1);
    renderQuestions();
    showToast("Вопрос удален");
}

async function saveAndGo() {
    const title = document.getElementById('quiz-title-input').value.trim();
    if (!title) { showToast("Введите название вечеринки!"); return; }
    if (quizQuestions.length === 0) { showToast("Добавьте вопросы!"); return; }

    const roomCode = 'PARTY-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    try {
        const response = await fetch('http://127.0.0.1:8000/api/quizzes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, code: roomCode, questions: quizQuestions }),
        });
        if (response.ok) {
            window.location.href = `game.html?role=host&room=${roomCode}`;
        }
    } catch (e) { showToast("Ошибка сервера"); }
}