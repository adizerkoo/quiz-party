/* =========================================
   ГЛОБАЛЬНОЕ СОСТОЯНИЕ CREATE-ЭКРАНА
   Общие переменные страницы создания квиза:
   draft, библиотека вопросов, избранные и runtime-метаданные.
========================================= */

let quizQuestions = [];
let editIndex = -1;

// Публичная библиотека и пользовательские избранные теперь приходят только с backend API.
let questionsLibrary = [];
let favoriteQuestions = [];
let libraryCategories = [];
let activeLibraryCategory = 'all';

let currentIdea = null;
let currentQuestionSourcePublicId = null;
let handledTemplateDraftPublicId = null;
