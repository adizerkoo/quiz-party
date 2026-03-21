/**
 * Общий модуль логики игры Quiz Party.
 * Отвечает за состояние игры, инициализацию страницы,
 * базовые действия хоста и игроков (без обработки событий socket.io).
 */
const socket = io();

/**
 * Заголовок викторины, подтягивается с бэка.
 * @type {string}
 */
let quizTitle = "";

/**
 * Эмодзи текущего игрока.
 * @type {string}
 */
let myEmoji = "👤";

/**
 * Текущий отображаемый шаг (вопрос) на клиенте.
 * Может отличаться от realGameStep, если хост вручную перелистывает историю.
 * @type {number}
 */
let currentStep = 0;

/**
 * Реальный шаг игры, который считается "текущим" на сервере.
 * @type {number}
 */
let realGameStep = 0;

/**
 * Максимальный достигнутый шаг (для прогресс-бара).
 * @type {number}
 */
let maxReachedStep = 0;

/**
 * Шаг, который игрок сейчас просматривает (может листать историю).
 * @type {number}
 */
let playerViewStep = 0;

/**
 * Локальный кэш ответов игрока: { "0": "ответ", "1": "ответ" }.
 * @type {Object<string, string>}
 */
let myAnswersHistory = {};

/**
 * Массив вопросов текущей викторины.
 * @type {{text: string, correct: string, type: 'options' | 'text', options?: string[]}[]}
 */
let currentQuestions = [];

/**
 * Параметры URL для получения кода комнаты и роли.
 */
const urlParams = new URLSearchParams(window.location.search);

/**
 * Код комнаты квиза.
 * @type {string | null}
 */
const roomCode = urlParams.get("room");

/**
 * Роль текущего клиента: "host" или "player".
 * @type {string | null}
 */
const role = urlParams.get("role");

/**
 * Имя игрока, для хоста фиксированное "HOST".
 * @type {string}
 */
let playerName =
  role === "host"
    ? "HOST"
    : sessionStorage.getItem("quiz_player_name") || "Игрок";

/**
 * Определяет тип устройства, браузер и его версию из userAgent.
 */
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let device = "desktop";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) device = "mobile";
  else if (/iPad|Tablet/i.test(ua)) device = "tablet";

  const browsers = [
    { name: "Yandex",  re: /YaBrowser\/(\d+)/ },
    { name: "Edge",    re: /Edg\/(\d+)/ },
    { name: "Opera",   re: /OPR\/(\d+)/ },
    { name: "Chrome",  re: /Chrome\/(\d+)/ },
    { name: "Firefox", re: /Firefox\/(\d+)/ },
    { name: "Safari",  re: /Version\/(\d+).*Safari/ },
  ];
  let browser = "unknown", browser_version = "unknown";
  for (const b of browsers) {
    const m = ua.match(b.re);
    if (m) { browser = b.name; browser_version = m[1]; break; }
  }

  // Модель устройства: Android даёт её в UA, Apple — нет
  let device_model = "unknown";
  const android = ua.match(/Android[^;]*;\s*([^)]+)\)/);
  if (android) device_model = android[1].trim();
  else if (/iPhone/i.test(ua)) device_model = "Apple iPhone";
  else if (/iPad/i.test(ua))   device_model = "Apple iPad";

  return { device, browser, browser_version, device_model };
}

/**
 * Стартовая инициализация страницы игры.
 * 1) Подставляет код комнаты в интерфейс.
 * 2) Запрашивает викторину с бэка.
 * 3) Подключает к socket.io комнате и запрашивает состояние.
 * 4) Показывает экран хоста или игрока.
 */
async function init() {
  const displayCodeEl = document.getElementById("display-room-code");
  if (displayCodeEl) {
    displayCodeEl.innerText = roomCode;
  }

  try {
    const response = await fetch(`/api/quizzes/${roomCode}`);

    if (response.ok) {
      const data = await response.json();
      quizTitle = data.title;
      currentQuestions = data.questions_data;

      renderQuizTitle();
      renderProgress();

      // Инициализируем все socket обработчики
      initializeSocketHandlers(socket);

      socket.on("name_assigned", (data) => {
        playerName = data.name;
        sessionStorage.setItem("quiz_player_name", playerName);
        console.log("📝 Имя изменено на:", playerName);
      });

      socket.emit("join_room", {
        room: roomCode,
        name: playerName,
        role: role,
        ...getDeviceInfo(),
      });
      socket.emit("request_sync", { room: roomCode, name: playerName });

      const screenId = role === "host" ? "host-screen" : "player-screen";
      const screenEl = document.getElementById(screenId);
      if (screenEl) screenEl.style.display = "block";
    } else {
      window.location.href = "index.html?error=not_found";
    }
  } catch (e) {
    console.error("Ошибка инициализации:", e);
    window.location.href = "index.html";
  }
}

