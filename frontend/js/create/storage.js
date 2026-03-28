/* =========================================
   LOCALSTORAGE ДЛЯ CREATE-ЭКРАНА
   Храним title, список вопросов и текущий draft формы.
========================================= */

function readStoredQuizQuestions() {
    try {
        const raw = localStorage.getItem('quizQuestions');
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Failed to read stored quiz questions', error);
        return [];
    }
}

function readStoredCreateDraft() {
    try {
        const raw = localStorage.getItem('quizDraft');
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.warn('Failed to read stored create draft', error);
        return null;
    }
}

function writeStoredCreateDraft(payload) {
    localStorage.setItem('quizDraft', JSON.stringify(payload));
}

function saveDraftToLocal() {
    const title = document.getElementById('quiz-title-input')?.value.trim() || '';
    const questionText = document.getElementById('q-input-text')?.value.trim() || '';
    const type = document.getElementById('q-input-type')?.value || 'text';
    const correctText = document.getElementById('q-input-correct')?.value.trim() || '';
    const options = collectOptionValues();
    const selectedRadio = document.querySelector('input[name="correct-opt"]:checked');
    const selectedIndex = selectedRadio ? parseInt(selectedRadio.value, 10) : 0;

    localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));
    writeStoredCreateDraft({
        title,
        questionText,
        type,
        correctText,
        options,
        selectedIndex,
        sourceQuestionPublicId: currentQuestionSourcePublicId || null,
    });
}
