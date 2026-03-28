(function () {
  let activeResultsLoad = null;
  let loadedRoomCode = null;

  async function fetchResults(room) {
    const response = await fetch(`/api/v1/quizzes/${encodeURIComponent(room)}/results`);
    if (!response.ok) {
      throw new Error(`Failed to load results: HTTP ${response.status}`);
    }

    return response.json();
  }

  async function loadAndShowResults(options = {}) {
    const targetRoomCode = String(options.roomCode || roomCode || "").trim().toUpperCase();
    if (!targetRoomCode) {
      throw new Error("Room code is required to load results");
    }

    if (loadedRoomCode === targetRoomCode && typeof window.showResultsScreen === "function") {
      return null;
    }

    if (activeResultsLoad) {
      return activeResultsLoad;
    }

    activeResultsLoad = fetchResults(targetRoomCode)
      .then((payload) => {
        quizTitle = payload.title || quizTitle;
        currentQuestions = payload.questions || currentQuestions;
        loadedRoomCode = targetRoomCode;
        window.showResultsScreen?.(payload);
        return payload;
      })
      .finally(() => {
        activeResultsLoad = null;
      });

    return activeResultsLoad;
  }

  function resetResultsLoadState() {
    activeResultsLoad = null;
    loadedRoomCode = null;
  }

  window.QuizGameResults = {
    fetchResults,
    loadAndShowResults,
    resetResultsLoadState,
  };
})();
