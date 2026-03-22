/**
 * @file answerHandlers.js
 * @description Обработчики событий ответов игроков (обновление ответов, проверка готовности)
 * @module handlers/answerHandlers
 * 
 * Этот модуль отвечает за:
 * - Получение и отображение ответов игроков на текущий вопрос
 * - Проверку верности ответов (с визуальными индикаторами)
 * - Возможность хосту изменять баллы (добавлять/убирать очки)
 * - Проверку, ответили ли все игроки
 * - Запрос подтверждения на переход дальше при неполных ответах
 */

/**
 * Регистрирует обработчик события "update_answers"
 * 
 * Обновляет ответы игроков на текущий вопрос. Видно только хосту.
 * Обновляет карточки с ответами, показывает верные/неверные ответы,
 * предоставляет кнопки для изменения баллов.
 * 
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerAnswerUpdateHandler(socket) {
  /**
   * Событие обновления ответов игроков
   * @event update_answers
   * @param {Array<Object>} players - Массив игроков с их ответами
   * @param {string} players[].name - Имя игрока
   * @param {string} players[].emoji - Эмодзи игрока
   * @param {Object} players[].answers_history - История ответов {stepKey: answer}
   * @param {Object} players[].scores_history - История баллов {stepKey: score}
   */
  socket.on("update_answers", (players) => {
    if (role !== "host") return;

    // Обновляем статус: если игрок снова онлайн, убираем из отключённых
    players.forEach((p) => {
      if (!p.is_host && p.connected) {
        disconnectedPlayers.delete(p.name);
      }
    });

    renderScoreboard(players);
    const grid = document.getElementById("players-answers-grid");
    if (!grid) return;

    const currentQ = currentQuestions[currentQuestion - 1];

    grid.innerHTML = players
      .filter((p) => !p.is_host)
      .map((p) => _renderAnswerCard(p, currentQ))
      .join("");
  });
}

/**
 * Рендерит одну карточку ответа с статусом и кнопками управления
 * @private
 * @param {Object} player - Объект игрока
 * @param {Object} question - Текущий вопрос
 * @returns {string} HTML строка карточки
 */
