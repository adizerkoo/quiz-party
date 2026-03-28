/* =========================================
   ИДЕИ ВОПРОСОВ
   Ротация случайной идеи из серверной публичной библиотеки
   и быстрая вставка в форму.
========================================= */

function changeIdea() {
    if (!questionsLibrary.length) {
        return;
    }

    const ideaText = document.getElementById('random-idea-text');
    if (!ideaText) {
        return;
    }

    ideaText.style.opacity = 0;
    ideaText.style.transform = 'translateY(5px)';

    setTimeout(() => {
        let randomIndex = Math.floor(Math.random() * questionsLibrary.length);
        while (questionsLibrary.length > 1 && questionsLibrary[randomIndex] === currentIdea) {
            randomIndex = Math.floor(Math.random() * questionsLibrary.length);
        }

        currentIdea = questionsLibrary[randomIndex];
        ideaText.textContent = currentIdea?.text || '';
        ideaText.style.opacity = 1;
        ideaText.style.transform = 'translateY(0)';
    }, 200);
}

function insertIdea() {
    if (!currentIdea) {
        return;
    }
    importQuestion(currentIdea);
}
