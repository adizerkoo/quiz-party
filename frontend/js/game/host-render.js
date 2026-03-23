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

  // Обновление — обновляем очки и переставляем карточки по новому порядку
  const playerScoreMap = {};
  sorted.forEach(p => { playerScoreMap[p.name] = p.score || 0; });

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

  // Снимаем inline-анимацию первичного рендера (fill-mode:both блокирует transform)
  const allCards = [...board.querySelectorAll(".scoreboard-card")];
  allCards.forEach(card => {
    if (card.style.animation) card.style.animation = '';
  });

  // FLIP — First: запоминаем старые позиции
  const firstRects = new Map();
  allCards.forEach(card => {
    firstRects.set(card, card.getBoundingClientRect());
  });

  // Обновляем очки, ранги, порядок
  sorted.forEach((p, i) => {
    const card = board.querySelector(`[data-player="${CSS.escape(p.name)}"]`);
    if (!card) return;

    // Обновляем очки
    const scoreEl = card.querySelector(".scoreboard-score");
    const newText = `${p.score || 0}🏆`;
    if (scoreEl && scoreEl.textContent !== newText) {
      scoreEl.textContent = newText;
      card.classList.add("score-changed");
      card.addEventListener("animationend", () => card.classList.remove("score-changed"), { once: true });
    }

    // Обновляем ранг
    const rankEmoji = i < 3 ? medals[i] : (i + 1);
    const rankEl = card.querySelector(".scoreboard-rank");
    if (rankEl) rankEl.textContent = rankEmoji;

    // Обновляем класс ранга
    card.classList.remove('rank-1st', 'rank-2nd', 'rank-3rd', 'rank-other', 'is-leader');
    const rankClass = i === 0 ? 'rank-1st' : i === 1 ? 'rank-2nd' : i === 2 ? 'rank-3rd' : 'rank-other';
    card.classList.add(rankClass);
    if (i === 0) card.classList.add('is-leader');

    // Обновляем корону
    let crownEl = card.querySelector(".scoreboard-crown");
    if (i === 0 && !crownEl) {
      crownEl = document.createElement("div");
      crownEl.className = "scoreboard-crown";
      crownEl.textContent = "⭐";
      card.appendChild(crownEl);
    } else if (i !== 0 && crownEl) {
      crownEl.remove();
    }

    // Переставляем карточку в правильную позицию
    board.appendChild(card);
  });

  // FLIP — Last + Invert + Play
  const flips = [];
  allCards.forEach(card => {
    const first = firstRects.get(card);
    if (!first) return;
    const last = card.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx === 0 && dy === 0) return;
    flips.push({ card, dx, dy });
  });

  if (flips.length > 0) {
    // Invert: мгновенно ставим карточки на старые позиции
    flips.forEach(({ card, dx, dy }) => {
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      card.style.transition = 'transform 0s';
    });

    // Принудительный reflow — браузер фиксирует текущие transform
    void board.offsetWidth;

    // Play: анимируем к новым позициям
    flips.forEach(({ card }) => {
      card.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      card.style.transform = '';
    });

    // Cleanup inline-стилей после анимации
    setTimeout(() => {
      flips.forEach(({ card }) => {
        card.style.transition = '';
        card.style.transform = '';
      });
    }, 550);
  }
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
