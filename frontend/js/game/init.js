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

  let currentProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
  const installationPublicId =
    currentProfile?.installation_public_id ||
    window.QuizUserProfile?.getOrCreateInstallationPublicId?.() ||
    null;
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
    let lastJoinedSocketId = null;

    renderQuizTitle();
    renderProgress();
    initializeSocketHandlers(socket);

    socket.on("session_credentials", (payload) => {
      const resolvedInstallationPublicId =
        payload?.installation_public_id ||
        currentProfile?.installation_public_id ||
        installationPublicId;

      window.QuizUserProfile?.saveStoredSessionCredentials?.({
        roomCode,
        role,
        participant_id: payload?.participant_id || null,
        participant_token: payload?.participant_token || null,
        host_token: payload?.host_token || null,
        installation_public_id: resolvedInstallationPublicId,
      });

      if (resolvedInstallationPublicId) {
        currentProfile =
          window.QuizUserProfile?.mergeStoredUserProfileIdentity?.({
            installation_public_id: resolvedInstallationPublicId,
          }) || currentProfile;
      }
    });

    socket.on("name_assigned", (data) => {
      playerName = data.name;
      sessionStorage.setItem("quiz_player_name", playerName);
      console.log("Player name adjusted:", playerName);
    });

    function emitJoinPayload() {
      if (socket.id && lastJoinedSocketId === socket.id) {
        return;
      }

      lastJoinedSocketId = socket.id || lastJoinedSocketId;
      const deviceInfo = window.QuizUserProfile?.detectClientDeviceInfo?.() || {};
      const latestCredentials =
        window.QuizUserProfile?.getStoredSessionCredentials?.({
          roomCode,
          role,
          installation_public_id:
            currentProfile?.installation_public_id ||
            installationPublicId,
        }) || null;

      socket.emit("join_room", {
        room: roomCode,
        name: playerName,
        role: role,
        emoji: currentProfile?.avatar_emoji,
        user_id: currentProfile?.id,
        host_token: role === "host" ? latestCredentials?.host_token : undefined,
        participant_token: role !== "host" ? latestCredentials?.participant_token : undefined,
        installation_public_id:
          currentProfile?.installation_public_id ||
          installationPublicId,
        ...deviceInfo,
      });
      socket.emit("request_sync", { room: roomCode, name: playerName });
    }

    socket.on("connect", () => {
      lastJoinedSocketId = null;
      emitJoinPayload();
    });

    if (socket.connected) {
      emitJoinPayload();
    }

    const screenId = role === "host" ? "host-screen" : "player-screen";
    const screenEl = document.getElementById(screenId);
    if (screenEl) screenEl.style.display = "block";
  } catch (error) {
    console.error("Game init failed:", error);
    window.location.href = "index.html";
  }
}


window.onload = init;
