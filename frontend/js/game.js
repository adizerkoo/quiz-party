const socket = io();

let currentStep = 0;
let maxReachedStep = 0;
let currentQuestions = [];
let scoreChanges = {};
let scoreOverrides = {};
let answersHistory = {}


const scoreOverride = {};
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
            currentQuestions = data.questions_data;
            renderProgress();
            
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

function startGame() {

    currentStep = 0;

    socket.emit('start_game_signal', { room: roomCode });

    setTimeout(() => {
        updateHostUI();
        renderProgress();
    }, 100);

}

function nextQuestion() {

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
        
        if (i < maxReachedStep) {
            stateClass = "done";
        }
        if (i === currentStep) {
            stateClass = "active";
        }

        return `
        <div class="q-step-wrapper" style="display: inline-flex; flex-direction: column; align-items: center; margin: 0 4px; cursor: pointer;">
            <div style="font-size: 1.2rem; height: 24px; margin-bottom: 2px;">
                ${i === currentStep ? "⬇️" : ""}
            </div>
            <div class="q-step ${stateClass}" onclick="jumpToQuestion(${i})">
                ${i + 1}
            </div>
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

    board.innerHTML = sorted.map((p, i) => {

        const leader = i === 0;

        return `
        <div class="score-row ${leader ? "leader-row" : ""}">
            <span>${leader ? "👑" : i + 1 + "."} ${p.name}</span>
            <span>${p.score || 0} 🏆</span>
        </div>
        `;

    }).join("");

}

function handleScoreClick(playerName, points) {
    const key = `${playerName}_${currentStep}`;
    
    socket.emit("override_score", {
        room: roomCode,
        playerName: playerName,
        points: points,
        questionIndex: currentStep
    });

    scoreOverrides[key] = !scoreOverrides[key];
    
    socket.emit("get_update", roomCode); 
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

function getRandomEmoji() {
    return playerEmojis[Math.floor(Math.random() * playerEmojis.length)];
}

socket.on('update_players', (players) => {
    const list = document.getElementById('lobby-players-list');
    if (list && role === 'host') {
        list.innerHTML = players.filter(p => !p.is_host).map(p => `
            <div class="player-row-lobby">
                <span class="player-emoji-icon">${p.emoji || '👤'}</span>
                <span class="player-name-lobby">${p.name}</span>
            </div>
        `).join('');
    }
});


socket.on("game_started", (players) => {
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
    const currentQ = currentQuestions[currentStep];

    grid.innerHTML = players.filter(p => !p.is_host).map(p => {
        const answers = p.answers_history || {};
        const scores = p.scores_history || {};

        // Явно приводим шаг к строке, так как ключи в JSON — это строки
        const stepKey = currentStep.toString();
        const answerText = answers[stepKey];
        const questionScore = scores[stepKey];

        // Строгая проверка, что ответ реально существует
        const isAnswered = answerText !== undefined && answerText !== null && answerText.trim() !== "";

        let statusClass = "waiting";
        let displayAnswer = "⏳ ожидает ответа...";
        let btnHTML = "";

        // Кнопки генерируются ТОЛЬКО если игрок уже ответил
        if (isAnswered) {
            displayAnswer = answerText;
            
            // Если балл еще не выставлен вручную, проверяем автоматически
            const isCorrect = answerText.toLowerCase().trim() === currentQ.correct.toLowerCase().trim();
            const currentStatus = questionScore !== undefined ? questionScore : (isCorrect ? 1 : 0);

            if (currentStatus === 1) {
                statusClass = "correct";
                btnHTML = `<button class="btn-score btn-minus" onclick="changeScore('${p.name}', -1)">−1</button>`;
            } else {
                statusClass = "wrong";
                btnHTML = `<button class="btn-score btn-plus" onclick="changeScore('${p.name}', 1)">+1</button>`;
            }
        }

        return `
            <div class="answer-card ${statusClass}">
                <div class="answer-info">
                    <div class="answer-name" style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 2rem;">${p.emoji || '👤'}</span> 
                        <span style="font-size: 1.2rem; font-weight: bold;">${p.name}</span>
                    </div>
                    <div class="answer-text">${displayAnswer}</div>
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
    resultsList.innerHTML = data.results.map((p, i) => `
        <div class="player-row-lobby" style="${i === 0 ? 'border: 2px solid gold' : ''}">
            <span class="player-emoji-icon">${p.emoji || '👤'}</span>
            <span class="player-name-lobby" style="flex: 1">${i === 0 ? '👑 ' : ''}${p.name}</span>
            <span style="font-weight: 800">${p.score} очков</span>
        </div>
    `).join('');
});

socket.on("move_to_next", (data) => {
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

function refreshUI() {
    renderProgress();
    if (role === 'host') {
        updateHostUI();
        // Запрашиваем актуальные данные игроков для этого шага
        socket.emit("get_update", roomCode); 
        
        const btn = document.getElementById('next-btn');
        btn.innerText = (currentStep === currentQuestions.length - 1) ? "Финиш" : "Следующий";
    } else {
        renderPlayerQuestion();
    }
}

function updateHostUI() {

    const q = currentQuestions[currentStep];

    document.getElementById("host-question-text").innerText =
        `${currentStep + 1}. ${q.text}`;

    document.getElementById("correct-answer").innerText =
        "Правильный ответ: " + q.correct;

}

function renderPlayerQuestion() {
    const q = currentQuestions[currentStep];
    const area = document.getElementById('player-answer-area');
    const title = document.getElementById('player-question-text');
    
    if (!q) return;

    title.innerText =
    `${currentStep + 1} / ${currentQuestions.length}
    ${q.text}`;
    
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

function showToast(text) {

    let toast = document.getElementById("toast");

    if (!toast) {

        toast = document.createElement("div");
        toast.id = "toast";

        toast.style.position = "fixed";
        toast.style.bottom = "30px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";

        toast.style.background = "#333";
        toast.style.color = "white";

        toast.style.padding = "12px 20px";
        toast.style.borderRadius = "12px";

        toast.style.fontWeight = "600";
        toast.style.zIndex = "9999";

        document.body.appendChild(toast);

    }

    toast.innerText = text;
    toast.style.display = "block";

    setTimeout(() => {
        toast.style.display = "none";
    }, 2000);

}

window.onload = init;