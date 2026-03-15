const socket = io();

let quizTitle = "";
let myEmoji = '👤';
let currentStep = 0;
let realGameStep = 0;
let maxReachedStep = 0;
let currentQuestions = [];

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const role = urlParams.get('role');
const playerName = role === 'host' ? 'HOST' : (sessionStorage.getItem('quiz_player_name') || "Игрок");

async function init() {
    if (document.getElementById('display-room-code')) {
        document.getElementById('display-room-code').innerText = roomCode;
    }

    try {
        const response = await fetch(`/api/quizzes/${roomCode}`);
        if (response.ok) {
            const data = await response.json();
            quizTitle = data.title;
            currentQuestions = data.questions_data;

            renderQuizTitle();
            renderProgress();
            
            socket.emit('join_room', { 
                room: roomCode, 
                name: playerName, 
                role: role 
            });
            socket.emit('request_sync', { room: roomCode, name: playerName });

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

function startGame() {
    currentStep = 0;
    socket.emit('start_game_signal', { room: roomCode });
}

function renderQuizTitle() {
    const hostTitle = document.getElementById("quiz-title-host");
    const playerTitle = document.getElementById("quiz-title-player");

    if (hostTitle) hostTitle.innerText = quizTitle;
    if (playerTitle) playerTitle.innerText = quizTitle;
}

const displayRoomCode = document.getElementById('display-room-code');
const copyRoomBtn = document.getElementById('copy-room-btn');
const copyMsg = document.getElementById('copy-msg');

function copyRoomCode() {
    const code = displayRoomCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
        copyMsg.classList.add('show');
        setTimeout(() => copyMsg.classList.remove('show'), 1500);
    });
}

// Копирование при клике на кнопку
copyRoomBtn.addEventListener('click', copyRoomCode);

// Можно также копировать при клике на сам код
displayRoomCode.addEventListener('click', copyRoomCode);

function nextQuestion() {

    if (currentStep !== realGameStep) {
        currentStep = realGameStep;
        refreshUI();
        return;
    }

    socket.emit("check_answers_before_next", {
        room: roomCode,
        step: currentStep
    });
}

function showModernConfirm(msg, onConfirm) {
    const overlay = document.getElementById('confirm-overlay');
    overlay.style.display = 'flex';
    document.getElementById('confirm-proceed-btn').onclick = () => {
        overlay.style.display = 'none';
        onConfirm();
    };
}


function proceedToNext() {
    if (currentStep < currentQuestions.length - 1) {
        socket.emit("next_question_signal", { room: roomCode });
    } else {
        socket.emit("finish_game_signal", { room: roomCode });
    }
}

function changeScore(targetName, points) {
    socket.emit("override_score", {
        room: roomCode,
        playerName: targetName,
        points: points,
        questionIndex: currentStep
    });
}

function renderProgress() {
    const container = document.getElementById("questions-progress");
    if (!container) return;

    container.innerHTML = currentQuestions.map((_, i) => {
        let stateClass = "future";
        if (i < maxReachedStep) stateClass = "done";
        if (i === currentStep) stateClass = "active";

        const showDot = (i === maxReachedStep);

        return `
        <div class="q-step-wrapper" style="display: inline-flex; flex-direction: column; align-items: center; margin: 0 4px; cursor: pointer;">
            <div class="q-step ${stateClass}" onclick="jumpToQuestion(${i})">
                ${i + 1}
            </div>
            ${showDot ? '<div class="pulse-dot"></div>' : '<div style="height: 12px; margin-top: 4px;"></div>'}
        </div>
        `;
    }).join("");
}

function jumpToQuestion(step) {
    if (role !== 'host') return;
    currentStep = step;
    socket.emit('move_to_step', { room: roomCode, step: step });
    socket.emit("get_update", roomCode); 
    refreshUI();
}

function renderScoreboard(players) {
    const board = document.getElementById("scoreboard");
    if (!board) return;

    const sorted = [...players]
        .filter(p => !p.is_host)
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    const maxScore = sorted.length > 0 ? sorted[0].score : 0;

    board.innerHTML = sorted.map((p, i) => {
        const isLeader = p.score === maxScore && maxScore > 0;

        return `
        <div class="score-row ${isLeader ? "leader-row" : ""}">
            <span>${isLeader ? "👑" : i + 1 + "."} ${p.name}</span>
            <span>${p.score || 0} 🏆</span>
        </div>
        `;
    }).join("");
}

function sendAnswer(val) {
    // 1. Отправляем данные на сервер
    socket.emit('send_answer', { 
        room: roomCode, 
        name: playerName, 
        answer: val, 
        questionIndex: currentStep 
    });
    
    // 2. Обновляем интерфейс (используем val вместо userAnswer)
    const answerArea = document.getElementById('player-answer-area');
    
    if (answerArea) {
        answerArea.innerHTML = `
            <div class="sent-confirmation">
                <div class="status-badge-sent">Отправлено 🚀</div>
                
                <div class="your-answer-preview">
                    <div class="your-answer-label">Твой ответ:</div>
                    <div class="your-answer-text">${val}</div>
                </div>

                <div class="waiting-loader">
                    <div class="pulse-dot" style="display:inline-block; margin-right:8px;"></div>
                    <span>Ждем остальных игроков...</span>
                </div>
            </div>
        `;
    }
}

socket.on('update_players', (players) => {
    // 1. Отрисовка списка в лобби (у хоста и игрока)
    const lobbyContainers = ['lobby-players-list', 'player-lobby-list'];
    
    lobbyContainers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;

        container.innerHTML = players
            .filter(p => !p.is_host)
            .map(p => `
                <div class="player-card-lobby" style="
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    background: rgba(255,255,255,0.7); 
                    padding: 15px; 
                    border-radius: 20px; 
                    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                    animation: popIn 0.3s ease-out;
                ">
                    <div style="font-size: 2.5rem; margin-bottom: 5px;">${p.emoji || '👤'}</div>
                    <div style="font-weight: 800; color: #2d3436; font-size: 0.9rem; text-align: center;">${p.name}</div>
                </div>
            `).join('');
    });
});

