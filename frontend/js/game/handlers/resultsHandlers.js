/**
 * @file resultsHandlers.js
 * @description Обработчик события показа финальных результатов игры
 * @module handlers/resultsHandlers
 * 
 * Этот модуль отвечает за:
 * - Отображение экрана финальных результатов
 * - Показ победителей с анимацией конфетти
 * - Рейтинг всех игроков
 * - Разбор вопросов с ответами всех участников
 * - Управление аккордеоном с развернутым/свернутым разбором
 */

/**
 * Регистрирует обработчик события "show_results"
 * 
 * Показывает финальные результаты после завершения игры.
 * Рисует экран с победителями, рейтингом, конфетти и разбором вопросов.
 * 
 * @param {Object} socket - Socket.io сокет
 * @returns {void}
 */
function registerResultsHandler(socket) {
  /**
   * Событие показа финальных результатов
   * @event show_results
   * @param {Object} data - Данные результатов
   * @param {Array<Object>} data.results - Массив результатов игроков с баллами
   * @param {string} data.results[].name - Имя игрока
   * @param {number} data.results[].score - Финальный балл
   * @param {string} data.results[].emoji - Эмодзи игрока
   * @param {Array<string>} data.results[].answers - Ответы игрока на каждый вопрос
   * @param {Array<Object>} data.questions - Массив всех вопросов с правильными ответами
   */
  socket.on("show_results", (data) => {
    // Переключение экранов
    document.getElementById("host-screen").style.display = "none";
    document.getElementById("player-screen").style.display = "none";
    document.getElementById("finish-screen").style.display = "block";

    // Запуск анимации конфетти
    _playConfettiAnimation();

    // Рендер результатов
    _renderResultsContent(data);
  });
}

/**
 * Проигрывает анимацию конфетти с разных сторон
 * @private
 */
function _playConfettiAnimation() {
  const duration = 3 * 1000; // 3 секунды
  const end = Date.now() + duration;

  (function frame() {
    // Левая сторона
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.8 },
      colors: ['#FFD700', '#f175ff', '#43fff2']
    });
    
    // Правая сторона
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
}

/**
 * Рендерит содержимое экрана результатов
 * @private
 * @param {Object} data - Данные результатов
 */
function _renderResultsContent(data) {
  const resultsList = document.getElementById("final-results-list");
  if (!resultsList) return;

  if (data.questions) window.allQuizQuestions = data.questions;

  const players = data.results || [];
  const questions = window.allQuizQuestions || [];
  const myData = players.find((p) => p.name === playerName);

  // Разделение на победителей и остальных
  const maxScoreLocal = players.length > 0 ? players[0].score : 0;
  const winners = players.filter(
    (p) => p.score === maxScoreLocal && maxScoreLocal > 0
  );
  const others = players.filter(
    (p) => p.score !== maxScoreLocal || maxScoreLocal === 0
  );

  const html = _buildResultsHTML(winners, others, myData, questions, players);
  resultsList.innerHTML = html;
}

/**
 * Строит HTML для отображения результатов
 * @private
 * @param {Array<Object>} winners - Массив победителей
 * @param {Array<Object>} others - Массив остальных игроков
 * @param {Object} myData - Данные текущего пользователя
 * @param {Array<Object>} questions - Все вопросы
 * @param {Array<Object>} allPlayers - Все игроки
 * @returns {string} HTML результатов
 */
function _buildResultsHTML(winners, others, myData, questions, allPlayers) {
  return `
    <div class="confetti-wrapper">
      <div style="margin-bottom: 20px; text-align: center;">
        <span class="crown-appear">👑</span>
        <h2 style="color: var(--party-purple); font-size: 1.8rem; margin: 5px 0; font-weight: 800;">
          Итоги викторины
        </h2>
      </div>

      ${_buildWinnersSection(winners)}
    </div>
    
    ${others.length > 0 ? _buildRatingSection(others) : ""}

    ${_buildReviewSection(questions, myData, allPlayers)}
  `;
}

/**
 * Строит HTML секции победителей
 * @private
 * @param {Array<Object>} winners - Массив победителей
 * @returns {string} HTML секции
 */
function _buildWinnersSection(winners) {
  return winners
    .map(
      (w) => `
        <div class="player-row-lobby winner-card-epic" onclick="spawnConfetti(event)">
          <div class="winner-medal-container">🥇</div>
          <div class="winner-emoji-container">${w.emoji}</div>

          <div style="text-align: left; flex: 1;">
            <div class="winner-label">Победитель</div>
            <div class="shiny-text-name">${w.name}</div>
          </div>
          
          <div class="winner-score-badge">
            ${w.score}
          </div>
        </div>
      `
    )
    .join("");
}

