let quizQuestions = [];

function toggleOptions() {
    const type = document.getElementById('q-input-type').value;
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
    const typeEl = document.getElementById('q-input-type');
    let correct = "";
    let options = [];

    if (!textEl.value.trim()) {
        alert("Напиши хотя бы короткий вопрос! 😊");
        return;
    }

    if (typeEl.value === 'text') {
        correct = document.getElementById('q-input-correct').value.trim();
        if (!correct) {
            alert("А какой правильный ответ? Напиши его!");
            return;
        }
    } else {
        for (let i = 1; i <= 4; i++) {
            const val = document.getElementById(`opt-${i}`).value.trim();
            if (!val) {
                alert(`Заполни вариант №${i}!`);
                return;
            }
            options.push(val);
        }
        const selectedIndex = document.querySelector('input[name="correct-opt"]:checked').value;
        correct = options[parseInt(selectedIndex)];
    }

    quizQuestions.push({
        text: textEl.value.trim(),
        type: typeEl.value,
        correct: correct,
        options: typeEl.value === 'options' ? options : null
    });

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
        
        let contentHtml = "";
        if (q.type === 'options') {
            contentHtml = `<div class="preview-options">`;
            q.options.forEach(opt => {
                const isCorrect = (opt.trim() === q.correct.trim());
                contentHtml += `<span class="preview-opt ${isCorrect ? 'is-correct' : ''}">${opt}</span>`;
            });
            contentHtml += `</div>`;
        } else {
            contentHtml = `<div class="preview-correct-text">Верный ответ: <span>${q.correct}</span></div>`;
        }

        div.innerHTML = `
            <div class="q-header">
                <b>${index + 1}. ${q.text}</b>
                <button onclick="removeQuestion(${index})" class="btn-remove">&times;</button>
            </div>
            ${contentHtml}
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

// Функция для генерации случайного кода комнаты (например, PARTY-123)
function generateRoomCode() {
    return 'QUIZ-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

async function saveAndGo() {
    if (quizQuestions.length === 0) {
        alert("Добавь хотя бы один вопрос для начала праздника! 🎉");
        return;
    }

    const roomCode = generateRoomCode();
    const quizTitle = prompt("Как назовем твой Квиз?", "День Рождения!");

    if (!quizTitle) return; // Если отменили ввод названия

    // Подготавливаем данные для API
    const quizData = {
        title: quizTitle,
        code: roomCode,
        questions: quizQuestions
    };

    try {
        // Отправляем данные на твой FastAPI бэкенд
        const response = await fetch('http://127.0.0.1:8000/api/quizzes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(quizData),
        });

        if (response.ok) {
            const result = await response.json();
            console.log("Квиз сохранен в БД:", result);
            
            // Сохраняем код комнаты и данные локально для перехода
            localStorage.setItem('current_room_code', roomCode);
            localStorage.setItem('current_quiz', JSON.stringify(quizQuestions));
            
            alert(`Ура! Квиз создан. Код комнаты: ${roomCode}`);
            window.location.href = `game.html?role=host&room=${roomCode}`;
        } else {
            const errorData = await response.json();
            alert("Ошибка при сохранении: " + errorData.detail);
        }
    } catch (error) {
        console.error("Ошибка сети:", error);
        alert("Не удалось связаться с сервером. Проверь, запущен ли uvicorn!");
    }
}