/**
 * Старт игры — только для хоста.
 * Сбрасывает текущий шаг и отправляет сигнал на сервер.
 */
function startGame() {
  currentStep = 0;
  socket.emit("start_game_signal", { room: roomCode });
}

/**
 * Заполняет заголовки викторины на экранах хоста и игроков.
 */
function renderQuizTitle() {
  const hostTitle = document.getElementById("quiz-title-host");
  const playerTitle = document.getElementById("quiz-title-player");

  if (hostTitle) hostTitle.innerText = quizTitle;
  if (playerTitle) playerTitle.innerText = quizTitle;
}

/**
 * DOM-элементы для отображения и копирования кода комнаты.
 */
const displayRoomCode = document.getElementById("display-room-code");
const copyRoomBtn = document.getElementById("copy-room-btn");
const copyMsg = document.getElementById("copy-msg");

/**
 * Копирует код комнаты и запускает анимацию смены текста
 */
function copyRoomCode() {
  const code = displayRoomCode.textContent;
  const container = document.querySelector('.code-inner-container');

  navigator.clipboard.writeText(code).then(() => {
    // Добавляем класс, который прячет код и поднимает "Скопировано!"
    container.classList.add("is-copied");

    // Через 1.5 секунды возвращаем всё как было
    setTimeout(() => {
      container.classList.remove("is-copied");
    }, 1500);
  });
}

// Привязка обработчиков
if (copyRoomBtn) copyRoomBtn.addEventListener("click", copyRoomCode);
if (displayRoomCode) displayRoomCode.addEventListener("click", copyRoomCode);

/**
 * Флаг блокировки повторного вызова nextQuestion / proceedToNext
 * пока идёт проверка или показан диалог подтверждения.
 */
let _nextLocked = false;

/**
 * Обработчик клика по кнопке "Следующий вопрос" на стороне хоста.
 * Если хост ушёл в историю — возвращает на текущий шаг, иначе просит сервер
 * проверить, все ли ответили.
 */
function nextQuestion() {
  if (currentStep !== realGameStep) {
    currentStep = realGameStep;
    refreshUI();
    return;
  }

  if (_nextLocked) return;
  _nextLocked = true;

  socket.emit("check_answers_before_next", {
    room: roomCode,
    step: currentStep,
  });
}

/**
 * Показывает модальное подтверждение с кастомным текстом
 * и колбэком, который вызывается при подтверждении.
 * @param {string} msg - текст вопроса/предупреждения
 * @param {() => void} onConfirm - действие при подтверждении
 */
function showModernConfirm(msg, onConfirm) {
  const overlay = document.getElementById("confirm-overlay");
  overlay.style.display = "flex";
  document.getElementById("confirm-proceed-btn").onclick = () => {
    overlay.style.display = "none";
    onConfirm();
  };
}

/**
 * Переключение шага игры вперёд:
 * - если есть ещё вопросы — сигнал next_question_signal
 * - если это последний вопрос — сигнал finish_game_signal
 */
function proceedToNext() {
  if (currentStep < currentQuestions.length - 1) {
    socket.emit("next_question_signal", {
      room: roomCode,
      expectedStep: currentStep,
    });
  } else {
    socket.emit("finish_game_signal", { room: roomCode });
  }
}

/**
 * Корректировка баллов конкретному игроку за текущий вопрос.
 * Используется хостом из интерфейса разбора ответов.
 * @param {string} targetName - имя игрока
 * @param {1|-1} points - +1 выдать балл, -1 забрать балл
 */
function changeScore(targetName, points) {
  socket.emit("override_score", {
    room: roomCode,
    playerName: targetName,
    points: points,
    questionIndex: currentStep,
  });
}

/**
 * Рисует прогресс-бар вопросов в верхней части экрана хоста.
 * Учитывает текущий шаг, максимальный достигнутый шаг и позволяет
 * хосту переходить по истории кликом.
 */
