/**
 * @file syncHandlers.js
 * @description Обработчик события синхронизации состояния игры
 * @module handlers/syncHandlers
 * 
 * Этот модуль отвечает за:
 * - Восстановление состояния при подключении нового клиента
 * - Синхронизацию при обновлении страницы (refresh)
 * - Восстановление правильного экрана (ожидание/игра/финиш)
 * - Восстановление прогресса и ответов игрока
 */

/**
 * Регистрирует обработчик события "sync_state"
 * 
 * Синхронизирует состояние для только что подключившегося клиента
 * или при обновлении страницы (refresh).
 * Подтягивает:
 * - текущий шаг и прогресс
 * - эмодзи пользователя
 * - нужный экран (ожидание / игра / финиш)
 * - восстанавливает ответ игрока, если он уже был отправлен
 * 
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerSyncStateHandler(socket) {
  /**
   * Событие синхронизации состояния
   * @event sync_state
   * @param {Object} data - Данные состояния для синхронизации
   * @param {number} data.currentQuestion - Текущий номер вопроса/шага
   * @param {number} data.maxReachedQuestion - Максимально достигнутый шаг
   * @param {string} data.emoji - Эмодзи пользователя
   * @param {boolean} data.isFinished - Завершена ли игра
   * @param {boolean} data.isStarted - Началась ли игра
   * @param {string} data.playerAnswer - Ответ текущего игрока (если уже отправлен)
   */
  socket.on("sync_state", (data) => {
    _applyStateSync(data);
  });
}

/**
 * Регистрирует постоянное состояние подключения хоста для player UI.
 *
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerHostConnectionStateHandler(socket) {
  socket.on("host_connection_state", (data) => {
    if (role === "host") {
      return;
    }

    setHostOfflineBannerVisible(Boolean(data?.hostOffline));
  });
}

/**
 * Применяет синхронизированное состояние
 * @private
 * @param {Object} data - Данные состояния
 */
function _applyStateSync(data) {
  const status = data.status || "waiting";
  // Обновление базовых счетчиков
  currentQuestion = data.currentQuestion;
  realGameQuestion = data.currentQuestion;
  playerViewQuestion = data.currentQuestion;

  if (data.maxReachedQuestion !== undefined) {
    maxReachedQuestion = data.maxReachedQuestion;
  }

  if (data.emoji) {
    myEmoji = data.emoji;
    sessionStorage.setItem("quiz_player_emoji", myEmoji);
  }

  if (data.answersHistory) {
    myAnswersHistory = data.answersHistory;
  }

  if (role !== "host") {
    setHostOfflineBannerVisible(Boolean(data.hostOffline));
  }

  // Если игра уже завершена, показываем финальный экран
  if (data.status === "finished") {
    _showFinishScreen();
    return;
  }

  // Обновок UI для игроков
  if (role !== "host") {
    _syncPlayerUI(data);
  }

  // Переключение экранов для хоста
  if (role === "host") {
    _syncHostUI(data);
  }
}

/**
 * Показывает экран финальных результатов
 * @private
 */
function _showFinishScreen() {
  document.getElementById("host-screen").style.display = "none";
  document.getElementById("player-screen").style.display = "none";
  document.getElementById("finish-screen").style.display = "block";
}

/**
 * Синхронизирует UI для игрока
 * @private
 * @param {Object} data - Данные состояния
 */
function _syncPlayerUI(data) {
  // Обновление информации в экране ожидания
  const waitEmoji = document.getElementById("player-wait-emoji");
  const waitName = document.getElementById("player-wait-name");
  
  if (waitEmoji) {
    waitEmoji.innerText = data.emoji || myEmoji;
  }
  if (waitName) {
    waitName.innerText = playerName;
  }

  // Если игра уже началась, переключаемся на игровой экран
  if (data.status === "playing") {
    document.getElementById("player-wait").style.display = "none";
    document.getElementById("player-game-area").style.display = "block";

    renderPlayerQuestion();

    if (data.playerAnswer) {
      _renderPlayerAnswerPreview(data.playerAnswer);
    }
  }
}

/**
 * Рендерит превью ответа игрока после того, как он уже отправился
 * @private
 * @param {string} playerAnswer - Ответ игрока
 */
function _renderPlayerAnswerPreview(playerAnswer) {
  const answerArea = document.getElementById("player-answer-area");
  if (answerArea) {
    answerArea.innerHTML = `
      <div class="sent-confirmation reveal-anim">
        <div class="status-badge-sent">Отправлено 🚀</div>
        
        <div class="your-answer-preview">
          <div class="your-answer-label">Твой ответ:</div>
          <div class="your-answer-text">${escapeHtml(playerAnswer)}</div>
        </div>

        <div class="waiting-loader">
          <div class="pulse-dot"></div>
          <span>Ждем остальных игроков...</span>
        </div>
      </div>
    `;
  }
}

/**
 * Синхронизирует UI для хоста
 * @private
 * @param {Object} data - Данные состояния
 */
function _syncHostUI(data) {
  // Если игра еще не началась (шаг < 0), показываем лобби
  if (data.status === "waiting") {
    document.getElementById("host-lobby").style.display = "block";
    document.getElementById("host-game-area").style.display = "none";
  } else {
    document.getElementById("host-lobby").style.display = "none";
    document.getElementById("host-game-area").style.display = "block";

    updateHostUI();
    renderProgress();
  }
}

/**
 * Инициализирует все обработчики синхронизации
 * @param {Object} socket - Socket.io сокет
 */
function initSyncHandlers(socket) {
  registerSyncStateHandler(socket);
  registerHostConnectionStateHandler(socket);
}
