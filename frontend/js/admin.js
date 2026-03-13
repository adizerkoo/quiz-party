// Функция для добавления своего пустого вопроса
function addNewQuestion() {
    const text = prompt("Введите ваш вопрос:");
    if (text) {
        const type = confirm("Это будет вопрос с вариантами ответов? (Ок - Да, Отмена - Просто поле ввода)") ? 'options' : 'text';
        quizQuestions.push({ text: text, type: type });
        renderQuestions();
    }
}

// Функция, которая берет массив и рисует его на экране
function renderQuestions() {
    const list = document.getElementById('questions-list');
    list.innerHTML = ""; // Сначала очищаем список, чтобы не дублировать

    quizQuestions.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = "question-item"; // Добавим стиль позже
        qDiv.innerHTML = `
            <span>${index + 1}. ${q.text} (${q.type === 'text' ? 'Текст' : '4 варианта'})</span>
            <button onclick="removeQuestion(${index})">❌</button>
        `;
        list.appendChild(qDiv);
    });
}

// Удаление вопроса
function removeQuestion(index) {
    quizQuestions.splice(index, 1);
    renderQuestions();
}


// Текущее состояние игры
let currentQuestionIndex = 0;

// Функция перехода от конструктора к самой игре
function finishCreate() {
    if (quizQuestions.length === 0) {
        alert("Добавьте хотя бы один вопрос!");
        return;
    }
    document.getElementById('screen-create').style.display = 'none';
    document.getElementById('screen-host-panel').style.display = 'block';
    startRiddle();
}

// Запуск текущего вопроса
function startRiddle() {
    const q = quizQuestions[currentQuestionIndex];
    document.getElementById('current-question-title').innerText = `Вопрос №${currentQuestionIndex + 1}`;
    document.getElementById('current-question-text').innerText = q.text;
    
    // Очищаем старые ответы перед новым вопросом
    document.getElementById('incoming-answers').innerHTML = "";

    console.log("Ведущий запустил вопрос:", q.text);
}

// Функция имитации: как будто пришел ответ от друга (для теста)
function debugSimulateAnswer(playerName, answerText) {
    const container = document.getElementById('incoming-answers');
    const answerRow = document.createElement('div');
    answerRow.className = "answer-row"; // Добавим стиль в admin.css
    answerRow.innerHTML = `
        <span><strong>${playerName}:</strong> ${answerText}</span>
        <div>
            <button onclick="markAnswer(this, true)" class="btn-check">✅</button>
            <button onclick="markAnswer(this, false)" class="btn-wrong">❌</button>
        </div>
    `;
    container.appendChild(answerRow);
}

// Обработка нажатия на ✅ или ❌
function markAnswer(buttonElement, isCorrect) {
    const row = buttonElement.parentElement.parentElement;
    row.style.opacity = "0.5";
    row.style.pointerEvents = "none"; // Чтобы нельзя было нажать дважды
    if (isCorrect) {
        row.style.borderLeft = "4px solid #39FF14";
        console.log("Организатор засчитал ответ!");
    } else {
        row.style.borderLeft = "4px solid #ff4b2b";
    }
}