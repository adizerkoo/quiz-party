const socket = io();
let currentQuestions = [];
let currentStep = 0;
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const role = urlParams.get('role');
const playerName = role === 'host' ? 'HOST' : (sessionStorage.getItem('quiz_player_name') || "Игрок");

// Инициализация игры
async function init() {
    if (document.getElementById('display-room-code')) {
        document.getElementById('display-room-code').innerText = roomCode;
    }

    try {
        const response = await fetch(`/api/quizzes/${roomCode}`);
        if (response.ok) {
            const data = await response.json();
            currentQuestions = data.questions_data;
            
            socket.emit('join_room', { 
                room: roomCode, 
                name: playerName, 
                role: role 
            });

            if (role === 'host') {
                document.getElementById('host-screen').style.display = 'block';
            } else {
                document.getElementById('player-screen').style.display = 'block';
            }
        } else {
            alert("Комната не найдена!");
            window.location.href = 'index.html';
        }
    } catch (e) {
        console.error("Ошибка инициализации:", e);
    }
}

// Управление игрой (только для Хоста)
function startGame() {
    socket.emit('start_game_signal', { room: roomCode });
}

function nextQuestion() {
    if (currentStep < currentQuestions.length - 1) {
        socket.emit('next_question_signal', { room: roomCode });
    } else {
        socket.emit('finish_game_signal', { room: roomCode });
    }
}

function prevQuestion() {
    if (currentStep > 0) {
        currentStep--;
        // Отправляем сигнал, чтобы у всех синхронизировался номер вопроса
        socket.emit('move_to_step', { room: roomCode, step: currentStep });
    }
}

// Ручное изменение очков
function changeScore(targetName, points) {
    socket.emit('override_score', { 
        room: roomCode, 
        playerName: targetName, 
        points: points 
    });
}

// Отправка ответа (для Игрока)
function sendAnswer(val) {
    socket.emit('send_answer', { room: roomCode, name: playerName, answer: val });
    document.getElementById('player-answer-area').innerHTML = `
        <div class="empty-list-msg" style="margin-top:20px;">
            <h3>Ответ отправлен! 🚀</h3>
            <p>Ждем остальных...</p>
        </div>
    `;
}

// --- СЛУШАТЕЛИ SOCKET.IO ---

// Массив случайных эмодзи лиц для игроков
const playerEmojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', 
    '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', 
    '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', 
    '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', 
    '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', 
    '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', 
    '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', 
    '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', 
    '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', 
    '👿', '👹', '👺', '🤡', '👻', '💀', '☠️', '👽', '👾', '🤖', 
    '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'
];

// Функция для получения случайного эмодзи
function getRandomEmoji() {
    return playerEmojis[Math.floor(Math.random() * playerEmojis.length)];
}

// --- ОБНОВЛЕННЫЕ СЛУШАТЕЛИ ---

// 1. Обновленный список игроков в ЛОББИ (до начала игры)
socket.on('update_players', (players) => {
    const list = document.getElementById('lobby-players-list');
    if (list && role === 'host') {
        const onlyPlayers = players.filter(p => !p.is_host);
        
        // Отрисовываем в новом компактном стиле: Иконка Имя
        list.innerHTML = onlyPlayers.map(p => {
            const emoji = getRandomEmoji(); // Генерируем эмодзи для отображения
            return `
                <div class="player-row-lobby">
                    <span class="player-emoji-icon">${emoji}</span>
                    <span class="player-name-lobby">${p.name}</span>
                </div>
            `;
        }).join('');
    }
});

socket.on('game_started', () => {
    if (role === 'host') {
        document.getElementById('host-lobby').style.display = 'none';
        document.getElementById('host-game-area').style.display = 'block';
        updateHostUI();
    } else {
        document.getElementById('player-wait').style.display = 'none';
        document.getElementById('player-game-area').style.display = 'block';
        renderPlayerQuestion();
    }
});

