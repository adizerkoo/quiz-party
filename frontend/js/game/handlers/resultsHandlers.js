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

    // Определяем победителей для эпической анимации
    const players = data.results || [];
    const winners = _getWinners(players);

    if (winners.length > 0) {
      _playEpicWinnerIntro(winners, () => {
        _renderResultsContent(data);
        document.getElementById("finish-screen").style.display = "block";
        _playConfettiAnimation();
      });
    } else {
      _renderResultsContent(data);
      document.getElementById("finish-screen").style.display = "block";
      _playConfettiAnimation();
    }

    // Игра завершена — закрываем соединение, предотвращаем авто-реконнект
    socket.disconnect();
  });
}

/**
 * Проигрывает эпическую анимацию появления победителя (или нескольких)
 * @private
 * @param {Array<Object>} winners - Массив победителей {name, emoji, score}
 * @param {Function} onComplete - Колбэк после завершения анимации
 */
function _playEpicWinnerIntro(winners, onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'epic-intro-overlay';
  overlay.innerHTML = _buildEpicIntroHTML(winners);
  document.body.appendChild(overlay);

  const isMobile = window.innerWidth <= 520;

  // Добавляем звёзды на фон
  _spawnEpicStars(overlay, isMobile ? 20 : 40);

  // Метеориты (через 0.5s)
  setTimeout(() => _spawnMeteors(overlay, isMobile ? 3 : 6), 500);

  // Искры при ударе эмодзи (через 1.1s)
  setTimeout(() => _spawnEpicSparks(overlay, isMobile), 1100);

  // Вторая волна искр (через 1.6s)
  setTimeout(() => _spawnEpicSparks(overlay, isMobile), 1600);

  // Фейерверки (через 2s)
  setTimeout(() => {
    _spawnFirework(overlay, 20, 25, isMobile);
    _spawnFirework(overlay, 75, 20, isMobile);
  }, 2000);

  // Ещё фейерверки (через 2.8s) — на мобиле только 1
  setTimeout(() => {
    if (isMobile) {
      _spawnFirework(overlay, 50, 15, true);
    } else {
      _spawnFirework(overlay, 15, 60, false);
      _spawnFirework(overlay, 85, 55, false);
      _spawnFirework(overlay, 50, 15, false);
    }
  }, 2800);

  // Финальный залп фейерверков (через 3.4s)
  setTimeout(() => {
    _spawnFirework(overlay, 30, 30, isMobile);
    if (!isMobile) {
      _spawnFirework(overlay, 70, 40, false);
    }
  }, 3400);

  // Конфетти во время интро (лёгкое на мобиле)
  setTimeout(() => _playEpicConfetti(isMobile), 1200);

  // Большой golden burst при появлении имени
  setTimeout(() => {
    confetti({
      particleCount: isMobile ? 40 : 80,
      spread: 100,
      origin: { x: 0.5, y: 0.45 },
      colors: ['#FFD700', '#FFA500', '#FFE066', '#fff'],
      zIndex: 10000,
      startVelocity: isMobile ? 25 : 40,
      gravity: 0.8
    });
  }, 1800);

  // Завершение — фейд-аут и переход к результатам
  setTimeout(() => {
    overlay.classList.add('epic-fade-out');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      onComplete();
    }, { once: true });
  }, 4500);
}

/**
 * Склонение слова "очко" по правилам русского языка
 * @private
 * @param {number} n - Число
 * @returns {string} "очко", "очка" или "очков"
 */
function _pluralOchko(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'очков';
  if (last === 1) return 'очко';
  if (last >= 2 && last <= 4) return 'очка';
  return 'очков';
}

/**
 * Строит HTML эпического интро
 * @private
 */
function _getWinners(players) {
  if (!players.length) {
    return [];
  }

  const hasPersistedRanks = players.some((player) => typeof player.final_rank === 'number');
  if (hasPersistedRanks) {
    return players.filter((player) => player.final_rank === 1);
  }

  const maxScore = players.length > 0 ? players[0].score : 0;
  return players.filter((player) => player.score === maxScore && maxScore > 0);
}

function _getOthers(players) {
  const winnerNames = new Set(_getWinners(players).map((player) => player.name));
  return players.filter((player) => !winnerNames.has(player.name));
}

