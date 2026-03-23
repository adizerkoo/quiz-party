/* =========================================
   РАБОТА С LOCALSTORAGE
   Сохранение черновика формы и списка
   вопросов между сессиями.
========================================= */


// --- Сохранить текущее состояние формы в localStorage ---
function saveDraftToLocal() {
    const title = document.getElementById('quiz-title-input').value.trim();
    const questionText = document.getElementById('q-input-text').value.trim();
    const type = document.getElementById('q-input-type').value;
    const correctText = document.getElementById('q-input-correct').value.trim();
    const options = collectOptionValues();

    const selectedRadio = document.querySelector('input[name="correct-opt"]:checked');
    const selectedIndex = selectedRadio ? parseInt(selectedRadio.value) : 0;

    // Сохраняем добавленные вопросы
    localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));

    // Сохраняем черновик текущего вопроса + название
    localStorage.setItem('quizDraft', JSON.stringify({
        title,
        questionText,
        type,
        correctText,
        options,
        selectedIndex
    }));
}
