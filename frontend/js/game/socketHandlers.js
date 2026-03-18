/**
 * Модуль обработчиков socket.io для страницы игры.
 * Здесь только реакция на события сервера — без бизнес-логики,
 * которая живёт в common.js (состояние, рендер, действия хоста/игрока).
 */

/**
 * Обновление списка игроков в лобби (хост и игроки видят одно и то же).
 * players: массив игроков с полями name, is_host, emoji и т.п.
 */
socket.on("update_players", (players) => {
  const lobbyContainers = ["lobby-players-list", "player-lobby-list"];

  lobbyContainers.forEach((id) => {
    const container = document.getElementById(id);
    if (!container) return;

    container.innerHTML = players
      .filter((p) => !p.is_host)
      .map((p) => {
        const isMe = p.name === playerName;

        return `
                    <div class="player-card-lobby ${
                      isMe ? "is-me" : ""
                    }" onclick="handleEmojiClick(this)">
                        ${isMe ? '<div class="me-badge">ВЫ</div>' : ""}
                        
                        <div class="avatar-emoji">
                            ${p.emoji || "👤"}
                        </div>
                        
                        <div class="player-name-label">
                            ${p.name}
                        </div>
                    </div>
                `;
      })
      .join("");
  });
});

/**
 * Старт игры:
 * - сбрасывает шаги текущего раунда,
 * - для хоста показывает игровую зону и карточки игроков,
 * - для игроков переключает с экрана ожидания на экран вопроса.
 */
socket.on("game_started", (players) => {
  currentStep = 0;
  maxReachedStep = 0;
  realGameStep = 0;
  const me = players.find((p) => p.name === playerName);

  if (me) myEmoji = me.emoji;
  if (role === "host") {
    document.getElementById("host-lobby").style.display = "none";
    document.getElementById("host-game-area").style.display = "block";

    renderProgress();
    updateHostUI();

    const grid = document.getElementById("players-answers-grid");
    grid.innerHTML = players
      .filter((p) => !p.is_host)
      .map(
        (p) => `
            <div class="answer-card waiting">
                <div class="answer-info">
                    <div class="answer-name" style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 2rem;">${p.emoji || "👤"}</span> 
                        <span style="font-size: 1.2rem; font-weight: bold;">${
                          p.name
                        }</span>
                    </div>
                    <div class="answer-text">⏳ ожидает ответа</div>
                </div>
                <div class="answer-buttons"></div>
            </div>
        `
      )
      .join("");

    renderScoreboard(players);
  } else {
    document.getElementById("player-wait").style.display = "none";
    document.getElementById("player-game-area").style.display = "block";
    renderPlayerQuestion();
  }
  socket.emit("get_update", roomCode);
  renderProgress();
});

/**
 * Обновление ответов игроков на текущий вопрос (видно только хосту).
 * Обновляет карточки с ответами и турнирную таблицу.
 */
