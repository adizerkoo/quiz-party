/* =========================================
   GAME INIT
========================================= */

function renderQuizTitle() {
  const hostTitle = document.getElementById("quiz-title-host");
  const playerTitle = document.getElementById("quiz-title-player");

  if (hostTitle) hostTitle.innerText = quizTitle;
  if (playerTitle) playerTitle.innerText = quizTitle;
}


// Собирает URL нужного игрового режима, чтобы аккуратно переключать player <-> host экран.
function buildGameUrl(targetRole) {
  const params = new URLSearchParams({
    room: roomCode,
    role: targetRole,
  });
  return `game.html?${params.toString()}`;
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


// Проверяет на сервере, можно ли ещё использовать сохранённые credentials для выбранной роли.
async function checkResumeAccessForRole(targetRole, latestCredentials, currentProfile, installationPublicId) {
  if (!latestCredentials) {
    return { canProceed: true };
  }

  const response = await fetch("/api/v1/resume/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessions: [
        {
          room_code: roomCode,
          role: targetRole,
          participant_id: latestCredentials.participant_id || null,
          participant_token: latestCredentials.participant_token || null,
          host_token: latestCredentials.host_token || null,
          installation_public_id: latestCredentials.installation_public_id || null,
        },
      ],
      user_id: currentProfile?.id || null,
      installation_public_id:
        currentProfile?.installation_public_id ||
        installationPublicId ||
        null,
    }),
  });

  if (!response.ok) {
    return { canProceed: true };
  }

  const data = await response.json();
  const session = Array.isArray(data?.sessions) ? data.sessions[0] : null;
  if (!session) {
    return { canProceed: true };
  }

  if (session.clear_credentials) {
    if (latestCredentials.storageKey) {
      window.QuizUserProfile?.clearStoredSessionCredentialsByKey?.(latestCredentials.storageKey);
    } else {
      window.QuizUserProfile?.clearStoredSessionCredentials?.({ roomCode, role: targetRole });
    }
  }

  if (session.can_resume) {
    return { canProceed: true };
  }

  return {
    canProceed: false,
    reason: session.reason || null,
    cancelReason: session.cancel_reason || null,
  };
}


async function checkResumeAccess(latestCredentials, currentProfile, installationPublicId) {
  return checkResumeAccessForRole(role, latestCredentials, currentProfile, installationPublicId);
}


// Если текущий player-экран на самом деле открывает хост с валидными host credentials,
// заранее переводим его в host-режим и не даём создать лишнего игрока.
async function maybeRestoreHostMode(currentProfile, installationPublicId) {
  if (role === "host") {
    return false;
  }

  const hostCredentials =
    window.QuizUserProfile?.getStoredSessionCredentials?.({
      roomCode,
      role: "host",
      installation_public_id:
        currentProfile?.installation_public_id ||
        installationPublicId,
    }) || null;

  if (!hostCredentials?.host_token) {
    return false;
  }

  try {
    const hostResumeAccess = await checkResumeAccessForRole(
      "host",
      hostCredentials,
      currentProfile,
      installationPublicId,
    );

    if (!hostResumeAccess.canProceed) {
      return false;
    }

    window.QuizUserProfile?.clearStoredSessionCredentials?.({ roomCode, role: "player" });
    window.location.replace(buildGameUrl("host"));
    return true;
  } catch (error) {
    return false;
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
  const latestCredentials =
    window.QuizUserProfile?.getStoredSessionCredentials?.({
      roomCode,
      role,
      installation_public_id:
        currentProfile?.installation_public_id ||
        installationPublicId,
    }) || null;
  if (role !== "host") {
    if (!currentProfile) {
      window.location.href = `index.html?room=${encodeURIComponent(roomCode)}`;
      return;
    }

    window.QuizUserProfile?.setPlayerSessionFromProfile?.(currentProfile);
    playerName = currentProfile.username;
    myEmoji = currentProfile.avatar_emoji || myEmoji;
  }

  if (await maybeRestoreHostMode(currentProfile, installationPublicId)) {
    return;
  }

  try {
    const quizParams = new URLSearchParams();
    if (role === "host") {
      quizParams.set("role", "host");
      if (latestCredentials?.host_token) {
        quizParams.set("host_token", latestCredentials.host_token);
      }
    }
    const quizQuery = quizParams.toString();
    const response = await fetch(
      `/api/v1/quizzes/${encodeURIComponent(roomCode)}${quizQuery ? `?${quizQuery}` : ""}`,
    );

    if (!response.ok) {
      window.location.href = "index.html?error=not_found";
      return;
    }

    const data = await response.json();
    if (data.status === "cancelled") {
      window.QuizUserProfile?.clearStoredSessionCredentials?.({ roomCode, role });
      _showCancelledGame({ reason: data.cancel_reason });
      return;
    }
    if (data.status === "finished") {
      quizTitle = data.title || quizTitle;
      socket.disconnect();
      await window.QuizGameResults?.loadAndShowResults?.({ roomCode });
      return;
    }

    const resumeAccess = await checkResumeAccess(
      latestCredentials,
      currentProfile,
      installationPublicId,
    );
    if (!resumeAccess.canProceed) {
      if (resumeAccess.cancelReason) {
        _showCancelledGame({ reason: resumeAccess.cancelReason });
      } else {
        _showResumeUnavailable(resumeAccess.reason);
      }
      return;
    }

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
      const resolvedRole =
        payload?.role === "host" || (role !== "host" && payload?.host_token)
          ? "host"
          : role;

      window.QuizUserProfile?.saveStoredSessionCredentials?.({
        roomCode,
        role: resolvedRole,
        participant_id: payload?.participant_id || null,
        participant_token: payload?.participant_token || null,
        host_token: payload?.host_token || null,
        installation_public_id: resolvedInstallationPublicId,
      });

      if (resolvedRole !== role) {
        window.QuizUserProfile?.clearStoredSessionCredentials?.({ roomCode, role });
        socket.disconnect();
        window.location.replace(buildGameUrl(resolvedRole));
        return;
      }

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
      const currentCredentials =
        window.QuizUserProfile?.getStoredSessionCredentials?.({
          roomCode,
          role,
          installation_public_id:
            currentProfile?.installation_public_id ||
            installationPublicId,
        }) || null;
      const fallbackHostCredentials =
        role !== "host"
          ? (
            window.QuizUserProfile?.getStoredSessionCredentials?.({
              roomCode,
              role: "host",
              installation_public_id:
                currentProfile?.installation_public_id ||
                installationPublicId,
            }) || null
          )
          : null;

      socket.emit("join_room", {
        room: roomCode,
        name: playerName,
        role: role,
        emoji: currentProfile?.avatar_emoji,
        user_id: currentProfile?.id,
        host_token:
          role === "host"
            ? currentCredentials?.host_token
            : fallbackHostCredentials?.host_token,
        participant_token: role !== "host" ? currentCredentials?.participant_token : undefined,
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
