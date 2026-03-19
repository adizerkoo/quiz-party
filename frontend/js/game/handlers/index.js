/**
 * @file index.js
 * @description Главная точка входа (entry point) для всех обработчиков socket.io событий
 * 
 * Этот файл координирует подключение всех обработчиков socket-событий.
 * Обработчики разбиты на логические модули для лучшей поддерживаемости:
 * 
 * - **utils.js** — вспомогательные функции для UI
 * - **lobbyHandlers.js** — управление списком игроков в лобби
 * - **gameControlHandlers.js** — запуск игры, переход между вопросами
 * - **answerHandlers.js** — обновление ответов, проверка готовности всех игроков
 * - **resultsHandlers.js** — финальные результаты, конфетти, разбор вопросов
 * - **syncHandlers.js** — синхронизация состояния при подключении/обновлении
 * 
 * @module handlers
 * @requires ./utils.js, ./lobbyHandlers.js, ./gameControlHandlers.js, 
 *           ./answerHandlers.js, ./resultsHandlers.js, ./syncHandlers.js
 * 
 * @example
 * // Инициализация всех обработчиков (обычно вызывается в game.html/common.js)
 * initializeSocketHandlers(socket);
 * 
 * // Проверить конфигурацию в консоли
 * debugSocketHandlers();
 */

/**
 * Инициализирует все обработчики socket.io событий
 * 
 * Вызывает функции инициализации из всех модулей в правильном порядке.
 * Должна вызваться один раз при подключении к socket.
 * 
 * @param {Object} socket - Socket.io объект
 * @throws {Error} Если socket не передан или не валиден
 * 
 * @example
 * const socket = io();
 * initializeSocketHandlers(socket);
 */
function initializeSocketHandlers(socket) {
  if (!socket) {
    console.error("❌ Socket object not provided to initializeSocketHandlers");
    return;
  }

  console.log("🔌 Initializing all socket handlers...");

  // Инициализируем все модули обработчиков в правильном порядке
  initLobbyHandlers(socket);
  initGameControlHandlers(socket);
  initAnswerHandlers(socket);
  initResultsHandlers(socket);
  initSyncHandlers(socket);

  console.log("✅ All socket handlers initialized successfully");
}

/**
 * Модуль для отладки: выводит список всех зарегистрированных обработчиков
 * 
 * Используйте в консоли браузера для проверки конфигурации:
 * @example
 * debugSocketHandlers();
 * // Выведет красивую таблицу со всеми инициализированными модулями
 * 
 * @returns {void}
 */
function debugSocketHandlers() {
  console.group("📊 Socket Handlers Configuration");
  console.info("Registered handler modules:");
  console.log("  ✓ Lobby Handlers (update_players)");
  console.log("  ✓ Game Control Handlers (game_started, move_to_next)");
  console.log("  ✓ Answer Handlers (update_answers, answers_check_result)");
  console.log("  ✓ Results Handlers (show_results)");
  console.log("  ✓ Sync Handlers (sync_state)");
  console.log("  ✓ Utility Functions (toggleReview, spawnConfetti, showModernConfirm)");
  console.groupEnd();
}
