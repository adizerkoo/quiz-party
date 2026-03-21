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


// Турнирная таблица очков (обновляет только изменённые элементы)
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
          <div class="scoreboard-card ${rankClass} ${isLeader ? 'is-leader' : ''}" data-player="${p.name}" style="animation: scoreboardSlideIn 0.5s ease-out ${i * 0.1}s both;">
            <div class="scoreboard-rank">${rankEmoji}</div>
            <div class="scoreboard-emoji">${playerEmoji}</div>
            <div class="scoreboard-info">
              <div class="scoreboard-name">${p.name}</div>
              <div class="scoreboard-score">${p.score || 0}🏆</div>
            </div>
            ${isLeader ? '<div class="scoreboard-crown">⭐</div>' : ''}
          </div>
        `;
      })
      .join("");
    return;
  }

  // Обновляем только изменённые элементы
  sorted.forEach((p, i) => {
    const rankEmoji = i < 3 ? medals[i] : (i + 1);
    const isLeader = i === 0;
    const rankClass = i === 0 ? 'rank-1st' : i === 1 ? 'rank-2nd' : i === 2 ? 'rank-3rd' : 'rank-other';

    let card = board.querySelector(`[data-player="${p.name}"]`);

    if (!card) {
      // Новый игрок — добавляем
      const playerEmoji = p.emoji || '👤';
      const newCard = document.createElement("div");
      newCard.className = `scoreboard-card ${rankClass} ${isLeader ? 'is-leader' : ''}`;
      newCard.setAttribute("data-player", p.name);
      newCard.innerHTML = `
        <div class="scoreboard-rank">${rankEmoji}</div>
        <div class="scoreboard-emoji">${playerEmoji}</div>
        <div class="scoreboard-info">
          <div class="scoreboard-name">${p.name}</div>
          <div class="scoreboard-score">${p.score || 0}🏆</div>
        </div>
        ${isLeader ? '<div class="scoreboard-crown">⭐</div>' : ''}
      `;
      board.appendChild(newCard);
    } else {
      // Обновляем существующего игрока
      card.className = `scoreboard-card ${rankClass} ${isLeader ? 'is-leader' : ''}`;
      card.removeAttribute("style");

      card.querySelector(".scoreboard-rank").textContent = rankEmoji;
      card.querySelector(".scoreboard-score").textContent = `${p.score || 0}🏆`;

      // Перемещаем карточку в правильную позицию
      if (board.children[i] !== card) {
        board.insertBefore(card, board.children[i]);
      }

      // Коронка лидера
      const crown = card.querySelector(".scoreboard-crown");
      if (isLeader && !crown) {
        const newCrown = document.createElement("div");
        newCrown.className = "scoreboard-crown";
        newCrown.textContent = "⭐";
        card.appendChild(newCrown);
      } else if (!isLeader && crown) {
        crown.remove();
      }
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
