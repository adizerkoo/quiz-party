/**
 * @file gameStartIntro.js
 * @description Эпическая анимация старта игры — эмодзи игроков падают сверху по очереди
 * @module handlers/gameStartIntro
 * 
 * Работает один раз при получении события game_started.
 * При обновлении страницы (sync_state) анимация НЕ повторяется.
 */

/**
 * Проигрывает эпическую анимацию старта игры.
 * Эмодзи игроков падают сверху по очереди с эффектами.
 * 
 * @param {Array<Object>} players - Массив игроков (не хосты) [{name, emoji}, ...]
 * @param {Function} onComplete - Колбэк после завершения анимации
 */
function playGameStartIntro(players, onComplete) {
  const actualPlayers = players.filter(p => !p.is_host);

  // Если нет игроков — сразу к игре
  if (actualPlayers.length === 0) {
    onComplete();
    return;
  }

  const isMobile = window.innerWidth <= 520;
  const overlay = document.createElement('div');
  overlay.className = 'game-start-overlay';
  overlay.innerHTML = _buildGameStartHTML(actualPlayers);
  document.body.appendChild(overlay);

  // Фоновые звёзды
  _spawnGsStars(overlay, isMobile ? 15 : 30);

  // Метеоры фоном
  setTimeout(() => _spawnGsMeteors(overlay, isMobile ? 2 : 4), 400);

  // Запуск анимаций падения карточек
  const cards = overlay.querySelectorAll('.gs-player-card');
  const delayPerPlayer = Math.min(0.35, 2.0 / Math.max(actualPlayers.length, 1));
  const firstSlamAt = 0.8; // секунд после появления

  cards.forEach((card, i) => {
    const delay = firstSlamAt + i * delayPerPlayer;
    card.style.setProperty('--gs-slam-delay', delay + 's');
    card.classList.add('gs-slam');

    // Искры при приземлении каждого игрока
    const sparkTime = (delay + 0.35) * 1000; // slam landing ~55% through
    setTimeout(() => {
      _spawnGsImpactSparks(overlay, card, isMobile);
    }, sparkTime);
  });

  // Время появления текста «ПОЕХАЛИ!»
  const lastSlamEnd = firstSlamAt + (actualPlayers.length - 1) * delayPerPlayer + 0.65;
  const goDelay = lastSlamEnd + 0.3;
  const goText = overlay.querySelector('.gs-go-text');
  if (goText) {
    goText.style.setProperty('--gs-go-delay', goDelay + 's');
  }

  // Конфетти при «ПОЕХАЛИ!»
  setTimeout(() => {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: isMobile ? 50 : 100,
        spread: 80,
        origin: { x: 0.5, y: 0.55 },
        colors: ['#6c5ce7', '#ff85a1', '#FFD700', '#43fff2', '#fff'],
        zIndex: 10000,
        startVelocity: isMobile ? 20 : 35,
        gravity: 0.8
      });
    }
  }, goDelay * 1000);

  // Завершение — fade out и переход к реальной игре
  const totalDuration = (goDelay + 1.0) * 1000;
  setTimeout(() => {
    overlay.classList.add('gs-fade-out');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      onComplete();
    }, { once: true });
  }, totalDuration);
}

/**
 * Строит HTML для анимации старта
 * @private
 * @param {Array<Object>} players - Игроки (без хоста)
 * @returns {string} HTML-строка
 */
function _buildGameStartHTML(players) {
  const playersHTML = players.map(p =>
    `<div class="gs-player-card">
      <div class="gs-player-emoji">${p.emoji || '👤'}</div>
      <div class="gs-player-name">${escapeHtml(p.name)}</div>
    </div>`
  ).join('');

  return `
    <div class="gs-flash"></div>
    <div class="gs-electric-border"></div>
    <div class="gs-nebula"></div>
    <div class="gs-particles-container"></div>

    <div class="gs-title">🎮 Игра начинается! 🎮</div>
    <div class="gs-players-container">
      ${playersHTML}
    </div>
    <div class="gs-go-text">ПОЕХАЛИ! 🚀</div>
  `;
}

/**
 * Создаёт звёзды на фоне
 * @private
 */
function _spawnGsStars(container, count) {
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'gs-star';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.animationDelay = (Math.random() * 2) + 's';
    star.style.width = (1 + Math.random() * 2) + 'px';
    star.style.height = star.style.width;
    container.appendChild(star);
  }
}

/**
 * Создаёт метеоры
 * @private
 */
function _spawnGsMeteors(container, count) {
  for (let i = 0; i < count; i++) {
    const meteor = document.createElement('div');
    meteor.className = 'gs-meteor';
    meteor.style.left = (15 + Math.random() * 70) + '%';
    meteor.style.top = '-3%';
    meteor.style.animationDelay = (i * 0.4 + Math.random() * 0.3) + 's';
    meteor.style.animationDuration = (0.6 + Math.random() * 0.4) + 's';
    container.appendChild(meteor);
  }
}

/**
 * Создаёт искры при приземлении игрока
 * @private
 */
function _spawnGsImpactSparks(overlay, card, isMobile) {
  const particlesDiv = overlay.querySelector('.gs-particles-container');
  if (!particlesDiv) return;

  const rect = card.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height * 0.4;

  const colors = ['#6c5ce7', '#ff85a1', '#FFD700', '#43fff2', '#fff'];
  const count = isMobile ? 8 : 14;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'gs-spark';
    const angle = (i / count) * 360;
    const distance = 30 + Math.random() * 60;
    const rad = angle * Math.PI / 180;
    const sx = Math.cos(rad) * distance;
    const sy = Math.sin(rad) * distance;

    spark.style.left = centerX + 'px';
    spark.style.top = centerY + 'px';
    spark.style.setProperty('--sx', sx + 'px');
    spark.style.setProperty('--sy', sy + 'px');
    spark.style.background = colors[Math.floor(Math.random() * colors.length)];
    spark.style.width = (2 + Math.random() * 4) + 'px';
    spark.style.height = spark.style.width;
    spark.style.boxShadow = `0 0 5px ${spark.style.background}`;
    spark.style.animation = `gsSparkBurst ${0.4 + Math.random() * 0.3}s ease-out forwards`;
    particlesDiv.appendChild(spark);
  }

  // Ударная волна (кольцо)
  const ring = document.createElement('div');
  ring.className = 'gs-impact-ring';
  ring.style.left = (centerX - 4) + 'px';
  ring.style.top = (centerY - 4) + 'px';
  overlay.appendChild(ring);
}
