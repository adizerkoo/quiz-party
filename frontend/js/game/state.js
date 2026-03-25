/* =========================================
   GLOBAL GAME STATE
========================================= */

const socket = io();

let quizTitle = "";
let myEmoji = sessionStorage.getItem("quiz_player_emoji") || "👤";
let currentQuestion = 0;
let realGameQuestion = 0;
let maxReachedQuestion = 0;
let playerViewQuestion = 0;
let myAnswersHistory = {};
let currentQuestions = [];

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get("room");
const role = urlParams.get("role");
const storedUserProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;

let playerName =
  role === "host"
    ? "HOST"
    : sessionStorage.getItem("quiz_player_name") || storedUserProfile?.username || "Игрок";

if (role !== "host" && storedUserProfile?.avatar_emoji && !sessionStorage.getItem("quiz_player_emoji")) {
  myEmoji = storedUserProfile.avatar_emoji;
}
