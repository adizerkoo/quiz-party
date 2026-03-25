/* =========================================
   GAME INIT
========================================= */

function renderQuizTitle() {
  const hostTitle = document.getElementById("quiz-title-host");
  const playerTitle = document.getElementById("quiz-title-player");

  if (hostTitle) hostTitle.innerText = quizTitle;
  if (playerTitle) playerTitle.innerText = quizTitle;
}


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


async function init() {
  if (!roomCode) {
    window.location.href = "index.html";
    return;
  }

  const displayCodeEl = document.getElementById("display-room-code");
  if (displayCodeEl) {
    displayCodeEl.innerText = roomCode;
  }

  const currentProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;

  if (role !== "host") {
    if (!currentProfile) {
      window.location.href = `index.html?room=${encodeURIComponent(roomCode)}`;
      return;
    }

    window.QuizUserProfile?.setPlayerSessionFromProfile?.(currentProfile);
    playerName = currentProfile.username;
    myEmoji = currentProfile.avatar_emoji || myEmoji;
  }

  try {
    const response = await fetch(`/api/v1/quizzes/${roomCode}${role === "host" ? "?role=host" : ""}`);

    if (!response.ok) {
      window.location.href = "index.html?error=not_found";
      return;
    }

    const data = await response.json();
    quizTitle = data.title;
    currentQuestions = data.questions_data;

    renderQuizTitle();
    renderProgress();
    initializeSocketHandlers(socket);

    socket.on("name_assigned", (data) => {
      playerName = data.name;
      sessionStorage.setItem("quiz_player_name", playerName);
      console.log("Player name adjusted:", playerName);
    });

    const deviceInfo = window.QuizUserProfile?.detectClientDeviceInfo?.() || {};
    socket.emit("join_room", {
      room: roomCode,
      name: playerName,
      role: role,
      emoji: currentProfile?.avatar_emoji,
      user_id: currentProfile?.id,
      ...deviceInfo,
    });
    socket.emit("request_sync", { room: roomCode, name: playerName });

    const screenId = role === "host" ? "host-screen" : "player-screen";
    const screenEl = document.getElementById(screenId);
    if (screenEl) screenEl.style.display = "block";
  } catch (error) {
    console.error("Game init failed:", error);
    window.location.href = "index.html";
  }
}


window.onload = init;
