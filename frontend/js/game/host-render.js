/* =========================================
   РЕНДЕР ИНТЕРФЕЙСА ХОСТА
   Прогресс-бар, таблица очков,
   текст вопроса, навигация по шагам.
========================================= */


// Прогресс-бар вопросов (кликабельные шаги)
function renderProgress() {
  const container = document.getElementById("questions-progress");
  if (!container) return;

  container.innerHTML = currentQuestions
    .map((_, i) => {
      let stateClass = "future";
      if (i < maxReachedQuestion - 1) stateClass = "done";
      if (i === currentQuestion - 1) stateClass = "active";

      const showDot = i === maxReachedQuestion - 1;

      return `
        <div class="q-step-wrapper" style="display: inline-flex; flex-direction: column; align-items: center; margin: 0 4px; cursor: pointer;">
            <div class="q-step ${stateClass}" onclick="jumpToQuestion(${i + 1})">
                ${i + 1}
            </div>
            ${showDot ? '<div class="pulse-dot"></div>' : '<div style="height: 12px; margin-top: 4px;"></div>'}
        </div>
        `;
    })
    .join("");
}


// Турнирная таблица очков (обновление без перестановки)
function renderScoreboard(players) {
  const board = document.getElementById("scoreboard");
  if (!board) return;

  const sorted = [...players]
    .filter((p) => !p.is_host)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  if (sorted.length === 0) {
    board.innerHTML = '<div class="scoreboard-empty">Ожидаем первых ответов...</div>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];

  // Первый рендер — создаём таблицу полностью
  if (board.children.length === 0 || board.querySelector(".scoreboard-empty")) {
    board.innerHTML = sorted
      .map((p, i) => {
        const rankEmoji = i < 3 ? medals[i] : (i + 1);
        const isLeader = i === 0;
        const rankClass = i === 0 ? 'rank-1st' : i === 1 ? 'rank-2nd' : i === 2 ? 'rank-3rd' : 'rank-other';
        const playerEmoji = p.emoji || '👤';

        return `
          <div class="scoreboard-card ${rankClass} ${isLeader ? 'is-leader' : ''}" data-player="${escapeHtml(p.name)}" style="animation: scoreboardSlideIn 0.5s ease-out ${i * 0.1}s both;">
            <div class="scoreboard-rank">${rankEmoji}</div>
            <div class="scoreboard-emoji">${playerEmoji}</div>
            <div class="scoreboard-info">
              <div class="scoreboard-name">${escapeHtml(p.name)}</div>
              <div class="scoreboard-score">${p.score || 0}🏆</div>
            </div>
            ${isLeader ? '<div class="scoreboard-crown">⭐</div>' : ''}
          </div>
        `;
      })
      .join("");
    return;
  }

  // Обновление — только обновляем очки на месте, без перестановки
  const playerScoreMap = {};
  sorted.forEach(p => { playerScoreMap[p.name] = p.score || 0; });

  for (const card of board.querySelectorAll(".scoreboard-card")) {
    const name = card.getAttribute("data-player");
    if (name in playerScoreMap) {
      const scoreEl = card.querySelector(".scoreboard-score");
      const newText = `${playerScoreMap[name]}🏆`;
      if (scoreEl && scoreEl.textContent !== newText) {
        scoreEl.textContent = newText;
        card.classList.add("score-changed");
        card.addEventListener("animationend", () => card.classList.remove("score-changed"), { once: true });
      }
    }
  }

  // Добавляем новых игроков, которых ещё нет в DOM
  const existingNames = new Set(
    [...board.querySelectorAll(".scoreboard-card")].map(c => c.getAttribute("data-player"))
  );
  sorted.forEach((p, i) => {
    if (!existingNames.has(p.name)) {
      const rankEmoji = i < 3 ? medals[i] : (i + 1);
      const isLeader = i === 0;
      const rankClass = i === 0 ? 'rank-1st' : i === 1 ? 'rank-2nd' : i === 2 ? 'rank-3rd' : 'rank-other';
      const playerEmoji = p.emoji || '👤';
      const newCard = document.createElement("div");
      newCard.className = `scoreboard-card ${rankClass} ${isLeader ? 'is-leader' : ''} score-pop-in`;
      newCard.setAttribute("data-player", p.name);
      newCard.innerHTML = `
        <div class="scoreboard-rank">${rankEmoji}</div>
        <div class="scoreboard-emoji">${playerEmoji}</div>
        <div class="scoreboard-info">
          <div class="scoreboard-name">${escapeHtml(p.name)}</div>
          <div class="scoreboard-score">${p.score || 0}🏆</div>
        </div>
        ${isLeader ? '<div class="scoreboard-crown">⭐</div>' : ''}
      `;
      newCard.addEventListener("animationend", () => newCard.classList.remove("score-pop-in"), { once: true });
      board.appendChild(newCard);
    }
  });
}


// Обновление UI хоста: текст вопроса, правильный ответ, стиль кнопки
function updateHostUI() {
  const q = currentQuestions[currentQuestion - 1];
  const isLastQuestion = currentQuestion === currentQuestions.length;

  document.getElementById("host-question-text").innerText =
    `${currentQuestion}. ${q.text}`;
  document.getElementById("correct-answer").innerText =
    "Правильный ответ: " + q.correct;

  const nextBtn = document.getElementById("next-btn");
  if (nextBtn) {
    if (isLastQuestion) {
      nextBtn.innerText = "🏆 ПОДВЕСТИ ИТОГИ";
      nextBtn.style.background =
        "linear-gradient(135deg, #f6d365 0%, #fda085 100%)";
    } else {
      nextBtn.innerText = "СЛЕДУЮЩИЙ ВОПРОС";
      nextBtn.style.background = "var(--party-pink)";
    }
  }
}


// Прыжок к конкретному шагу из прогресс-бара (только хост)
function jumpToQuestion(question) {
  if (role !== "host") return;
  currentQuestion = question;
  socket.emit("move_to_step", { room: roomCode, question: question });
  socket.emit("get_update", roomCode);
  refreshUI();
}
