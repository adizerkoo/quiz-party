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
                <div class="player-row-lobby winner-card-epic" style="padding: 15px 20px; justify-content: flex-start; margin-bottom: 10px;">
                    <span class="player-emoji-icon" style="font-size: 3rem; margin-right: 15px;">${
                      w.emoji
                    }</span>
                    <div style="text-align: left; flex: 1;">
                        <div style="font-size: 0.7rem; opacity: 0.6; font-weight: 700; text-transform: uppercase;">Победитель</div>
                        <div class="shiny-text-name" style="font-size: 1.4rem;">${
                          w.name
                        }</div>
                    </div>
                    <div style="background: #FFD700; color: #000; padding: 5px 15px; border-radius: 15px; font-weight: 800; font-size: 1.2rem;">
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
                <h4 style="opacity: 0.5; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; padding-left: 10px;">Рейтинг игроков</h4>
                <div style="background: rgba(255,255,255,0.3); border-radius: 15px; padding: 5px;">
                    ${others
                      .map(
                        (p, i) => `
                        <div class="player-row-lobby" style="background: transparent; border: none; border-bottom: 1px solid rgba(0,0,0,0.03); box-shadow: none; margin-bottom: 0; padding: 10px 15px;">
                            <span style="font-weight: 800; opacity: 0.3; width: 25px; font-size: 0.9rem;">#${i +
                              2}</span>
                            <span class="player-emoji-icon" style="font-size: 1.4rem; margin-right: 10px;">${
                              p.emoji
                            }</span>
                            <span class="player-name-lobby" style="flex: 1; text-align: left; font-size: 1rem; font-weight: 600;">${
                              p.name
                            }</span>
                            <span style="font-weight: 700; opacity: 0.7; font-size: 1rem;">${
                              p.score
                            }</span>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
        `
            : ""
        }

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
                            const ans =
                              (p.answers && p.answers[i.toString()]) || "—";
                            const isAnsCorr =
                              ans.toLowerCase().trim() ===
                              q.correct.toLowerCase().trim();
                            return `
                                    <div style="display: inline-flex; flex-direction: column; background: rgba(241, 117, 255, 0.08); padding: 8px 12px; border-radius: 12px; margin-right: 8px; min-width: 130px; max-width: 220px; border: 1px solid rgba(255,255,255,0.5);">
                                        <span style="font-size: 0.6rem; opacity: 0.6; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            ${p.emoji} ${p.name}
                                        </span>
                                        <span style="font-size: 0.85rem; font-weight: 700; color: ${
                                          isAnsCorr ? "#00b894" : "#2d3436"
                                        }; word-break: break-word; line-height: 1.2;">
                                            ${ans}
                                        </span>
                                    </div>`;
                          })
                          .join("");

                        return `
                        <div class="review-card" style="background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 18px; padding: 15px; margin-bottom: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); animation-delay: ${
                          i * 0.05
                        }s;">
                            <div style="font-size: 0.65rem; opacity: 0.5; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">Вопрос ${
                              i + 1
                            }</div>
                            <div style="font-weight: 700; font-size: 0.95rem; color: #2d3436; margin-bottom: 12px;">${
                              q.text
                            }</div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                                <div style="background: rgba(67, 242, 128, 0.09); padding: 8px; border-radius: 10px;">
                                    <div style="font-size: 0.55rem; opacity: 0.6; text-transform: uppercase; font-weight: 800;">Верно</div>
                                    <div style="color: #00b894; font-weight: 800; font-size: 0.85rem;">${
                                      q.correct
                                    }</div>
                                </div>
                                <div style="background: rgba(255, 255, 255, 0.4); padding: 8px; border-radius: 10px; border: 1px solid ${
                                  isCorrect
                                    ? "rgba(0, 184, 148, 0.2)"
                                    : "rgba(255, 118, 117, 0.2)"
                                }">
                                    <div style="font-size: 0.55rem; opacity: 0.6; text-transform: uppercase; font-weight: 800;">Твой ответ</div>
                                    <div style="color: ${
                                      isCorrect ? "#00b894" : "#d63031"
                                    }; font-weight: 800; font-size: 0.85rem;">${myAnswer}</div>
                                </div>
                            </div>

                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.55rem; opacity: 0.4; text-transform: uppercase; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;">Другие игроки:</div>
                                <div style="display: flex; overflow-x: auto; padding-bottom: 5px; -webkit-overflow-scrolling: touch; scrollbar-width: none;">
                                    ${
                                      othersList ||
                                      '<span style="opacity: 0.5; font-size: 0.75rem;">—</span>'
                                    }
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

