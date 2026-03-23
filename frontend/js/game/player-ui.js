/* =========================================
   ИНТЕРФЕЙС ИГРОКА
   Рендер вопросов, навигация по истории,
   отправка ответов, анимация аватара.
========================================= */


// Рендерит текущий вопрос и область ответа на стороне игрока
function renderPlayerQuestion(slideDir) {
  const step = playerViewQuestion;
  const q = currentQuestions[step - 1];
  const area = document.getElementById("player-answer-area");
  const title = document.getElementById("player-question-text");
  if (!q) return;

  const canGoBack = step > 1;
  const canGoForward = step < realGameQuestion;
  const showNav = realGameQuestion > 1;

  // При навигации — slide, при загрузке/переходе — reveal
  const animClass = slideDir === 'left' ? 'slide-nav-left'
                  : slideDir === 'right' ? 'slide-nav-right'
                  : 'reveal-anim';

  const navHTML = showNav ? `
      <div class="player-nav-arrows">
          <button class="btn-nav-arrow ${canGoBack ? '' : 'nav-disabled'}" onclick="playerNavBack()" ${canGoBack ? '' : 'disabled'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div class="question-counter">
              ${step} <span style="opacity: 0.3;">/ ${currentQuestions.length}</span>
          </div>
          <button class="btn-nav-arrow ${canGoForward ? '' : 'nav-disabled'}" onclick="playerNavForward()" ${canGoForward ? '' : 'disabled'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
      </div>
  ` : `
      <div class="question-counter">
          ${step} <span style="opacity: 0.3;">/ ${currentQuestions.length}</span>
      </div>
  `;

  title.innerHTML = `
        <div class="player-header">
            <div class="player-info-badge">
                <span style="font-size: 1.2rem;">${myEmoji}</span>
                <span class="player-name-text">${escapeHtml(playerName)}</span>
            </div>
            ${navHTML}
        </div>
        <div class="question-container ${animClass}">
            <div class="question-main-text">${escapeHtml(q.text)}</div>
            <div class="question-line"></div>
        </div>
    `;

  // Просмотр прошлого вопроса — только показ ответа
  if (step < realGameQuestion) {
    const pastAnswer = myAnswersHistory[step.toString()];
    area.innerHTML = `
        <div class="sent-confirmation ${animClass}">
            <div class="your-answer-preview">
                <div class="your-answer-label">Твой ответ:</div>
                <div class="your-answer-text">${pastAnswer ? escapeHtml(pastAnswer) : '—'}</div>
            </div>
            <button class="btn-back-to-current" onclick="goToCurrentQuestion()">
                Вернуться к текущему вопросу →
            </button>
        </div>
    `;
    return;
  }

  // Текущий вопрос, но уже отвечен
  if (myAnswersHistory[step.toString()]) {
    const myAnswer = myAnswersHistory[step.toString()];
    area.innerHTML = `
        <div class="sent-confirmation ${animClass}">
            <div class="status-badge-sent">Отправлено 🚀</div>
            <div class="your-answer-preview">
                <div class="your-answer-label">Твой ответ:</div>
                <div class="your-answer-text">${escapeHtml(myAnswer)}</div>
            </div>
            <div class="waiting-loader">
                <div class="pulse-dot" style="display:inline-block; margin-right:8px;"></div>
                <span>Ждем остальных игроков...</span>
            </div>
        </div>
    `;
    return;
  }

  // Текущий вопрос, ещё не отвечен — варианты или текстовое поле
  if (q.type === "options") {
    area.innerHTML = `
            <div class="answers-grid ${animClass}">
                ${q.options
                  .map(
                    (o) => `
                    <button class="btn-answer" onclick="sendAnswer(${escapeHtml(JSON.stringify(o))})">
                        ${escapeHtml(o)}
                    </button>
                `
                  )
                  .join("")}
            </div>
        `;
  } else {
    area.innerHTML = `
            <div class="input-group-container ${animClass}">
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


// Навигация назад по истории вопросов
function playerNavBack() {
  if (playerViewQuestion > 1) {
    playerViewQuestion--;
    renderPlayerQuestion('right');
  }
}


// Навигация вперёд (не дальше текущего вопроса)
function playerNavForward() {
  if (playerViewQuestion < realGameQuestion) {
    playerViewQuestion++;
    renderPlayerQuestion('left');
  }
}


// Возврат к текущему вопросу из просмотра истории
function goToCurrentQuestion() {
  playerViewQuestion = realGameQuestion;
  renderPlayerQuestion('left');
}


// Отправка ответа на сервер + показ подтверждения
function sendAnswer(val) {
  myAnswersHistory[currentQuestion.toString()] = val;
  const answerTime = window._questionShownAt
    ? Math.round((Date.now() - window._questionShownAt) / 100) / 10
    : null;

  socket.emit("send_answer", {
    room: roomCode,
    name: playerName,
    answer: val,
    questionIndex: currentQuestion,
    answerTime: answerTime,
  });

  const answerArea = document.getElementById("player-answer-area");
  if (answerArea) {
    answerArea.innerHTML = `
            <div class="sent-confirmation">
                <div class="status-badge-sent">Отправлено 🚀</div>
                <div class="your-answer-preview">
                    <div class="your-answer-label">Твой ответ:</div>
                    <div class="your-answer-text">${escapeHtml(val)}</div>
                </div>
                <div class="waiting-loader">
                    <div class="pulse-dot" style="display:inline-block; margin-right:8px;"></div>
                    <span>Ждем остальных игроков...</span>
                </div>
            </div>
        `;
  }
}


// Валидация текстового ответа перед отправкой
function validateAndSend() {
  const input = document.getElementById("ans-text");
  const val = input.value.trim();

  if (val === "") {
    const box = document.getElementById("input-box");
    box.classList.add("shake-anim");
    setTimeout(() => box.classList.remove("shake-anim"), 500);
    if (window.navigator.vibrate) window.navigator.vibrate(50);
    return;
  }
  sendAnswer(val);
}


// Анимация аватара при клике в лобби
function handleEmojiClick(element) {
  const emoji = element.querySelector(".avatar-emoji");
  if (emoji) {
    emoji.classList.add("avatar-clicked");
    setTimeout(() => {
      emoji.classList.remove("avatar-clicked");
    }, 500);
  }
}