/**
 * Строит HTML секции рейтинга остальных игроков
 * @private
 * @param {Array<Object>} others - Массив остальных игроков
 * @returns {string} HTML секции
 */
function _buildRatingSection(others) {
  return `
    <div style="margin-top: 25px;">
      <h4 class="rating-label">Рейтинг игроков</h4>
      <div>
        ${others
          .map((p, i) => {
            const rank = i + 2;
            const rankDisplay = _getRankDisplay(rank);

            return `
              <div class="player-row-lobby is-rating-row">
                <span class="rank-number">${rankDisplay}</span>
                <div class="participant-emoji-container">${p.emoji}</div>
                <span class="player-name-lobby">${p.name}</span>
                <span class="player-score-lobby">${p.score}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

/**
 * Получает отображение ранга (медаль или номер)
 * @private
 * @param {number} rank - Номер ранга
 * @returns {string} Отображение ранга
 */
function _getRankDisplay(rank) {
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "#" + rank;
}

/**
 * Строит HTML секции разбора вопросов в аккордеоне
 * @private
 * @param {Array<Object>} questions - Все вопросы
 * @param {Object} myData - Данные текущего пользователя
 * @param {Array<Object>} allPlayers - Все игроки
 * @returns {string} HTML секции
 */
function _buildReviewSection(questions, myData, allPlayers) {
  return `
    <div style="margin-top: 30px; padding-bottom: 20px;">
      <div class="review-acc-header" onclick="toggleReview(this)">
        <span class="review-acc-title">Разбор вопросов</span>
        <span id="acc-arrow" class="review-acc-arrow">▼</span>
      </div>

      <div id="review-content" class="accordion-content">
        <div style="padding-top: 15px;">
          ${questions
            .map((q, i) => _buildReviewCard(q, i, myData, allPlayers))
            .join("")}
        </div>
      </div>
    </div>
  `;
}

/**
 * Строит HTML одной карточки разбора вопроса
 * @private
 * @param {Object} question - Вопрос
 * @param {number} index - Индекс вопроса
 * @param {Object} myData - Данные текущего пользователя
 * @param {Array<Object>} allPlayers - Все игроки
 * @returns {string} HTML карточки
 */
function _buildReviewCard(question, index, myData, allPlayers) {
  const myAnswer = (myData && myData.answers && myData.answers[index]) || "—";
  const isCorrect =
    myAnswer.toLowerCase().trim() === question.correct.toLowerCase().trim();

  const othersList = _buildOthersAnswersList(question, index, allPlayers);

  return `
    <div class="review-card" style="animation-delay: ${index * 0.05}s;">
      <div class="review-q-number">Вопрос ${index + 1}</div>
      <div class="review-q-text">${question.text}</div>
      
      <div class="review-answers-grid">
        <div class="answer-box is-correct">
          <div class="answer-label">Верно</div>
          <div class="answer-value">${question.correct}</div>
        </div>

        <div class="answer-box is-user ${isCorrect ? "is-correct-status" : "is-wrong-status"}">
          <div class="answer-label">Твой ответ</div>
          <div class="answer-value">${myAnswer || "—"}</div>
        </div>
      </div>

      <div style="margin-top: 10px;">
        <div class="others-label">Другие игроки:</div>
        <div class="others-scroll-area">
          ${othersList}
        </div>
      </div>
    </div>
  `;
}

/**
 * Строит список ответов других игроков для разбора
 * @private
 * @param {Object} question - Вопрос
 * @param {number} index - Индекс вопроса
 * @param {Array<Object>} allPlayers - Все игроки
 * @returns {string} HTML списка
 */
function _buildOthersAnswersList(question, index, allPlayers) {
  const list = allPlayers
    .filter((p) => p.name !== playerName)
    .map((p) => {
      const ans = (p.answers && p.answers[index.toString()]) || "—";
      const isAnsCorr =
        ans.toLowerCase().trim() === question.correct.toLowerCase().trim();

      return `
        <div class="other-player-card">
          <span class="other-player-name">${p.emoji} ${p.name}</span>
          <span class="other-player-ans ${isAnsCorr ? "is-correct" : ""}">
            ${ans}
          </span>
        </div>
      `;
    })
    .join("");

  return list || '<span style="opacity: 0.5; font-size: 0.75rem;">—</span>';
}

/**
 * Инициализирует все обработчики результатов
 * @param {Object} socket - Socket.io сокет
 */
function initResultsHandlers(socket) {
  registerResultsHandler(socket);
}
