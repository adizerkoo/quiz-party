/**
 * @file gameControlHandlers.js
 * @description Обработчики событий управления игровым процессом (старт игры, навигация по вопросам)
 * @module handlers/gameControlHandlers
 * 
 * Этот модуль отвечает за:
 * - Инициализацию игры (запуск, сброс каунтеров)
 * - Переключение экранов хоста и игроков
 * - Переход к следующему вопросу/шагу
 * - Управление прогрессом игры
 */

/**
 * Регистрирует обработчик события "game_started"
 * 
 * Запускает игру: сбрасывает шаги текущего раунда,
 * для хоста показывает игровую зону и карточки игроков,
 * для игроков переключает с экрана ожидания на экран вопроса.
 * 
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerGameStartHandler(socket) {
  /**
   * Событие старта игры
   * @event game_started
   * @param {Array<Object>} players - Массив текущих игроков
   */
  socket.on("game_started", (players) => {
    // Сброс каунтеров для нового раунда
    currentQuestion = 1;
    maxReachedQuestion = 1;
    realGameQuestion = 1;
    playerViewQuestion = 1;
    myAnswersHistory = {};
    
    const me = players.find((p) => p.name === playerName);
    if (me) myEmoji = me.emoji;

    if (role === "host") {
      _handleHostGameStart(players);
    } else {
      _handlePlayerGameStart();
    }

    socket.emit("get_update", roomCode);
    renderProgress();
  });
}

/**
 * Обработчик старта игры для хоста
 * @private
 * @param {Array<Object>} players - Список игроков
 */
function _handleHostGameStart(players) {
  document.getElementById("host-lobby").style.display = "none";
  document.getElementById("host-game-area").style.display = "block";

  renderProgress();
  updateHostUI();

  // Рендер карточек игроков с ответами
  const grid = document.getElementById("players-answers-grid");
  grid.innerHTML = players
    .filter((p) => !p.is_host)
    .map(
      (p) => `
        <div class="answer-card waiting">
          <div class="answer-info">
            <div class="answer-name" style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 2rem;">${p.emoji || "👤"}</span> 
              <span style="font-size: 1.2rem; font-weight: bold;">${escapeHtml(p.name)}</span>
            </div>
            <div class="answer-text">⏳ ожидает ответа</div>
          </div>
          <div class="answer-buttons"></div>
        </div>
      `
    )
    .join("");

  renderScoreboard(players);
}

/**
 * Обработчик старта игры для игрока
 * @private
 */
function _handlePlayerGameStart() {
  document.getElementById("player-wait").style.display = "none";
  document.getElementById("player-game-area").style.display = "block";
  renderPlayerQuestion();
}

/**
 * Регистрирует обработчик события "move_to_next"
 * 
 * Переход к следующему шагу/вопросу. Событие приходит после решения сервера
 * перейти вперёд или при ручной навигации хоста.
 * 
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerMoveToNextHandler(socket) {
  /**
   * Событие перехода на следующий вопрос
   * @event move_to_next
   * @param {Object} data - Данные о переходе
   * @param {number} data.question - Новый номер шага
   */
  socket.on("move_to_next", (data) => {
    _nextLocked = false;
    currentQuestion = data.question;
    realGameQuestion = data.question;
    playerViewQuestion = data.question;

    // Отслеживаем максимально достигнутый шаг
    if (currentQuestion > maxReachedQuestion) {
      maxReachedQuestion = currentQuestion;
    }

    refreshUI();
  });
}

/**
 * Инициализирует все обработчики управления игрой
 * @param {Object} socket - Socket.io сокет
 */
function initGameControlHandlers(socket) {
  registerGameStartHandler(socket);
  registerMoveToNextHandler(socket);
}
