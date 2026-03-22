/**
 * @file blockedHandler.js
 * @description Обработчик события "game_already_started" — показывает экран блокировки
 */

function registerBlockedHandler(socket) {
  socket.on("room_full", () => {
    ["host-screen", "player-screen", "finish-screen"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    const blocked = document.getElementById("blocked-screen");
    if (blocked) {
      const content = blocked.querySelector(".blocked-content");
      if (content) {
        content.querySelector(".blocked-icon").textContent = "😱";
        content.querySelector(".party-title").textContent = "Комната переполнена";
        content.querySelector(".party-subtitle").textContent =
          "В этой комнате уже максимум игроков (50). Попробуй позже или создай свою игру!";
      }
      blocked.style.display = "block";
    }
    socket.disconnect();
  });

  socket.on("game_already_started", () => {
    // Скрываем все основные экраны
    ["host-screen", "player-screen", "finish-screen"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

    // Показываем экран блокировки
    const blocked = document.getElementById("blocked-screen");
    if (blocked) blocked.style.display = "block";

    // Отключаемся, чтобы sync/results не перекрыли экран
    socket.disconnect();
  });
}

function initBlockedHandler(socket) {
  registerBlockedHandler(socket);
}