function _renderAnswerCard(player, question) {
  const answers = player.answers_history || {};
  const scores = player.scores_history || {};
  const stepKey = currentQuestion.toString();
  const answerText = answers[stepKey];
  const questionScore = scores[stepKey];
  const isDisconnected = disconnectedPlayers.has(player.name);
  const isPastQuestion = currentQuestion < realGameQuestion;
  const isFutureQuestion = currentQuestion > realGameQuestion;
  
  const isAnswered =
    answerText !== undefined &&
    answerText !== null &&
    answerText.toString().trim() !== "";

  let statusClass = "waiting";
  let displayAnswer = "⏳ ожидает ответа...";
  let btnHTML = "";
  // Показываем оффлайн-метки на текущем вопросе (даже если ответил)
  const showDisconnectedMark = isDisconnected && !isFutureQuestion && !isPastQuestion;

  if (isFutureQuestion) {
    statusClass = "waiting";
    displayAnswer = "🔮 ещё не дошли";
  } else if (isDisconnected && !isAnswered) {
    if (isPastQuestion) {
      if (questionScore === 1) {
        statusClass = "correct";
        displayAnswer = "⏩ пропущено";
        btnHTML = `
          <div class="card-controls">
            <span class="status-label">Засчитано</span>
            <button class="btn-mini btn-minus" onclick="changeScore(${escapeHtml(JSON.stringify(player.name))}, -1)" title="Забрать балл">
              <svg viewBox="0 0 24 24"><path d="M18 12H6" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
            </button>
          </div>`;
      } else {
        statusClass = "skipped";
        displayAnswer = "⏩ пропущено";
        btnHTML = `
          <div class="card-controls">
            <button class="btn-mini btn-plus" onclick="changeScore(${escapeHtml(JSON.stringify(player.name))}, 1)" title="Засчитать балл">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
            </button>
          </div>`;
      }
    } else {
      statusClass = "disconnected";
      displayAnswer = "отключился";
    }
  } else if (!isAnswered && isPastQuestion) {
    if (questionScore === 1) {
      statusClass = "correct";
      displayAnswer = "⏩ пропущено";
      btnHTML = `
        <div class="card-controls">
          <span class="status-label">Засчитано</span>
          <button class="btn-mini btn-minus" onclick="changeScore(${escapeHtml(JSON.stringify(player.name))}, -1)" title="Забрать балл">
            <svg viewBox="0 0 24 24"><path d="M18 12H6" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
          </button>
        </div>`;
    } else {
      statusClass = "skipped";
      displayAnswer = "⏩ пропущено";
      btnHTML = `
        <div class="card-controls">
          <button class="btn-mini btn-plus" onclick="changeScore(${escapeHtml(JSON.stringify(player.name))}, 1)" title="Засчитать балл">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
          </button>
        </div>`;
    }
  } else if (isAnswered) {
    displayAnswer = escapeHtml(answerText);
    const isCorrect =
      answerText.toLowerCase().trim() ===
      question.correct.toLowerCase().trim();
    const currentStatus =
      questionScore !== undefined ? questionScore : isCorrect ? 1 : 0;

    if (currentStatus === 1) {
      statusClass = "correct";
      const label = isCorrect ? "Верно" : "Засчитано";
      btnHTML = `
        <div class="card-controls">
          <span class="status-label">${label}</span>
          <button class="btn-mini btn-minus" onclick="changeScore(${escapeHtml(JSON.stringify(player.name))}, -1)" title="Забрать балл">
            <svg viewBox="0 0 24 24"><path d="M18 12H6" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
          </button>
        </div>`;
    } else {
      statusClass = "wrong";
      const label = isCorrect ? "Отклонено" : "Не верно";
      btnHTML = `
        <div class="card-controls">
          <span class="status-label">${label}</span>
          <button class="btn-mini btn-plus" onclick="changeScore(${escapeHtml(JSON.stringify(player.name))}, 1)" title="Засчитать балл">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>
          </button>
        </div>`;
    }
  }

  return `
    <div class="answer-card ${statusClass}">
      <div class="card-header">
        <div class="player-info">
          <span class="p-emoji ${showDisconnectedMark ? 'emoji-disconnected' : ''}">${player.emoji || "👤"}</span> 
          <span class="p-name">${escapeHtml(player.name)}</span>
          ${showDisconnectedMark ? '<span class="disconnected-badge">оффлайн</span>' : ''}
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
}

/**
 * Регистрирует обработчик события "answers_check_result"
 * 
 * Результат проверки, ответили ли все игроки на текущий вопрос.
 * Если не все ответили, предлагает хосту подтверждение на переход дальше.
 * 
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerAnswerCheckHandler(socket) {
  /**
   * Событие результата проверки ответов
   * @event answers_check_result
   * @param {Object} data - Результаты проверки
   * @param {boolean} data.allAnswered - Все ли игроки ответили
   */
  socket.on("answers_check_result", (data) => {
    _nextLocked = false;
    if (!data.allAnswered) {
      showModernConfirm("Не все ответили! Всё равно идём дальше?", () => {
        proceedToNext();
      });
    } else {
      proceedToNext();
    }
  });
}

/**
 * Инициализирует все обработчики ответов
 * @param {Object} socket - Socket.io сокет
 */
function initAnswerHandlers(socket) {
  registerAnswerUpdateHandler(socket);
  registerAnswerCheckHandler(socket);

  // Инициализация списка отключённых при загрузке хоста
  socket.on("init_disconnected", (data) => {
    if (role !== "host") return;
    (data.players || []).forEach((name) => disconnectedPlayers.add(name));
  });

  // Обработчик отключения игрока во время игры
  socket.on("player_disconnected", (data) => {
    if (role !== "host") return;
    disconnectedPlayers.add(data.name);
    showToast(`${escapeHtml(data.emoji)} <b>${escapeHtml(data.name)}</b> отключился`);
    socket.emit("get_update", roomCode);
  });

  // Обработчик переподключения игрока
  socket.on("player_reconnected", (data) => {
    if (role !== "host") return;
    disconnectedPlayers.delete(data.name);
    showToast(`${escapeHtml(data.emoji)} <b>${escapeHtml(data.name)}</b> вернулся ✅`);
    socket.emit("get_update", roomCode);
  });
}
