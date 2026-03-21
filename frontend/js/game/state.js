/* =========================================
   ГЛОБАЛЬНОЕ СОСТОЯНИЕ ИГРЫ
   Все переменные, разделяемые между
   модулями страницы game.html.
========================================= */

const socket = io();

// Заголовок викторины (с бэка)
let quizTitle = "";

// Эмодзи текущего игрока
let myEmoji = "👤";

// Текущий отображаемый шаг (может отличаться от реального, если хост листает историю)
let currentQuestion = 0;

// Реальный шаг игры на сервере
let realGameQuestion = 0;

// Максимальный достигнутый шаг (для прогресс-бара)
let maxReachedQuestion = 0;

// Шаг, который игрок просматривает (навигация по истории)
let playerViewQuestion = 0;

// Локальный кэш ответов игрока: { "1": "ответ", "2": "ответ" }
let myAnswersHistory = {};

// Массив вопросов текущей викторины
let currentQuestions = [];

// Параметры URL
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get("room");
const role = urlParams.get("role");

// Имя игрока (хост = "HOST")
let playerName =
  role === "host"
    ? "HOST"
    : sessionStorage.getItem("quiz_player_name") || "Игрок";
