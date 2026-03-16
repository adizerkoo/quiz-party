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
    // 1. Сразу заполняем код комнаты, если элемент есть
    const displayCodeEl = document.getElementById('display-room-code');
    if (displayCodeEl) {
        displayCodeEl.innerText = roomCode;
    }

    try {
        const response = await fetch(`/api/quizzes/${roomCode}`);
        
        if (response.ok) {
            const data = await response.json();
            quizTitle = data.title;
            currentQuestions = data.questions_data;

            renderQuizTitle();
            renderProgress();
            
            // Соединяемся с сокетами только если комната реально существует
            socket.emit('join_room', { 
                room: roomCode, 
                name: playerName, 
                role: role 
            });
            socket.emit('request_sync', { room: roomCode, name: playerName });

            // Показываем нужный экран
            const screenId = (role === 'host') ? 'host-screen' : 'player-screen';
            const screenEl = document.getElementById(screenId);
            if (screenEl) screenEl.style.display = 'block';

        } else {
            // Если комната не найдена (например, ввели вручную в URL)
            console.warn("Комната не существует, возвращаемся в меню...");
            window.location.href = 'index.html?error=not_found';
        }
    } catch (e) {
        console.error("Ошибка инициализации:", e);
        // В случае критической ошибки сервера тоже лучше уйти на главную
        window.location.href = 'index.html';
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

// Функция для запуска анимации при клике
function handleEmojiClick(element) {
    const emoji = element.querySelector('.avatar-emoji');
    if (emoji) {
        // Добавляем класс анимации
        emoji.classList.add('avatar-clicked');
        
        // Удаляем его через 500мс (длительность анимации), чтобы можно было кликнуть снова
        setTimeout(() => {
            emoji.classList.remove('avatar-clicked');
        }, 500);
    }
}

socket.on('update_players', (players) => {
    const lobbyContainers = ['lobby-players-list', 'player-lobby-list'];
    
    lobbyContainers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;

        container.innerHTML = players
            .filter(p => !p.is_host)
            .map(p => {
                const isMe = p.name === playerName;
                
                // Важно: onclick добавлен здесь, а стили вынесены в классы
                return `
                    <div class="player-card-lobby ${isMe ? 'is-me' : ''}" onclick="handleEmojiClick(this)">
                        ${isMe ? '<div class="me-badge">ВЫ</div>' : ''}
                        
                        <div class="avatar-emoji">
                            ${p.emoji || '👤'}
                        </div>
                        
                        <div class="player-name-label">
                            ${p.name}
                        </div>
                    </div>
                `;
            }).join('');
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
    // 1. Переключаем экраны
    document.getElementById('host-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'none';
    document.getElementById('finish-screen').style.display = 'block';
    
    const resultsList = document.getElementById('final-results-list');
    if (!resultsList) return;

    // Сохраняем вопросы глобально, чтобы при обновлении страницы они не пропадали
    if (data.questions) window.allQuizQuestions = data.questions;
    
    const players = data.results || [];
    const questions = window.allQuizQuestions || []; 
    const myData = players.find(p => p.name === playerName);

    const maxScore = players.length > 0 ? players[0].score : 0;
    const winners = players.filter(p => p.score === maxScore && maxScore > 0);
    const others = players.filter(p => p.score !== maxScore || maxScore === 0);

    let html = `
        <div class="confetti-wrapper">
            <div style="margin-bottom: 20px; text-align: center;">
                <span class="crown-appear">👑</span>
                <h2 style="color: var(--party-purple); font-size: 1.8rem; margin: 5px 0; font-weight: 800;">Итоги викторины</h2>
            </div>

            ${winners.map(w => `
                <div class="player-row-lobby winner-card-epic" style="padding: 15px 20px; justify-content: flex-start; margin-bottom: 10px;">
                    <span class="player-emoji-icon" style="font-size: 3rem; margin-right: 15px;">${w.emoji}</span>
                    <div style="text-align: left; flex: 1;">
                        <div style="font-size: 0.7rem; opacity: 0.6; font-weight: 700; text-transform: uppercase;">Победитель</div>
                        <div class="shiny-text-name" style="font-size: 1.4rem;">${w.name}</div>
                    </div>
                    <div style="background: #FFD700; color: #000; padding: 5px 15px; border-radius: 15px; font-weight: 800; font-size: 1.2rem;">
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
                            <span style="font-weight: 700; opacity: 0.7; font-size: 1rem;">${p.score}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <div style="margin-top: 30px; padding-bottom: 20px;">
            <div onclick="
                    const content = document.getElementById('review-content');
                    const arrow = document.getElementById('acc-arrow');
                    content.classList.toggle('active');
                    arrow.style.transform = content.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0deg)';
                 " 
                 style="background: rgba(67, 255, 242, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 15px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; -webkit-tap-highlight-color: transparent;">
                <span style="font-weight: 800; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px; color: #2d3436;">Разбор вопросов 🔍</span>
                <span id="acc-arrow" style="transition: transform 0.4s ease; font-size: 0.7rem; color: #2d3436;">▼</span>
            </div>

            <div id="review-content" class="accordion-content">
                <div style="padding-top: 15px;">
                    ${questions.map((q, i) => {
                        const myAnswer = myData?.answers?.[i.toString()] || "—";
                        const isCorrect = myAnswer.toLowerCase().trim() === q.correct.toLowerCase().trim();
                        
                        // Лента ответов других игроков
                        const othersList = players
                            .filter(p => p.name !== playerName)
                            .map(p => {
                                const ans = p.answers?.[i.toString()] || "—";
                                const isAnsCorr = ans.toLowerCase().trim() === q.correct.toLowerCase().trim();
                                return `
                                    <div style="display: inline-flex; flex-direction: column; background: rgba(241, 117, 255, 0.08); padding: 8px 12px; border-radius: 12px; margin-right: 8px; min-width: 130px; max-width: 220px; border: 1px solid rgba(255,255,255,0.5);">
                                        <span style="font-size: 0.6rem; opacity: 0.6; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            ${p.emoji} ${p.name}
                                        </span>
                                        <span style="font-size: 0.85rem; font-weight: 700; color: ${isAnsCorr ? '#00b894' : '#2d3436'}; word-break: break-word; line-height: 1.2;">
                                            ${ans}
                                        </span>
                                    </div>`;
                            }).join('');

                        return `
                        <div class="review-card" style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 18px; padding: 15px; margin-bottom: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); animation-delay: ${i * 0.05}s;">
                            <div style="font-size: 0.65rem; opacity: 0.5; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">Вопрос ${i + 1}</div>
                            <div style="font-weight: 700; font-size: 0.95rem; color: #2d3436; margin-bottom: 12px;">${q.text}</div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                                <div style="background: rgba(67, 242, 128, 0.09); padding: 8px; border-radius: 10px;">
                                    <div style="font-size: 0.55rem; opacity: 0.6; text-transform: uppercase; font-weight: 800;">Верно</div>
                                    <div style="color: #00b894; font-weight: 800; font-size: 0.85rem;">${q.correct}</div>
                                </div>
                                <div style="background: rgba(255, 255, 255, 0.4); padding: 8px; border-radius: 10px; border: 1px solid ${isCorrect ? 'rgba(0, 184, 148, 0.2)' : 'rgba(255, 118, 117, 0.2)'}">
                                    <div style="font-size: 0.55rem; opacity: 0.6; text-transform: uppercase; font-weight: 800;">Твой ответ</div>
                                    <div style="color: ${isCorrect ? '#00b894' : '#d63031'}; font-weight: 800; font-size: 0.85rem;">${myAnswer}</div>
                                </div>
                            </div>

                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.55rem; opacity: 0.4; text-transform: uppercase; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;">Другие игроки:</div>
                                <div style="display: flex; overflow-x: auto; padding-bottom: 5px; -webkit-overflow-scrolling: touch; scrollbar-width: none;">
                                    ${othersList || '<span style="opacity: 0.5; font-size: 0.75rem;">—</span>'}
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;

    resultsList.innerHTML = html;
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

    if (data.maxReachedStep !== undefined) {
        maxReachedStep = data.maxReachedStep;
    }

    if (data.emoji) myEmoji = data.emoji;

    if (data.isFinished) {
        document.getElementById('host-screen').style.display = 'none';
        document.getElementById('player-screen').style.display = 'none';
        document.getElementById('finish-screen').style.display = 'block';
        return; // Дальше логику синхронизации обычного шага не гоним
    }



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
                const answerArea = document.getElementById('player-answer-area');
                if (answerArea) {
                    answerArea.innerHTML = `
                        <div class="sent-confirmation reveal-anim">
                            <div class="status-badge-sent">Отправлено 🚀</div>
                            
                            <div class="your-answer-preview">
                                <div class="your-answer-label">Твой ответ:</div>
                                <div class="your-answer-text">${data.playerAnswer}</div>
                            </div>

                            <div class="waiting-loader">
                                <div class="pulse-dot" style="display:inline-block; margin-right:8px;"></div>
                                <span>Ждем остальных игроков...</span>
                            </div>
                        </div>
                    `;
                }
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
                    refreshUI();
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
                <div class="input-wrapper" id="input-box">
                    <input type="text" id="ans-text" class="answer-input-field" maxlength="50" placeholder="Ответ...">
                    <button class="btn-send-arrow" onclick="validateAndSend()">
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

// Новая функция-прослойка для проверки
function validateAndSend() {
    const input = document.getElementById('ans-text');
    const val = input.value.trim();
    
    if (val === "") {
        const box = document.getElementById('input-box');
        box.classList.add('shake-anim');
        setTimeout(() => box.classList.remove('shake-anim'), 500);
        if (window.navigator.vibrate) window.navigator.vibrate(50);
        return;
    }
    sendAnswer(val);
}

window.onload = init;