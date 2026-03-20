/**
 * @file blockedHandler.js
 * @description Обработчик события "game_already_started" — показывает экран блокировки
 */

function registerBlockedHandler(socket) {
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
