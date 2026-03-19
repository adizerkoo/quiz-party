/**
 * @file lobbyHandlers.js
 * @description Обработчики событий для лобби, управление списком игроков
 * @module handlers/lobbyHandlers
 * 
 * Этот модуль отвечает за:
 * - Рендеринг списка игроков в лобби
 * - Отображение их эмодзи и имен
 * - Визуальных индикаторов текущего пользователя
 */

/**
 * Регистрирует обработчик события "update_players"
 * 
 * Обновляет список игроков в лобби. Фильтрует нехостов и выделяет текущего пользователя.
 * События получают как хост, так и игроки для синхронизации состояния.
 * 
 * @param {Object} socket - Socket.io сокет для получения события
 * @returns {void}
 */
function registerLobbyHandlers(socket) {
  /**
   * Обновление списка игроков в лобби (хост и игроки видят одно и то же).
   * 
   * @event update_players
   * @param {Array<Object>} players - Массив объектов игрока
   * @param {string} players[].name - Имя игрока
   * @param {boolean} players[].is_host - Флаг, является ли игрок хостом
   * @param {string} players[].emoji - Эмодзи аватар игрока
   * 
   * @example
   * socket.on("update_players", (players) => {
   *   // Рендер списка игроков
   * });
   */
  socket.on("update_players", (players) => {
    const lobbyContainers = ["lobby-players-list", "player-lobby-list"];

    lobbyContainers.forEach((id) => {
      const container = document.getElementById(id);
      if (!container) return;

      container.innerHTML = players
        .filter((p) => !p.is_host) // Исключаем хост из списка
        .map((p) => {
          const isMe = p.name === playerName;

          return `
            <div class="player-card-lobby ${isMe ? "is-me" : ""}" onclick="handleEmojiClick(this)">
              ${isMe ? '<div class="me-badge">ВЫ</div>' : ""}
              
              <div class="avatar-emoji">
                ${p.emoji || "👤"}
              </div>
              
              <div class="player-name-label">
                ${p.name}
              </div>
            </div>
          `;
        })
        .join("");
    });
  });
}

/**
 * Инициализирует все обработчики лобби
 * @param {Object} socket - Socket.io сокет
 */
function initLobbyHandlers(socket) {
  registerLobbyHandlers(socket);
}
