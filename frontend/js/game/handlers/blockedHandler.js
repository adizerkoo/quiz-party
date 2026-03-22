/**
 * @file blockedHandler.js
 * @description Обработчик событий блокировки — показывает экран блокировки
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

function registerBlockedHandler(socket) {
  socket.on("room_full", () => {
    _showBlockedScreen(
      "😱",
      "Комната переполнена",
      "В этой комнате уже максимум игроков (50). Попробуй позже или создай свою игру!"
    );
    socket.disconnect();
  });

  socket.on("game_already_started", () => {
    _showBlockedScreen(
      "🚫",
      "Игра уже идёт",
      "К сожалению, эта комната уже в разгаре. Попробуй присоединиться к другой игре!"
    );
    socket.disconnect();
  });

  socket.on("host_already_connected", () => {
    _showBlockedScreen(
      "👑",
      "Хост уже подключён",
      "Другой ведущий уже управляет этой игрой. Если это вы — закройте предыдущую вкладку и попробуйте снова."
    );
    socket.disconnect();
  });

  socket.on("player_kicked", () => {
    _showBlockedScreen(
      "😿",
      "Вас исключили",
      "Организатор убрал вас из комнаты. Попробуй присоединиться к другой игре!"
    );
    socket.disconnect();
  });
}

function initBlockedHandler(socket) {
  registerBlockedHandler(socket);
}