function _buildEpicIntroHTML(winners) {
  const multi = winners.length > 1;
  const emojisHTML = multi
    ? `<div class="epic-multi-emojis">${winners.map((w, i) =>
        `<span class="epic-multi-emoji" style="animation-delay: ${1.0 + i * 0.15}s">${w.emoji}</span>`
      ).join('')}</div>`
    : `<div class="epic-winner-emoji">${winners[0].emoji}</div>`;

  const namesHTML = multi
    ? `<div class="epic-winner-name-text epic-multi-name">${winners.map(w => escapeHtml(w.name)).join(' & ')}</div>`
    : `<div class="epic-winner-name-text">${escapeHtml(winners[0].name)}</div>`;

  const titleText = multi ? '🏆 ПОБЕДИТЕЛИ 🏆' : '🏆 ПОБЕДИТЕЛЬ 🏆';

  return `
    <div class="epic-flash"></div>
    <div class="epic-electric-border"></div>
    <div class="epic-nebula"></div>
    <div class="epic-energy-ring"></div>
    <svg style=\"position:absolute;width:0;height:0;\">
      <defs>
        <linearGradient id=\"boltGrad\" x1=\"0%\" y1=\"0%\" x2=\"0%\" y2=\"100%\">
          <stop offset=\"0%\" stop-color=\"#b8dcff\"/>
          <stop offset=\"40%\" stop-color=\"#a78bfa\"/>
          <stop offset=\"100%\" stop-color=\"#43fff2\"/>
        </linearGradient>
      </defs>
    </svg>
    <svg class="epic-bolt bolt-left" viewBox="0 0 120 300">
      <path d="M60,0 L45,80 L75,90 L30,180 L65,170 L20,300" stroke="url(#boltGrad)"/>
    </svg>
    <svg class="epic-bolt bolt-right" viewBox="0 0 120 300">
      <path d="M60,0 L45,80 L75,90 L30,180 L65,170 L20,300" stroke="url(#boltGrad)"/>
    </svg>
    <svg class="epic-bolt bolt-center-left" viewBox="0 0 80 200">
      <path d="M40,0 L30,60 L55,65 L20,130 L45,125 L10,200" stroke="url(#boltGrad)"/>
    </svg>
    <svg class="epic-bolt bolt-center-right" viewBox="0 0 80 200">
      <path d="M40,0 L30,60 L55,65 L20,130 L45,125 L10,200" stroke="url(#boltGrad)"/>
    </svg>

    <div class="epic-shockwave ring-1"></div>
    <div class="epic-shockwave ring-2"></div>
    <div class="epic-shockwave ring-3"></div>

    <div class="epic-particles-container"></div>

    ${emojisHTML}
    ${namesHTML}
    <div class="epic-winner-title-text">${titleText}</div>
    <div class="epic-winner-score-text">${winners[0].score} ${_pluralOchko(winners[0].score)}</div>
  `;
}

/**
 * Создает летящие метеоры
 * @private
 */
function _spawnMeteors(container, count) {
  for (let i = 0; i < count; i++) {
    const meteor = document.createElement('div');
    meteor.className = 'epic-meteor';
    meteor.style.left = (10 + Math.random() * 80) + '%';
    meteor.style.top = '-5%';
    meteor.style.animationDelay = (i * 0.3 + Math.random() * 0.4) + 's';
    meteor.style.animationDuration = (0.6 + Math.random() * 0.5) + 's';
    container.appendChild(meteor);
  }
}

/**
 * Создает звёзды на фоне
 * @private
 */
function _spawnEpicStars(container, count) {
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'epic-star';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.animationDelay = (Math.random() * 2) + 's';
    star.style.width = (1 + Math.random() * 3) + 'px';
    star.style.height = star.style.width;
    container.appendChild(star);
  }
}

/**
 * Создает искры при ударе эмодзи
 * @private
 */
function _spawnEpicSparks(container, isMobile) {
  const particlesDiv = container.querySelector('.epic-particles-container');
  if (!particlesDiv) return;

  const colors = ['#FFD700', '#FFA500', '#ff85a1', '#43fff2', '#6c5ce7', '#fff'];
  const count = isMobile ? 18 : 35;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'epic-spark';
    const angle = (i / count) * 360;
    const distance = 80 + Math.random() * 160;
    const rad = angle * Math.PI / 180;
    const sx = Math.cos(rad) * distance;
    const sy = Math.sin(rad) * distance;

    spark.style.setProperty('--sx', sx + 'px');
    spark.style.setProperty('--sy', sy + 'px');
    spark.style.background = colors[Math.floor(Math.random() * colors.length)];
    spark.style.width = (3 + Math.random() * 5) + 'px';
    spark.style.height = spark.style.width;
    spark.style.boxShadow = `0 0 6px ${spark.style.background}`;
    spark.style.animation = `epicSparkBurst ${0.6 + Math.random() * 0.5}s ease-out forwards`;
    spark.style.animationDelay = (Math.random() * 0.15) + 's';
    particlesDiv.appendChild(spark);
  }
}

