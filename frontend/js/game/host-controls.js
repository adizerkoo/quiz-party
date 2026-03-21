/* =========================================
   УПРАВЛЕНИЕ ИГРОЙ (ХОСТ)
   Старт, переход к следующему вопросу,
   завершение игры, корректировка баллов.
========================================= */

// Флаг блокировки повторного нажатия «Следующий вопрос»
let _nextLocked = false;


// Возврат в редактор викторины (с сохранением данных)
function goBackToEditor() {
  localStorage.setItem('quizQuestions', JSON.stringify(currentQuestions));
  localStorage.setItem('quizDraft', JSON.stringify({
    title: quizTitle,
    questionText: '',
    type: 'text',
    correctText: '',
    options: ['', '', '', ''],
    selectedIndex: 0
  }));
  window.location.href = "create.html";
}


// Старт игры — только для хоста
function startGame() {
  currentQuestion = 1;
  socket.emit("start_game_signal", { room: roomCode });
}


// Обработчик кнопки «Следующий вопрос»
// Если хост ушёл в историю — возвращает на текущий шаг
function nextQuestion() {
  if (currentQuestion !== realGameQuestion) {
    currentQuestion = realGameQuestion;
    refreshUI();
    return;
  }

  if (_nextLocked) return;
  _nextLocked = true;

  socket.emit("check_answers_before_next", {
    room: roomCode,
    question: currentQuestion,
  });
}


// Переход вперёд: следующий вопрос или завершение игры
function proceedToNext() {
  if (currentQuestion < currentQuestions.length) {
    socket.emit("next_question_signal", {
      room: roomCode,
      expectedQuestion: currentQuestion,
    });
  } else {
    socket.emit("finish_game_signal", { room: roomCode });
  }
}


// Корректировка баллов игрока (хост, из разбора ответов)
function changeScore(targetName, points) {
  socket.emit("override_score", {
    room: roomCode,
    playerName: targetName,
    points: points,
    questionIndex: currentQuestion,
  });
}