socket.on("update_answers", (players) => {
  if (role !== "host") return;

  renderScoreboard(players);
  const grid = document.getElementById("players-answers-grid");
  if (!grid) return;

  const currentQ = currentQuestions[currentStep];

  grid.innerHTML = players
    .filter((p) => !p.is_host)
    .map((p) => {
      const answers = p.answers_history || {};
      const scores = p.scores_history || {};
      const stepKey = currentStep.toString();
      const answerText = answers[stepKey];
      const questionScore = scores[stepKey];
      const isAnswered =
        answerText !== undefined &&
        answerText !== null &&
        answerText.toString().trim() !== "";

      let statusClass = "waiting";
      let displayAnswer = "⏳ ожидает ответа...";
      let btnHTML = "";

      if (isAnswered) {
        displayAnswer = answerText;
        const isCorrect =
          answerText.toLowerCase().trim() ===
          currentQ.correct.toLowerCase().trim();
        const currentStatus =
          questionScore !== undefined ? questionScore : isCorrect ? 1 : 0;

        if (currentStatus === 1) {
          statusClass = "correct";
          btnHTML = `
                    <div class="card-controls">
                        <span class="status-label">Верно</span>
                        <button class="btn-mini btn-minus" onclick="changeScore('${
                          p.name
                        }', -1)" title="Забрать балл">
                            <svg viewBox="0 0 24 24"><path d="M18 12H6" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
                        </button>
                    </div>`;
        } else {
          statusClass = "wrong";
          btnHTML = `
                    <div class="card-controls">
                        <button class="btn-mini btn-plus" onclick="changeScore('${
                          p.name
                        }', 1)" title="Засчитать балл">
                            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
                        </button>
                    </div>`;
        }
      }

      return `
            <div class="answer-card ${statusClass}">
                <div class="card-header">
                    <div class="player-info">
                        <span class="p-emoji">${p.emoji || "👤"}</span> 
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
    })
    .join("");
});

/**
 * Показ финальных результатов после завершения игры.
 * Рисует экран с победителями, рейтингом и разбором вопросов.
 */
socket.on("show_results", (data) => {
  document.getElementById("host-screen").style.display = "none";
  document.getElementById("player-screen").style.display = "none";
  document.getElementById("finish-screen").style.display = "block";

  // ЗАПУСК КОНФЕТТИ
  // Стреляем дважды с разных сторон для "эпичности"
  const duration = 3 * 1000; // 3 секунды
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors: ['#FFD700', '#f175ff', '#43fff2'] // Твои фирменные цвета
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.8 },
      colors: ['#FFD700', '#f175ff', '#43fff2']
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());

  const resultsList = document.getElementById("final-results-list");
  if (!resultsList) return;

  if (data.questions) window.allQuizQuestions = data.questions;

  const players = data.results || [];
  const questions = window.allQuizQuestions || [];
  const myData = players.find((p) => p.name === playerName);

  const maxScoreLocal = players.length > 0 ? players[0].score : 0;
  const winners = players.filter(
    (p) => p.score === maxScoreLocal && maxScoreLocal > 0
  );
  const others = players.filter(
    (p) => p.score !== maxScoreLocal || maxScoreLocal === 0
  );

  let html = `
        <div class="confetti-wrapper">
            <div style="margin-bottom: 20px; text-align: center;">
                <span class="crown-appear">👑</span>
                <h2 style="color: var(--party-purple); font-size: 1.8rem; margin: 5px 0; font-weight: 800;">Итоги викторины</h2>
            </div>

            ${winners
              .map(
                (w) => `
                <div class="player-row-lobby winner-card-epic" onclick="spawnConfetti(event)">
                    <div class="winner-medal-container">🥇</div>
                    <div class="winner-emoji-container">${w.emoji}</div>

                    <div style="text-align: left; flex: 1;">
                        <div class="winner-label"">Победитель</div>
                        <div class="shiny-text-name">${w.name}</div>
                    </div>
                    
                    <div class="winner-score-badge">
                        ${w.score}
                    </div>
                </div>
            `
              )
              .join("")}
        </div>
        
        ${
          others.length > 0
            ? `
            <div style="margin-top: 25px;">
                <h4 class="rating-label">Рейтинг игроков</h4>
                <div>
                    ${others
                      .map((p, i) => {
                        const rank = i + 2; 
                        
                        // ПРОСТОЕ СЛОЖЕНИЕ СТРОК — VS Code будет счастлив
                        let rankDisplay = "#" + rank;

                        if (rank === 2) rankDisplay = '🥈';
                        if (rank === 3) rankDisplay = '🥉';

                        return `
                        <div class="player-row-lobby is-rating-row">
                            <span class="rank-number">${rankDisplay}</span>
                            <div class="participant-emoji-container">
                                ${p.emoji}
                            </div>

                            <span class="player-name-lobby">${p.name}</span>
                            <span class="player-score-lobby">${p.score}</span>
                        </div>
                        `;
                      })
                      .join("")}
                </div>
            </div>
        `
            : ""
        }

        <div style="margin-top: 30px; padding-bottom: 20px;">
            <div class="review-acc-header" onclick="toggleReview(this)">
                <span class="review-acc-title">Разбор вопросов</span>
                <span id="acc-arrow" class="review-acc-arrow">▼</span>
            </div>

            <div id="review-content" class="accordion-content">
                <div style="padding-top: 15px;">
                    ${questions
                      .map((q, i) => {
                        const myAnswer =
                          (myData && myData.answers && myData.answers[i]) ||
                          "—";
                        const isCorrect =
                          myAnswer.toLowerCase().trim() ===
                          q.correct.toLowerCase().trim();

                        const othersList = players
                          .filter((p) => p.name !== playerName)
                          .map((p) => {
                              const ans = (p.answers && p.answers[i.toString()]) || "—";
                              const isAnsCorr = ans.toLowerCase().trim() === q.correct.toLowerCase().trim();
                              
                              return `
                                  <div class="other-player-card">
                                      <span class="other-player-name">${p.emoji} ${p.name}</span>
                                      <span class="other-player-ans ${isAnsCorr ? 'is-correct' : ''}">
                                          ${ans}
                                      </span>
                                  </div>`;
                          })
                          .join("");

                        return `
                        <div class="review-card" style="animation-delay: ${i * 0.05}s;">
                            <div class="review-q-number">Вопрос ${
                              i + 1
                            }</div>
                            <div class="review-q-text">${
                              q.text
                            }</div>
                            
                            <div class="review-answers-grid">
                                <div class="answer-box is-correct">
                                    <div class="answer-label">Верно</div>
                                    <div class="answer-value">${q.correct}</div>
                                </div>

                                <div class="answer-box is-user ${isCorrect ? 'is-correct-status' : 'is-wrong-status'}">
                                    <div class="answer-label">Твой ответ</div>
                                    <div class="answer-value">${myAnswer || '—'}</div>
                                </div>
                            </div>

                            <div style="margin-top: 10px;">
                                <div class="others-label">Другие игроки:</div>
                                <div class="others-scroll-area">
                                    ${othersList || '<span style="opacity: 0.5; font-size: 0.75rem;">—</span>'}
                                </div>
                            </div>
                        </div>
                        `;
                      })
                      .join("")}
                </div>
            </div>
        </div>
    `;

  resultsList.innerHTML = html;
});

function toggleReview(element) {
    const content = document.getElementById('review-content');
    
    // Переключаем класс у контента
    content.classList.toggle('active');
    
    // Переключаем класс у самой шапки для поворота стрелки
    element.classList.toggle('is-active');
}

/**
 * Переход к следующему шагу (событие приходит после решения сервера
 * перейти вперёд или при ручной навигации хоста).
 */
socket.on("move_to_next", (data) => {
  currentStep = data.step;
  realGameStep = data.step;

  if (currentStep > maxReachedStep) {
    maxReachedStep = currentStep;
  }

  refreshUI();
});

/**
 * Результат проверки, все ли игроки ответили на вопрос.
 * Если не все — предлагаем хосту подтвердить переход вперёд.
 */
socket.on("answers_check_result", (data) => {
  if (!data.allAnswered) {
    showModernConfirm("Не все ответили! Всё равно идём дальше?", () => {
      proceedToNext();
    });
  } else {
    proceedToNext();
  }
});

/**
 * Синхронизация состояния для только что подключившегося клиента
 * или при обновлении страницы:
 * - подтягивает текущий шаг и прогресс,
 * - переключает нужный экран (ожидание / игра / финиш),
 * - восстанавливает ответ игрока, если он уже был отправлен.
 */
socket.on("sync_state", (data) => {
  currentStep = data.currentStep;
  realGameStep = data.currentStep;

  if (data.maxReachedStep !== undefined) {
    maxReachedStep = data.maxReachedStep;
  }

  if (data.emoji) myEmoji = data.emoji;

  if (data.isFinished) {
    document.getElementById("host-screen").style.display = "none";
    document.getElementById("player-screen").style.display = "none";
    document.getElementById("finish-screen").style.display = "block";
    return;
  }

  if (role !== "host") {
    const waitEmoji = document.getElementById("player-wait-emoji");
    const waitName = document.getElementById("player-wait-name");
    if (waitEmoji) waitEmoji.innerText = data.emoji || myEmoji;
    if (waitName) waitName.innerText = playerName;
  }

  if (role === "host") {
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
        const answerArea = document.getElementById("player-answer-area");
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

