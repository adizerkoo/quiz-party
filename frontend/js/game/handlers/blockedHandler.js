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
}

function initBlockedHandler(socket) {
  registerBlockedHandler(socket);
}