function renderProgress() {
  const container = document.getElementById("questions-progress");
  if (!container) return;

  container.innerHTML = currentQuestions
    .map((_, i) => {
      let stateClass = "future";
      if (i < maxReachedStep) stateClass = "done";
      if (i === currentStep) stateClass = "active";

      const showDot = i === maxReachedStep;

      return `
        <div class="q-step-wrapper" style="display: inline-flex; flex-direction: column; align-items: center; margin: 0 4px; cursor: pointer;">
            <div class="q-step ${stateClass}" onclick="jumpToQuestion(${i})">
                ${i + 1}
            </div>
            ${showDot ? '<div class="pulse-dot"></div>' : '<div style="height: 12px; margin-top: 4px;"></div>'}
        </div>
        `;
    })
    .join("");
}

/**
 * Прыжок к конкретному шагу (вопросу) из прогресс-бара.
 * Работает только у хоста.
 * @param {number} step - индекс вопроса
 */
function jumpToQuestion(step) {
  if (role !== "host") return;
  currentStep = step;
  socket.emit("move_to_step", { room: roomCode, step: step });
  socket.emit("get_update", roomCode);
  refreshUI();
}

/**
 * Рисует турнирную таблицу очков игроков на экране хоста.
 * Обновляет только измененные элементы, не перерисовывая всю таблицу.
 * @param {{name: string, score: number, is_host: boolean, emoji: string}[]} players
 */
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
  
  // Если таблица пуста (первый раз), создаем полностью
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

  // Иначе обновляем только измененные элементы
  const existingCards = board.querySelectorAll(".scoreboard-card");
  
  sorted.forEach((p, i) => {
    const rankEmoji = i < 3 ? medals[i] : (i + 1);
    const isLeader = i === 0;
    const rankClass = i === 0 ? 'rank-1st' : i === 1 ? 'rank-2nd' : i === 2 ? 'rank-3rd' : 'rank-other';
    
    let card = board.querySelector(`[data-player="${p.name}"]`);
    
    if (!card) {
      // Новый игрок - добавляем в конец
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
      card.removeAttribute("style"); // Убираем анимацию
      
      // Обновляем текст без перерисовки
      card.querySelector(".scoreboard-rank").textContent = rankEmoji;
      card.querySelector(".scoreboard-score").textContent = `${p.score || 0}🏆`;
      
      // Двигаем карточку в правильную позицию
      if (card.parentNode.children[i] !== card) {
        // Если позиция изменилась, перемещаем элемент
        board.insertBefore(card, board.children[i]);
      }
      
      // Обновляем коронку для лидера
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

/**
 * Отправка ответа игрока на сервер и обновление интерфейса
 * подтверждения отправки.
 * @param {string} val - текст ответа
 */
function sendAnswer(val) {
  myAnswersHistory[currentStep.toString()] = val;

  socket.emit("send_answer", {
    room: roomCode,
    name: playerName,
    answer: val,
    questionIndex: currentStep,
  });

  const answerArea = document.getElementById("player-answer-area");

  if (answerArea) {
    answerArea.innerHTML = `
            <div class="sent-confirmation">
                <div class="status-badge-sent">Отправлено 🚀</div>
                
                <div class="your-answer-preview">
                    <div class="your-answer-label">Твой ответ:</div>
                    <div class="your-answer-text">${val}</div>
                </div>

                <div class="waiting-loader">
                    <div class="pulse-dot" style="display:inline-block; margin-right:8px;"></div>
                    <span>Ждем остальных игроков...</span>
                </div>
            </div>
        `;
  }
}

/**
 * Небольшая анимация аватара игрока при клике в лобби.
 * @param {HTMLElement} element - карточка игрока
 */
function handleEmojiClick(element) {
  const emoji = element.querySelector(".avatar-emoji");
  if (emoji) {
    emoji.classList.add("avatar-clicked");
    setTimeout(() => {
      emoji.classList.remove("avatar-clicked");
    }, 500);
  }
}

/**
 * Главная функция обновления UI после смены шага.
 * - Обновляет прогресс-бар.
 * - Для хоста: обновляет текст вопроса, кнопку и запрашивает актуальные ответы.
 * - Для игрока: перерисовывает текущий вопрос и варианты ответа.
 */
function refreshUI() {
  renderProgress();
  if (role === "host") {
    updateHostUI();
    socket.emit("get_update", roomCode);
    const btn = document.getElementById("next-btn");
    if (btn) {
      if (currentStep !== realGameStep) {
        btn.innerText = "↩ Вернуться к текущему вопросу";
        btn.onclick = () => {
          currentStep = realGameStep;
          refreshUI();
          socket.emit("get_update", roomCode);
        };
      } else {
        btn.onclick = nextQuestion;
        btn.innerText =
          currentStep === currentQuestions.length - 1
            ? "🏆 ПОДВЕСТИ ИТОГИ"
            : "СЛЕДУЮЩИЙ ВОПРОС";
      }
    }
  } else {
    renderPlayerQuestion();
  }
}

/**
 * Обновляет UI хоста под текущий вопрос:
 * текст вопроса, правильный ответ, внешний вид и текст кнопки "Дальше".
 */
function updateHostUI() {
  const q = currentQuestions[currentStep];
  const isLastQuestion = currentStep === currentQuestions.length - 1;
  document.getElementById(
    "host-question-text"
  ).innerText = `${currentStep + 1}. ${q.text}`;
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

/**
 * Рендерит текущий вопрос и область ответа на стороне игрока.
 * Поддерживает навигацию по истории вопросов (playerViewStep).
 * Варианты: кнопки с вариантами или текстовое поле ввода.
 */
function renderPlayerQuestion(slideDir) {
  const step = playerViewStep;
  const q = currentQuestions[step];
  const area = document.getElementById("player-answer-area");
  const title = document.getElementById("player-question-text");
  if (!q) return;

  const canGoBack = step > 0;
  const canGoForward = step < realGameStep;
  const showNav = realGameStep > 0;

  // При навигации — slide, при загрузке/переходе — reveal
  const animClass = slideDir === 'left' ? 'slide-nav-left'
                  : slideDir === 'right' ? 'slide-nav-right'
                  : 'reveal-anim';

  const navHTML = showNav ? `
      <div class="player-nav-arrows">
          <button class="btn-nav-arrow ${canGoBack ? '' : 'nav-disabled'}" onclick="playerNavBack()" ${canGoBack ? '' : 'disabled'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div class="question-counter">
              ${step + 1} <span style="opacity: 0.3;">/ ${currentQuestions.length}</span>
          </div>
          <button class="btn-nav-arrow ${canGoForward ? '' : 'nav-disabled'}" onclick="playerNavForward()" ${canGoForward ? '' : 'disabled'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
      </div>
  ` : `
      <div class="question-counter">
          ${step + 1} <span style="opacity: 0.3;">/ ${currentQuestions.length}</span>
      </div>
  `;

  title.innerHTML = `
        <div class="player-header">
            <div class="player-info-badge">
                <span style="font-size: 1.2rem;">${myEmoji}</span>
                <span class="player-name-text">${playerName}</span>
            </div>
            ${navHTML}
        </div>
        <div class="question-container ${animClass}">
            <div class="question-main-text">${q.text}</div>
            <div class="question-line"></div>
        </div>
    `;

  // Просмотр прошлого вопроса — только показ ответа
  if (step < realGameStep) {
    const pastAnswer = myAnswersHistory[step.toString()];
    area.innerHTML = `
        <div class="sent-confirmation ${animClass}">
            <div class="your-answer-preview">
                <div class="your-answer-label">Твой ответ:</div>
                <div class="your-answer-text">${pastAnswer || '—'}</div>
            </div>
        </div>
    `;
    return;
  }

  // Текущий вопрос, но уже отвечен
  if (myAnswersHistory[step.toString()]) {
    const myAnswer = myAnswersHistory[step.toString()];
    area.innerHTML = `
        <div class="sent-confirmation ${animClass}">
            <div class="status-badge-sent">Отправлено 🚀</div>
            <div class="your-answer-preview">
                <div class="your-answer-label">Твой ответ:</div>
                <div class="your-answer-text">${myAnswer}</div>
            </div>
            <div class="waiting-loader">
                <div class="pulse-dot" style="display:inline-block; margin-right:8px;"></div>
                <span>Ждем остальных игроков...</span>
            </div>
        </div>
    `;
    return;
  }

  // Текущий вопрос, ещё не отвечен — обычный ввод
  if (q.type === "options") {
    area.innerHTML = `
            <div class="answers-grid ${animClass}">
                ${q.options
                  .map(
                    (o) => `
                    <button class="btn-answer" onclick="sendAnswer('${o}')">
                        ${o}
                    </button>
                `
                  )
                  .join("")}
            </div>
        `;
  } else {
    area.innerHTML = `
            <div class="input-group-container ${animClass}">
                <div class="input-wrapper" id="input-box">
                    <input type="text" id="ans-text" class="answer-input-field" maxlength="50" placeholder="Ответ...">
                    <button class="btn-send-arrow" onclick="validateAndSend()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        `;
  }
}

/**
 * Навигация игрока на предыдущий вопрос.
 */
function playerNavBack() {
  if (playerViewStep > 0) {
    playerViewStep--;
    renderPlayerQuestion('right');
  }
}

/**
 * Навигация игрока на следующий вопрос (не дальше текущего).
 */
function playerNavForward() {
  if (playerViewStep < realGameStep) {
    playerViewStep++;
    renderPlayerQuestion('left');
  }
}

/**
 * Проверка и отправка текстового ответа:
 * - если поле пустое — трясём инпут и даём лёгкий вибро-отклик,
 * - иначе отправляем ответ на сервер через sendAnswer.
 */
function validateAndSend() {
  const input = document.getElementById("ans-text");
  const val = input.value.trim();

  if (val === "") {
    const box = document.getElementById("input-box");
    box.classList.add("shake-anim");
    setTimeout(() => box.classList.remove("shake-anim"), 500);
    if (window.navigator.vibrate) window.navigator.vibrate(50);
    return;
  }
  sendAnswer(val);
}

// Сама функция отправки
function shareRoomLink() {
    // ВАЖНО: Проверь, как у тебя называется переменная с кодом комнаты!
    // Если она не глобальная, попробуй взять её из текста на экране:
    const currentRoomCode = window.roomCode || document.getElementById('display-room-code').innerText;

    if (!currentRoomCode || currentRoomCode === "123456") {
        console.error("Код комнаты еще не готов");
        return;
    }

    const shareUrl = `${window.location.origin}/index.html?room=${currentRoomCode}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Quiz Party 🎉',
            text: `Заходи в мою игру! Код: ${currentRoomCode}`,
            url: shareUrl
        }).catch(err => {
            console.log("Share отклонен, копируем в буфер...");
            fallbackCopyText(shareUrl);
        });
    } else {
        fallbackCopyText(shareUrl);
    }
}


// Функция копирования кода номера
function handleCopySequence() {
    const area = document.getElementById('room-interactive-area');
    const codeElement = document.getElementById('display-room-code');
    const codeText = codeElement.innerText;

    // 1. Копируем в буфер
    const shareUrl = `${window.location.origin}/index.html?room=${codeText}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
        
        // 2. Включаем анимацию замены текста
        area.classList.add('is-copied');

        // 3. Возвращаем обратно через 1.5 секунды
        setTimeout(() => {
            area.classList.remove('is-copied');
        }, 1500);
    });
}

// Добавляем проверку клика по самому тексту кода
document.addEventListener('click', (e) => {
    // Проверяем клик по зоне кода или кнопке копирования
    if (e.target.closest('#copy-room-btn') || e.target.closest('#display-room-code')) {
        e.preventDefault(); // Предотвращаем стандартное выделение текста
        handleCopySequence();
    }
    
    if (e.target.closest('#share-room-btn')) {
        e.preventDefault();
        if (navigator.share) {
            shareRoomLink(); 
        } else {
            handleCopySequence();
        }
    }
});


window.spawnConfetti = function(event) {
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;

    confetti({
        particleCount: 150, // БЫЛО 40 — ТЕПЕРЬ ЦЕЛЫЙ ВОРОХ!
        spread: 50,        // Увеличили угол разлета
        origin: { x: x, y: y },
        colors: ['#FFD700', '#f175ff', '#43fff2', '#ffffff'],
        ticks: 300,         // Конфетти будут лететь чуть дольше
        gravity: 0.8,       // Сделали их чуть легче (стандарт 1)
        scalar: 1.2,        // Сами конфетти стали чуть крупнее
        disableForReducedMotion: true
    });
};

// Точка входа модуля — инициализация страницы игры.
window.onload = init;

