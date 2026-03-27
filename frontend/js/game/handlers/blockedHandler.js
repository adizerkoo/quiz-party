/**
 * @file blockedHandler.js
 * @description Обработчик событий блокировки для игрового экрана.
 */

function _showBlockedScreen(icon, title, subtitle) {
  ["host-screen", "player-screen", "finish-screen"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const blocked = document.getElementById("blocked-screen");
  if (blocked) {
    const content = blocked.querySelector(".blocked-content");
    if (content) {
      content.querySelector(".blocked-icon").textContent = icon;
      content.querySelector(".party-title").textContent = title;
      content.querySelector(".party-subtitle").textContent = subtitle;
    }
    blocked.style.display = "block";
  }
}

function _clearActiveSessionCredentials() {
  window.QuizUserProfile?.clearStoredSessionCredentials?.({
    roomCode,
    role,
  });
}

function _showResumeUnavailable(reason) {
  if (reason === "participant_left") {
    _clearActiveSessionCredentials();
    _showBlockedScreen(
      "👋",
      "Вы вышли из игры",
      "Вы уже покинули эту игру добровольно, поэтому вернуться в неё больше нельзя.",
    );
    return;
  }

  if (reason === "resume_window_expired") {
    _clearActiveSessionCredentials();
    _showBlockedScreen(
      "⏳",
      "Вернуться уже нельзя",
      "В этой игре слишком давно не было активности. Для неё больше не показывается возврат.",
    );
    return;
  }

  if (reason === "already_connected") {
    _showBlockedScreen(
      "📱",
      "Игра уже открыта",
      "Эта сессия уже активна в другом окне или на другом устройстве.",
    );
    return;
  }

  _clearActiveSessionCredentials();
  _showBlockedScreen(
    "🚫",
    "Вернуться не получилось",
    "Для этой игры сохранённые данные больше не подходят. Открой другую комнату из меню.",
  );
}

function _showCancelledGame(data) {
  _clearActiveSessionCredentials();

  if (data?.reason === "host_timeout") {
    _showBlockedScreen(
      "🛑",
      "Игра отменена",
      "Хост не вернулся вовремя, поэтому игра была автоматически отменена.",
    );
    return;
  }

  _showBlockedScreen(
    "🧊",
    "Игра отменена",
    "В игре слишком долго не было активности, поэтому она была автоматически закрыта.",
  );
}

function registerBlockedHandler(socket) {
  socket.on("room_full", () => {
    _showBlockedScreen(
      "😱",
      "Комната переполнена",
      "В этой комнате уже максимальное число игроков. Попробуй подключиться позже или создай свою игру.",
    );
    socket.disconnect();
  });

  socket.on("game_already_started", () => {
    _showBlockedScreen(
      "🚫",
      "Игра уже началась",
      "Комната уже в процессе игры. Попробуй присоединиться к другой комнате.",
    );
    socket.disconnect();
  });

  socket.on("host_already_connected", () => {
    _showBlockedScreen(
      "🧑‍🏫",
      "Хост уже подключён",
      "Другой ведущий уже управляет этой игрой. Если это ты, закрой предыдущую вкладку и попробуй снова.",
    );
    socket.disconnect();
  });

  socket.on("player_kicked", () => {
    _clearActiveSessionCredentials();
    _showBlockedScreen(
      "⛔",
      "Вас исключили из комнаты",
      "Организатор удалил вас из этой игры. Вернитесь в меню и выберите другую комнату.",
    );
    socket.disconnect();
  });

  socket.on("host_auth_failed", () => {
    _clearActiveSessionCredentials();
    _showBlockedScreen(
      "🔒",
      "Не удалось подтвердить доступ хоста",
      "Токен ведущего устарел или был потерян. Вернитесь в меню и откройте комнату заново.",
    );
    socket.disconnect();
  });
  socket.on("resume_unavailable", (data) => {
    _showResumeUnavailable(data?.reason);
    socket.disconnect();
  });

  socket.on("game_cancelled", (data) => {
    _showCancelledGame(data);
    socket.disconnect();
  });

  socket.on("leave_confirmed", () => {
    _clearActiveSessionCredentials();
    socket.disconnect();
    window.location.href = "index.html";
  });
}

function initBlockedHandler(socket) {
  registerBlockedHandler(socket);
}
