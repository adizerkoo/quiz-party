/* =========================================
   УПРАВЛЕНИЕ ИГРОЙ (ХОСТ)
   Старт, переход к следующему вопросу,
   завершение игры, корректировка баллов.
========================================= */

// Флаг блокировки повторного нажатия «Следующий вопрос»
let _nextLocked = false;


// Возврат в редактор викторины (с сохранением данных)
async function goBackToEditor() {
  let draftQuestions = currentQuestions;
  const storedSnapshotRaw = localStorage.getItem('quizEditorReturnSnapshot');
  if (storedSnapshotRaw) {
    try {
      const storedSnapshot = JSON.parse(storedSnapshotRaw);
      if (
        String(storedSnapshot?.roomCode || '').trim().toUpperCase() === String(roomCode || '').trim().toUpperCase()
        && Array.isArray(storedSnapshot?.questions)
        && storedSnapshot.questions.length > 0
      ) {
        draftQuestions = storedSnapshot.questions;
      }
    } catch (error) {
      // Игнорируем битый snapshot и продолжаем fallback-цепочку.
    }
  }

  const hasCompleteDraftQuestions = Array.isArray(draftQuestions) && draftQuestions.every((question) => {
    if (!question?.text) {
      return false;
    }
    if (question.type === 'text') {
      return Boolean(question?.correct);
    }
    if (!Array.isArray(question?.options) || !question.options.length) {
      return false;
    }
    return Boolean(question?.correct) && question.options.includes(question.correct);
  });

  if (hasCompleteDraftQuestions) {
    localStorage.setItem('quizQuestions', JSON.stringify(draftQuestions));
    localStorage.setItem('quizDraft', JSON.stringify({
      title: quizTitle,
      questionText: '',
      type: 'text',
      correctText: '',
      options: ['', '', '', ''],
      selectedIndex: 0
    }));
    window.location.href = "create.html";
    return;
  }

  const currentProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
  const installationPublicId =
    currentProfile?.installation_public_id ||
    window.QuizUserProfile?.getOrCreateInstallationPublicId?.() ||
    null;
  const hostCredentials =
    window.QuizUserProfile?.getStoredSessionCredentials?.({
      roomCode,
      role: 'host',
      installation_public_id:
        currentProfile?.installation_public_id ||
        installationPublicId,
    }) || null;

  if (hostCredentials?.host_token) {
    try {
      const response = await fetch(
        `/api/v1/quizzes/${encodeURIComponent(roomCode)}?role=host&host_token=${encodeURIComponent(hostCredentials.host_token)}`,
      );
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload?.questions_data) && payload.questions_data.length > 0) {
          draftQuestions = payload.questions_data;
        }
      }
    } catch (error) {
      // Если сеть недоступна, оставляем локальное состояние как fallback.
    }
  }

  localStorage.setItem('quizQuestions', JSON.stringify(draftQuestions));
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
  const playersList = document.getElementById("lobby-players-list");
  const hasPlayers = playersList && playersList.children.length > 0;

  if (!hasPlayers) {
    _showNoPlayersWarning();
    return;
  }

  currentQuestion = 1;
  socket.emit("start_game_signal", { room: roomCode });
}


/**
 * Показывает красивое предупреждение, что нет игроков
 */
function _showNoPlayersWarning() {
  // Не показывать повторно, если уже на экране
  if (document.getElementById("no-players-warning")) return;

  const overlay = document.createElement("div");
  overlay.id = "no-players-warning";
  overlay.className = "no-players-overlay";

  overlay.innerHTML = `
    <div class="no-players-card">
      <div class="no-players-emoji-row">
        <span class="no-players-emoji bounce-1">🦗</span>
        <span class="no-players-emoji bounce-2">🦗</span>
        <span class="no-players-emoji bounce-3">🦗</span>
      </div>
      <h2 class="no-players-title">Тут пока пусто!</h2>
      <p class="no-players-text">Отправь код комнаты друзьям — вместе веселее&nbsp;🎉</p>
      <button class="btn-party-main no-players-btn" onclick="_dismissNoPlayersWarning()">ПОНЯТНО 👌</button>
    </div>
  `;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) _dismissNoPlayersWarning();
  });

  document.body.appendChild(overlay);
}


function _dismissNoPlayersWarning() {
  const overlay = document.getElementById("no-players-warning");
  if (!overlay) return;
  overlay.classList.add("no-players-fade-out");
  overlay.addEventListener("animationend", () => overlay.remove());
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


// Исключение игрока из лобби (хост)
function kickPlayer(targetName) {
  socket.emit("kick_player", {
    room: roomCode,
    playerName: targetName,
  });
}
