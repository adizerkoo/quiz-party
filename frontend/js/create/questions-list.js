/* =========================================
   СПИСОК ВОПРОСОВ
   Рендер карточек добавленных вопросов
   с превью вариантов и кнопками действий.
========================================= */


function renderQuestions() {
    const list = document.getElementById('questions-list');
    const countEl = document.getElementById('q-count');
    const listZone = document.querySelector('.list-zone');

    list.innerHTML = "";
    countEl.innerText = quizQuestions.length;

    // Скрываем блок если вопросов нет
    if (quizQuestions.length === 0) {
        listZone.style.display = "none";
        return;
    }
    listZone.style.display = "block";

    quizQuestions.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = "question-row";

        let answersHtml = "";
        if (q.type === 'options') {
            answersHtml = `<div class="preview-options-grid">`;
            q.options.forEach(opt => {
                const isCorrect = opt === q.correct;
                answersHtml += `<div class="preview-opt-item ${isCorrect ? 'is-correct' : ''}">${opt} ${isCorrect ? '<i class="fa fa-check"></i>' : ''}</div>`;
            });
            answersHtml += `</div>`;
        } else {
            answersHtml = `<div class="preview-correct-text">Ответ: ${q.correct}</div>`;
        }

        div.innerHTML = `
        <div class="question-card">
            <div class="question-top">
                <div class="question-number">${index + 1}</div>
                <div class="question-text">${q.text}</div>
                <div class="question-actions">
                    <button class="action-btn btn-edit" onclick="editQuestion(${index})">
                        <i class="fa fa-pen"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="removeQuestion(${index})">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
            ${answersHtml}
        </div>
        `;
        list.appendChild(div);
    });
}
