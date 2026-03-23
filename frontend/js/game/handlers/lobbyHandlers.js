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
    const actualPlayers = players.filter((p) => !p.is_host);
    const isHostView = role === "host";

    // Показ/скрытие пустого состояния лобби
    const emptyState = document.getElementById("lobby-empty-state");
    if (emptyState) {
      emptyState.style.display = actualPlayers.length === 0 ? "flex" : "none";
    }

    lobbyContainers.forEach((id) => {
      const container = document.getElementById(id);
      if (!container) return;

      const newPlayersMap = {};
      actualPlayers.forEach((p) => { newPlayersMap[p.name] = p; });

      // Remove cards for players no longer in the list
      const existingCards = [...container.querySelectorAll(".player-card-lobby")];
      const existingNames = new Set();
      existingCards.forEach((card) => {
        const name = card.getAttribute("data-player-name");
        if (!name || !(name in newPlayersMap)) {
          card.remove();
        } else {
          existingNames.add(name);
        }
      });

      actualPlayers.forEach((p) => {
        const isMe = p.name === playerName;
        const showKick = isHostView && id === "lobby-players-list";
        const isOffline = p.connected === false;

        let card = container.querySelector(`[data-player-name="${CSS.escape(p.name)}"]`);

        if (card) {
          // Update existing card in-place (no re-render)
          if (isOffline) {
            card.classList.add("is-offline");
          } else {
            card.classList.remove("is-offline");
          }
        } else {
          // Create new card
          card = document.createElement("div");
          card.className = `player-card-lobby ${isMe ? "is-me" : ""} ${isOffline ? "is-offline" : ""}`;
          card.setAttribute("data-player-name", p.name);
          card.onclick = function () { handleEmojiClick(this); };
          card.innerHTML = `
            ${isMe ? '<div class="me-badge">ВЫ</div>' : ""}
            ${showKick ? `<button class="kick-player-btn" onclick="event.stopPropagation(); kickPlayer(${escapeHtml(JSON.stringify(p.name))})" title="Исключить игрока">✕</button>` : ""}
            <div class="offline-badge">offline</div>
            <div class="avatar-emoji">
              ${p.emoji || "👤"}
            </div>
            <div class="player-name-label">
              ${escapeHtml(p.name)}
            </div>
          `;
          container.appendChild(card);
        }
      });
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