// 2. Обновленный экран ответов (во время игры)
// Мы тоже добавляем эмодзи сюда, чтобы стиль был единым
socket.on('update_answers', (players) => {
    const grid = document.getElementById('players-answers-grid');
    if (grid && role === 'host') {
        const onlyPlayers = players.filter(p => !p.is_host);
        const currentQ = currentQuestions[currentStep];

        grid.innerHTML = onlyPlayers.map(p => {
            // Генерируем эмодзи (он будет случайным при каждом обновлении ответа,
            // что добавляет динамики, но если хочешь зафиксировать, нужно хранить в БД)
            const emoji = getRandomEmoji();

            // Авто-проверка ответа
            let statusClass = "";
            let isCorrect = false;
            
            if (p.answer) {
                isCorrect = p.answer.toString().trim().toLowerCase() === currentQ.correct.toString().trim().toLowerCase();
                statusClass = isCorrect ? "is-correct" : "is-wrong";
            }

            // Используем новый компактный заголовок: Иконка Имя (Очки)
            return `
                <div class="question-item-complex ${statusClass}" style="border-left-width: 8px;">
                    <div class="q-header-compact">
                        <span class="player-emoji-icon">${emoji}</span>
                        <span class="menu-label">${p.name} <small>(${p.score || 0} 🏆)</small></span>
                        <span class="answer-check-icon">${p.answer ? (isCorrect ? '✅' : '❌') : '⏳'}</span>
                    </div>
                    <div class="menu-desc" style="margin: 5px 0 10px 0;">Ответ: ${p.answer || '...'}</div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="changeScore('${p.name}', 1)" class="btn-party-add" style="padding: 5px; font-size: 0.7rem; background: #2ecc71;">ЗАЧЕСТЬ +1</button>
                        <button onclick="changeScore('${p.name}', -1)" class="btn-party-add" style="padding: 5px; font-size: 0.7rem; background: #ff7675;">ОТНЯТЬ -1</button>
                    </div>
                </div>
            `;
        }).join('');
    }
});

socket.on('move_to_next', () => {
    currentStep++;
    refreshUI();
});

socket.on('move_to_step', (data) => {
    currentStep = data.step;
    refreshUI();
});

socket.on('show_results', (data) => {
    // Скрываем игровые экраны
    document.getElementById('host-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'none';
    
    const finishScreen = document.getElementById('finish-screen');
    finishScreen.style.display = 'block';

    const resultsList = document.getElementById('final-results-list');
    const winner = data.results[0];

    // Генерируем красивый список с визуализацией
    resultsList.innerHTML = `
        <div class="winner-announcement" style="margin-bottom: 30px; animation: tada 1s ease-in-out;">
            <div style="font-size: 4rem;">🏆</div>
            <h2 style="color: var(--party-purple); font-size: 1.8rem; margin: 10px 0;">${winner.name}</h2>
            <p style="font-weight: 800; color: var(--party-pink); letter-spacing: 1px;">АБСОЛЮТНЫЙ ЧЕМПИОН!</p>
        </div>
        
        <div class="results-table">
            ${data.results.map((p, i) => {
                const emoji = getRandomEmoji(); // Твои новые эмодзи
                const isWinner = i === 0;
                return `
                    <div class="player-row-lobby" style="${isWinner ? 'border: 2px solid var(--party-pink); background: #fffafb;' : ''}">
                        <span style="font-weight: 800; width: 25px; color: #a1a1a1;">${i + 1}</span>
                        <span class="player-emoji-icon">${isWinner ? '👑' : emoji}</span>
                        <span class="player-name-lobby" style="flex-grow: 1;">${p.name}</span>
                        <span style="font-weight: 800; color: var(--party-purple);">${p.score} <small>очков</small></span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
});

// Вспомогательные функции
function refreshUI() {
    if (role === 'host') {
        updateHostUI();
        // Меняем текст кнопки на последнем вопросе
        const btn = document.getElementById('next-btn');
        btn.innerText = (currentStep === currentQuestions.length - 1) ? "ФИНИШ 🏁" : "ДАЛЬШЕ ➡️";
    } else {
        renderPlayerQuestion();
    }
}

function updateHostUI() {
    const q = currentQuestions[currentStep];
    const textEl = document.getElementById('host-question-text');
    if (q) textEl.innerText = `${currentStep + 1}. ${q.text}`;
}

function renderPlayerQuestion() {
    const q = currentQuestions[currentStep];
    const area = document.getElementById('player-answer-area');
    const title = document.getElementById('player-question-text');
    
    if (!q) return;

    title.innerText = q.text;
    
    if (q.type === 'options') {
        area.innerHTML = `
            <div class="menu-grid" style="margin-top: 20px;">
                ${q.options.map(o => `
                    <button class="btn-answer" onclick="sendAnswer('${o}')">${o}</button>
                `).join('')}
            </div>
        `;
    } else {
        area.innerHTML = `
            <div style="margin-top: 20px;">
                <input type="text" id="ans-text" class="answer-input" placeholder="Твой ответ...">
                <button onclick="sendAnswer(document.getElementById('ans-text').value)" class="btn-party-direct">ОТПРАВИТЬ</button>
            </div>
        `;
    }
}

window.onload = init;