/**
 * Создает один фейерверк
 * @private
 */
function _spawnFirework(container, xPercent, yPercent, isMobile) {
  const colors = ['#FFD700', '#ff85a1', '#43fff2', '#6c5ce7', '#2ecc71', '#fff', '#FFA500'];
  const particleCount = isMobile ? 10 : 20;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    p.className = 'epic-firework-particle';
    const angle = (i / particleCount) * 360;
    const distance = 40 + Math.random() * 80;
    const rad = angle * Math.PI / 180;

    p.style.left = xPercent + '%';
    p.style.top = yPercent + '%';
    p.style.setProperty('--fx', (Math.cos(rad) * distance) + 'px');
    p.style.setProperty('--fy', (Math.sin(rad) * distance) + 'px');
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.boxShadow = `0 0 4px ${p.style.background}`;
    p.style.animation = `fireworkShoot ${0.5 + Math.random() * 0.4}s ease-out forwards`;
    p.style.animationDelay = (Math.random() * 0.1) + 's';
    container.appendChild(p);
  }
}

/**
 * Запускает конфетти во время эпического интро
 * @private
 */
function _playEpicConfetti(isMobile) {
  const duration = isMobile ? 1500 : 2500;
  const end = Date.now() + duration;
  const count = isMobile ? 2 : 4;

  (function frame() {
    confetti({
      particleCount: count,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors: ['#FFD700', '#f175ff', '#43fff2', '#fff'],
      zIndex: 10000
    });
    confetti({
      particleCount: count,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors: ['#FFD700', '#f175ff', '#43fff2', '#fff'],
      zIndex: 10000
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
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
  const winners = _getWinners(players);
  const others = _getOthers(players);

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
        <div class="results-party-title">${escapeHtml(quizTitle) || 'Quiz Party'}</div>
        <h2 style="color: var(--party-purple); font-size: 1.4rem; margin: 5px 0; font-weight: 800;">
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
            <div class="shiny-text-name">${escapeHtml(w.name)}</div>
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
            const rank = typeof p.final_rank === 'number' ? p.final_rank : (i + 2);
            const rankDisplay = _getRankDisplay(rank);

            return `
              <div class="player-row-lobby is-rating-row">
                <span class="rank-number">${rankDisplay}</span>
                <div class="participant-emoji-container">${p.emoji}</div>
                <span class="player-name-lobby">${escapeHtml(p.name)}</span>
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
  const myAnswer = (myData && myData.answers && myData.answers[index + 1]) || "—";
  const isCorrect =
    myAnswer.toLowerCase().trim() === question.correct.toLowerCase().trim();

  const othersList = _buildOthersAnswersList(question, index, allPlayers);

  return `
    <div class="review-card" style="animation-delay: ${index * 0.05}s;">
      <div class="review-q-number">Вопрос ${index + 1}</div>
      <div class="review-q-text">${escapeHtml(question.text)}</div>
      
      <div class="review-answers-grid">
        <div class="answer-box is-correct">
          <div class="answer-label">Верно</div>
          <div class="answer-value">${escapeHtml(question.correct)}</div>
        </div>

        <div class="answer-box is-user ${isCorrect ? "is-correct-status" : "is-wrong-status"}">
          <div class="answer-label">Твой ответ</div>
          <div class="answer-value">${escapeHtml(myAnswer) || "—"}</div>
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
      const ans = (p.answers && p.answers[(index + 1).toString()]) || "—";
      const isAnsCorr =
        ans.toLowerCase().trim() === question.correct.toLowerCase().trim();

      return `
        <div class="other-player-card">
          <span class="other-player-name">${p.emoji} ${escapeHtml(p.name)}</span>
          <span class="other-player-ans ${isAnsCorr ? "is-correct" : ""}">
            ${escapeHtml(ans)}
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