socket.on("game_started", (players) => {
    currentStep = 0; 
    maxReachedStep = 0;
    realGameStep = 0;
    const me = players.find(p => p.name === playerName);
    
    if (me) myEmoji = me.emoji;
    if (role === "host") {
        document.getElementById("host-lobby").style.display = "none";
        document.getElementById("host-game-area").style.display = "block";

        renderProgress();
        updateHostUI();

        const grid = document.getElementById("players-answers-grid");
        grid.innerHTML = players.filter(p => !p.is_host).map(p => `
            <div class="answer-card waiting">
                <div class="answer-info">
                    <div class="answer-name" style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 2rem;">${p.emoji || '👤'}</span> 
                        <span style="font-size: 1.2rem; font-weight: bold;">${p.name}</span>
                    </div>
                    <div class="answer-text">⏳ ожидает ответа</div>
                </div>
                <div class="answer-buttons"></div>
            </div>
        `).join('');

        renderScoreboard(players);
    } else {
        document.getElementById("player-wait").style.display = "none";
        document.getElementById("player-game-area").style.display = "block";
        renderPlayerQuestion();
    }
    socket.emit("get_update", roomCode);
    renderProgress();
});

socket.on("update_answers", (players) => {
    if (role !== "host") return;
    
    renderScoreboard(players);
    const grid = document.getElementById("players-answers-grid");
    if (!grid) return;

    const currentQ = currentQuestions[currentStep];

    grid.innerHTML = players.filter(p => !p.is_host).map(p => {
        const answers = p.answers_history || {};
        const scores = p.scores_history || {};
        const stepKey = currentStep.toString();
        const answerText = answers[stepKey];
        const questionScore = scores[stepKey];
        const isAnswered = (answerText !== undefined && answerText !== null && answerText.toString().trim() !== "");

        let statusClass = "waiting";
        let displayAnswer = "⏳ ожидает ответа...";
        let btnHTML = ""; // Базовая переменная

        if (isAnswered) {
            displayAnswer = answerText;
            const isCorrect = answerText.toLowerCase().trim() === currentQ.correct.toLowerCase().trim();
            const currentStatus = questionScore !== undefined ? questionScore : (isCorrect ? 1 : 0);

            if (currentStatus === 1) {
                statusClass = "correct";
                // Убрали 'const', чтобы менять внешнюю переменную
                btnHTML = `
                    <div class="card-controls">
                        <span class="status-label">Верно</span>
                        <button class="btn-mini btn-minus" onclick="changeScore('${p.name}', -1)" title="Забрать балл">
                            <svg viewBox="0 0 24 24"><path d="M18 12H6" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
                        </button>
                    </div>`;
            } else {
                statusClass = "wrong";
                // Тоже убрали 'const' и используем правильное имя переменной btnHTML
                btnHTML = `
                    <div class="card-controls">
                        <button class="btn-mini btn-plus" onclick="changeScore('${p.name}', 1)" title="Засчитать балл">
                            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
                        </button>
                    </div>`;
            }
        }

        return `
            <div class="answer-card ${statusClass}">
                <div class="card-header">
                    <div class="player-info">
                        <span class="p-emoji">${p.emoji || '👤'}</span> 
                        <span class="p-name">${p.name}</span>
                    </div>
                    <div class="card-controls">
                        ${btnHTML}
                    </div>
                </div>
                
                <div class="player-answer-bubble">
                    ${displayAnswer}
                </div>
            </div>
        `;
    }).join("");
});

