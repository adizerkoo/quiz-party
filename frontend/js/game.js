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

    const toy = document.getElementById('lobby-clicker-toy');
    if (toy) {
        toy.onclick = () => {
            // 1. Список праздничных эмодзи
            const emojis = ['🎈', '🎉', '🎊', '✨', '🎁', '🦄', '⭐'];
            toy.innerText = emojis[Math.floor(Math.random() * emojis.length)];

            // 2. Перезапуск анимации
            toy.classList.remove('pop-animation');
            void toy.offsetWidth; // Магия JS для принудительного рендеринга (reflow)
            toy.classList.add('pop-animation');

            // 3. Можно добавить легкую вибрацию на телефоне, если доступно
            if (navigator.vibrate) {
                navigator.vibrate(10); 
            }
        };
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
    socket.emit('send_answer', { 
        room: roomCode, 
        name: playerName, 
        answer: val, 
        questionIndex: currentStep 
    });
    
    document.getElementById('player-answer-area').innerHTML = `
        <div class="empty-list-msg" style="margin-top:20px;">
            <h3>Ответ отправлен! 🚀</h3>
            <p>Ждем остальных...</p>
        </div>
    `;
}

socket.on('update_players', (players) => {
    // Функция-помощник для отрисовки плиток
    const drawGrid = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return; // Если элемента нет на текущем экране, просто выходим

        container.innerHTML = players
            .filter(p => !p.is_host)
            .map(p => {
                const isMe = (role !== 'host' && p.name === playerName);
                return `
                    <div class="avatar-slot ${isMe ? 'it-is-me' : ''}">
                        <div class="avatar-emoji">${p.emoji || '👤'}</div>
                        <div class="avatar-name">${isMe ? 'Я' : p.name}</div>
                    </div>
                `;
            }).join('');
    };

    // Обновляем список и у хоста, и у игрока (сработает там, где найдется ID)
    drawGrid('lobby-players-list');
    drawGrid('player-lobby-list');
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
        let btnHTML = "";

        if (isAnswered) {
            displayAnswer = answerText;
            const isCorrect = answerText.toLowerCase().trim() === currentQ.correct.toLowerCase().trim();
            const currentStatus = questionScore !== undefined ? questionScore : (isCorrect ? 1 : 0);

            if (currentStatus === 1) {
                statusClass = "correct";
                btnHTML = `<div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.6rem; font-weight: 800; color: #2ed573;">ВЕРНО</span>
                                <button class="btn-control btn-reject" onclick="changeScore('${p.name}', -1)">
                                    <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                                </button>
                           </div>`;
            } else {
                statusClass = "wrong";
                btnHTML = `<button class="btn-control btn-accept" onclick="changeScore('${p.name}', 1)">
                                <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
                           </button>`;
            }
        }

        return `
            <div class="answer-card ${statusClass}">
                <div class="answer-info">
                    <div class="answer-name" style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.8rem;">${p.emoji || '👤'}</span> 
                        <span style="font-size: 1.1rem; font-weight: bold;">${p.name}</span>
                    </div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #2d3436; background: rgba(0,0,0,0.04); padding: 4px 10px; border-radius: 8px; display: inline-block; margin-top: 4px;">
                        ${displayAnswer}
                    </div>
                </div>
                <div class="answer-buttons">${btnHTML}</div>
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

    title.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.6); padding: 10px 15px; border-radius: 20px; margin-bottom: 25px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 2rem;">${myEmoji}</span>
                <div style="text-align: left;">
                    <div style="font-size: 0.7rem; opacity: 0.6; font-weight: 700;">ИГРОК</div>
                    <div style="font-weight: 800; font-size: 1rem;">${playerName}</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.7rem; opacity: 0.6; font-weight: 700;">ВОПРОС</div>
                <div style="font-weight: 800; font-size: 1rem; color: var(--party-purple);">${currentStep + 1} / ${currentQuestions.length}</div>
            </div>
        </div>
        
        <div style="padding: 0 10px;">
            <div style="font-size: 1.4rem; font-weight: 800; line-height: 1.3; color: #2d3436;">
                ${q.text}
            </div>
        </div>
    `;
    
    if (q.type === 'options') {
        area.innerHTML = `
            <div class="menu-grid" style="margin-top: 25px;">
                ${q.options.map(o => `<button class="btn-answer" onclick="sendAnswer('${o}')">${o}</button>`).join('')}
            </div>
        `;
    } else {
        area.innerHTML = `
            <div style="margin-top: 25px;">
                <input type="text" id="ans-text" class="answer-input" placeholder="Введите ответ...">
                <button onclick="sendAnswer(document.getElementById('ans-text').value)" class="btn-party-direct">ОТПРАВИТЬ</button>
            </div>
        `;
    }
}

window.onload = init;