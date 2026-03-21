/* =========================================
   ИНИЦИАЛИЗАЦИЯ ИГРЫ
   Загрузка викторины, подключение к комнате,
   обновление UI, точка входа.
========================================= */


// Определение устройства, браузера и модели из userAgent
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

  let device_model = "unknown";
  const android = ua.match(/Android[^;]*;\s*([^)]+)\)/);
  if (android) device_model = android[1].trim();
  else if (/iPhone/i.test(ua)) device_model = "Apple iPhone";
  else if (/iPad/i.test(ua))   device_model = "Apple iPad";

  return { device, browser, browser_version, device_model };
}


// Заполняет заголовки викторины на экранах хоста и игроков
function renderQuizTitle() {
  const hostTitle = document.getElementById("quiz-title-host");
  const playerTitle = document.getElementById("quiz-title-player");

  if (hostTitle) hostTitle.innerText = quizTitle;
  if (playerTitle) playerTitle.innerText = quizTitle;
}


// Главная функция обновления UI после смены шага
function refreshUI() {
  renderProgress();
  if (role === "host") {
    updateHostUI();
    socket.emit("get_update", roomCode);
    const btn = document.getElementById("next-btn");
    if (btn) {
      if (currentQuestion !== realGameQuestion) {
        btn.innerText = "↩ Вернуться к текущему вопросу";
        btn.style.background = "var(--party-pink)";
        btn.onclick = () => {
          currentQuestion = realGameQuestion;
          refreshUI();
          socket.emit("get_update", roomCode);
        };
      } else {
        btn.onclick = nextQuestion;
        btn.innerText =
          currentQuestion === currentQuestions.length
            ? "🏆 ПОДВЕСТИ ИТОГИ"
            : "СЛЕДУЮЩИЙ ВОПРОС";
      }
    }
  } else {
    renderPlayerQuestion();
  }
}


// Стартовая инициализация страницы игры
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


// Точка входа
window.onload = init;