socket.on('show_results', (data) => {
    document.getElementById('host-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'none';
    document.getElementById('finish-screen').style.display = 'block';
    
    const resultsList = document.getElementById('final-results-list');
    if (!resultsList) return;

    const players = data.results;
    const maxScore = players.length > 0 ? players[0].score : 0;
    const winners = players.filter(p => p.score === maxScore && maxScore > 0);
    const others = players.filter(p => p.score !== maxScore || maxScore === 0);

    resultsList.innerHTML = `
        <div class="confetti-wrapper">
            <div style="margin-bottom: 20px; text-align: center;">
                <span class="crown-appear">👑</span>
                <h2 style="color: var(--party-purple); font-size: 1.8rem; margin: 5px 0; font-weight: 800;">Итоги викторины</h2>
            </div>

            ${winners.map(w => `
                <div class="player-row-lobby winner-card-epic" style="padding: 15px 20px; justify-content: flex-start;">
                    <span class="player-emoji-icon" style="font-size: 3rem; margin-right: 15px;">${w.emoji}</span>
                    <div style="text-align: left; flex: 1;">
                        <div style="font-size: 0.7rem; opacity: 0.6; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Победитель</div>
                        <div class="shiny-text-name" style="font-size: 1.4rem;">${w.name}</div>
                    </div>
                    <div style="background: #FFD700; color: #000; padding: 5px 15px; border-radius: 15px; font-weight: 800; font-size: 1.2rem; margin-left: 10px;">
                        ${w.score}
                    </div>
                </div>
            `).join('')}
        </div>
        
        ${others.length > 0 ? `
            <div style="margin-top: 25px;">
                <h4 style="opacity: 0.5; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; padding-left: 10px;">Рейтинг игроков</h4>
                <div style="background: rgba(255,255,255,0.3); border-radius: 15px; padding: 5px;">
                    ${others.map((p, i) => `
                        <div class="player-row-lobby" style="background: transparent; border: none; border-bottom: 1px solid rgba(0,0,0,0.03); box-shadow: none; margin-bottom: 0; padding: 10px 15px;">
                            <span style="font-weight: 800; opacity: 0.3; width: 25px; font-size: 0.9rem;">#${i + 2}</span>
                            <span class="player-emoji-icon" style="font-size: 1.4rem; margin-right: 10px;">${p.emoji}</span>
                            <span class="player-name-lobby" style="flex: 1; text-align: left; font-size: 1rem; font-weight: 600;">${p.name}</span>
                            <span style="font-weight: 700; opacity: 0.7; font-size: 1rem; background: rgba(0,0,0,0.04); padding: 3px 10px; border-radius: 10px;">${p.score}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
});

socket.on("move_to_next", (data) => {
    realGameStep = data.step;
    currentStep = data.step;

    if (currentStep > maxReachedStep) {
        maxReachedStep = currentStep;
    }

    refreshUI();
});

socket.on("answers_check_result", (data) => {
    if (!data.allAnswered) {
        showModernConfirm("Не все ответили! Всё равно идём дальше?", () => {
            proceedToNext();
        });
    } else {
        proceedToNext();
    }
});

socket.on('sync_state', (data) => {
    currentStep = data.currentStep;
    realGameStep = data.currentStep;
    if (data.emoji) myEmoji = data.emoji;

    if (role !== 'host') {
        const waitEmoji = document.getElementById('player-wait-emoji');
        const waitName = document.getElementById('player-wait-name');
        if (waitEmoji) waitEmoji.innerText = data.emoji || myEmoji;
        if (waitName) waitName.innerText = playerName;
    }

    if (role === 'host') {
        if (currentStep >= 0) {
            document.getElementById("host-lobby").style.display = "none";
            document.getElementById("host-game-area").style.display = "block";
            updateHostUI();
            renderProgress();
        } else {
            document.getElementById("host-lobby").style.display = "block";
            document.getElementById("host-game-area").style.display = "none";
        }
    } else {
        if (data.isStarted) {
            document.getElementById("player-wait").style.display = "none";
            document.getElementById("player-game-area").style.display = "block";
            renderPlayerQuestion();
            
            if (data.playerAnswer) {
                document.getElementById('player-answer-area').innerHTML = `
                    <div class="empty-list-msg" style="margin-top:20px;">
                        <h3>Ответ уже отправлен! 🚀</h3>
                        <p>Вы ответили: <b>${data.playerAnswer}</b></p>
                    </div>
                `;
            }
        }
    }
});

function refreshUI() {
    renderProgress();
    if (role === 'host') {
        updateHostUI();
        socket.emit("get_update", roomCode); 
        
        const btn = document.getElementById('next-btn');
        if (btn) {

            if (currentStep !== realGameStep) {

                btn.innerText = "↩ Вернуться к текущему вопросу";
                btn.onclick = () => {
                    currentStep = realGameStep;

                    // обновляем UI
                    refreshUI();

                    // запрашиваем актуальные ответы игроков
                    socket.emit("get_update", roomCode);
                };

            } else {

                btn.onclick = nextQuestion;

                btn.innerText =
                    (currentStep === currentQuestions.length - 1)
                    ? "🏆 ПОДВЕСТИ ИТОГИ"
                    : "СЛЕДУЮЩИЙ ВОПРОС";
            }

        }
    } else {
        renderPlayerQuestion();
    }
}

function updateHostUI() {
    const q = currentQuestions[currentStep];
    const isLastQuestion = currentStep === currentQuestions.length - 1;

    document.getElementById("host-question-text").innerText = `${currentStep + 1}. ${q.text}`;
    document.getElementById("correct-answer").innerText = "Правильный ответ: " + q.correct;

    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
        if (isLastQuestion) {
            nextBtn.innerText = "🏆 ПОДВЕСТИ ИТОГИ";
            nextBtn.style.background = "linear-gradient(135deg, #f6d365 0%, #fda085 100%)";
        } else {
            nextBtn.innerText = "СЛЕДУЮЩИЙ ВОПРОС";
            nextBtn.style.background = "var(--party-pink)";
        }
    }
}

function renderPlayerQuestion() {
    const q = currentQuestions[currentStep];
    const area = document.getElementById('player-answer-area');
    const title = document.getElementById('player-question-text');
    if (!q) return;

    // 1. Только структура заголовка
    title.innerHTML = `
        <div class="player-header">
            <div class="player-info-badge">
                <span style="font-size: 1.2rem;">${myEmoji}</span>
                <span class="player-name-text">${playerName}</span>
            </div>
            <div class="question-counter">
                ${currentStep + 1} <span style="opacity: 0.3;">/ ${currentQuestions.length}</span>
            </div>
        </div>
        
        <div class="question-container reveal-anim">
            <div class="question-main-text">${q.text}</div>
            <div class="question-line"></div>
        </div>
    `;
    
    // 2. Только структура контента
    if (q.type === 'options') {
        area.innerHTML = `
            <div class="answers-grid reveal-anim">
                ${q.options.map(o => `
                    <button class="btn-answer" onclick="sendAnswer('${o}')">
                        ${o}
                    </button>
                `).join('')}
            </div>
        `;
    } else {
        area.innerHTML = `
            <div class="input-group-container reveal-anim">
                <div class="input-wrapper">
                    <input type="text" id="ans-text" class="answer-input-field" maxlength="50" placeholder="Ответ...">
                    <button class="btn-send-arrow" onclick="sendAnswer(document.getElementById('ans-text').value)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
}

window.onload = init;