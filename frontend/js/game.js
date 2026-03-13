// 1. Инициализация сокетов
// Если сервер и фронтенд на одном порту, можно оставить пустые скобки или '/'
const socket = io(); 

let currentQuestions = [];
let currentStep = 0;

// Извлекаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const role = urlParams.get('role'); // 'host' или 'player'

/**
 * ЗАГРУЗКА ДАННЫХ
 */
async function loadQuizData() {
    if (!roomCode) {
        alert("Код комнаты потерялся! Вернись на главную 🏠");
        window.location.href = 'index.html';
        return;
    }

    try {
        // Тянем данные из твоего FastAPI
        const response = await fetch(`http://127.0.0.1:8000/api/quizzes/${roomCode}`);
        
        if (response.ok) {
            const data = await response.json();
            currentQuestions = data.questions_data;
            
            console.log("Квиз успешно загружен:", currentQuestions);
            
            // Сообщаем серверу, что мы зашли в конкретную комнату
            socket.emit('join_room', { room: roomCode });

            // Отрисовываем интерфейс
            if (role === 'host') {
                initHost();
            } else {
                initPlayer();
            }
        } else {
            alert("Комната не найдена! 🧐");
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Ошибка сети:", error);
        alert("Не удалось связаться с сервером базы данных.");
    }
}

/**
 * ЛОГИКА ВЕДУЩЕГО (HOST)
 */
function initHost() {
    document.getElementById('host-screen').style.display = 'flex';
    document.getElementById('player-screen').style.display = 'none';
    updateHostQuestion();
}

function updateHostQuestion() {
    const q = currentQuestions[currentStep];
    const textEl = document.getElementById('host-question-text');
    
    if (q) {
        textEl.innerText = q.text;
    } else {
        textEl.innerHTML = "Праздник окончен! 🥳<br><span style='font-size: 0.8rem; opacity: 0.5;'>Все вопросы пройдены</span>";
        document.getElementById('host-controls').style.display = 'none';
    }
}

// Вызывается при нажатии на кнопку "Следующий вопрос"
function nextQuestion() {
    if (currentStep < currentQuestions.length - 1) {
        // Отправляем сигнал на сервер, чтобы он переключил ВСЕХ
        socket.emit('next_question_signal', { room: roomCode });
    } else {
        // Если вопросов больше нет, тоже шлем сигнал финиша
        socket.emit('next_question_signal', { room: roomCode });
        alert("Это был последний вопрос!");
    }
}

/**
 * ЛОГИКА ИГРОКА (PLAYER)
 */
function initPlayer() {
    document.getElementById('player-screen').style.display = 'flex';
    document.getElementById('host-screen').style.display = 'none';
    renderPlayerQuestion();
}

function renderPlayerQuestion() {
    const q = currentQuestions[currentStep];
    const area = document.getElementById('player-answer-area');
    const title = document.getElementById('player-question-text');

    if (!q) {
        title.innerText = "Ура! Игра завершена! 🎉";
        area.innerHTML = "<p>Ждем, пока именинник объявит результаты!</p>";
        return;
    }

    title.innerText = q.text;
    area.innerHTML = ""; // Очищаем зону ответа

    if (q.type === 'options') {
        // Если тест — создаем сетку кнопок
        const grid = document.createElement('div');
        grid.className = "answer-grid";
        
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = "btn-answer";
            btn.innerText = opt;
            btn.onclick = () => sendAnswer(opt);
            grid.appendChild(btn);
        });
        area.appendChild(grid);
    } else {
        // Если текст — создаем инпут
        const input = document.createElement('input');
        input.type = "text";
        input.id = "text-answer-input";
        input.className = "answer-input";
        input.placeholder = "Впиши свой ответ...";
        
        const btn = document.createElement('button');
        btn.className = "btn-party-add";
        btn.innerText = "Отправить ✨";
        btn.onclick = () => sendAnswer(input.value);
        
        area.appendChild(input);
        area.appendChild(btn);
    }
}

function sendAnswer(val) {
    if (!val.trim()) return;

    const playerName = sessionStorage.getItem('quiz_player_name') || "Аноним";
    
    // Отправляем ответ на сервер через сокеты
    socket.emit('send_answer', {
        room: roomCode,
        name: playerName,
        answer: val
    });

    // Визуальное подтверждение
    document.getElementById('player-answer-area').innerHTML = `
        <div style="text-align: center; animation: pulse 1s infinite;">
            <span style="font-size: 3rem;">✅</span>
            <h3>Ответ принят!</h3>
            <p style="opacity: 0.6;">Ждем следующего вопроса...</p>
        </div>
    `;
}

/**
 * ОБРАБОТКА СОБЫТИЙ СОКЕТОВ (СИНХРОНИЗАЦИЯ)
 */

// Слушаем команду на переключение вопроса
socket.on('move_to_next', () => {
    currentStep++;
    console.log("Переходим к вопросу №", currentStep + 1);
    
    if (role === 'host') {
        updateHostQuestion();
    } else {
        renderPlayerQuestion();
    }
});

// Сообщение об ошибке от сервера
socket.on('error', (data) => {
    alert(data.msg);
});

// Запуск при загрузке страницы
window.onload = loadQuizData;