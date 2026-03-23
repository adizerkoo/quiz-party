/* =========================================
   БИБЛИОТЕКА ВОПРОСОВ
   Модалка с готовыми вопросами: открытие/
   закрытие, фильтрация по категориям,
   импорт вопроса в форму.
========================================= */


// --- Открыть / закрыть модалку библиотеки ---
function toggleLibrary() {
    const modal = document.getElementById('library-modal');
    const isVisible = modal.style.display === 'flex';

    if (isVisible) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    } else {
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
        filterLibrary('all');
    }
}


// --- Фильтр вопросов по категории ---
function filterLibrary(category) {
    const container = document.getElementById('library-list');
    if (!container) return;

    // Переключаем подсветку кнопок фильтра
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.getAttribute('data-category') === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    container.innerHTML = "";

    const filtered = category === 'all'
        ? questionsLibrary
        : questionsLibrary.filter(q => q.cat === category);

    filtered.forEach(q => {
        const item = document.createElement('div');
        item.className = 'library-item';

        const typeMarkup = q.type === 'text'
            ? `<i class="fa-solid fa-pen"></i> Текст`
            : `<i class="fa-solid fa-circle-dot"></i> Выбор`;

        item.innerHTML = `
            <div class="library-item-content">
                <span class="library-tag">${typeMarkup}</span>
                <b>${escapeHtml(q.text)}</b>
                <div class="library-answer-preview">
                    <i class="fa-solid fa-check-double"></i> Ответ: ${escapeHtml(q.correct)}
                </div>
            </div>
        `;

        item.onclick = () => {
            importQuestion(q);
            toggleLibrary();
        };
        container.appendChild(item);
    });

    container.scrollTop = 0;
}


// --- Импортировать вопрос из библиотеки в форму ---
function importQuestion(q) {
    const questionInput = document.getElementById('q-input-text');
    const typeOptions = document.querySelectorAll('.type-option');
    const typeInput = document.getElementById('q-input-type');

    if (!questionInput || !typeInput) return;

    questionInput.value = q.text;

    // Эффект вспышки
    questionInput.classList.remove('idea-inserted');
    void questionInput.offsetWidth; // reflow для перезапуска анимации
    questionInput.classList.add('idea-inserted');

    // Переключаем тип
    selectType(q.type, q.type === 'text' ? typeOptions[0] : typeOptions[1]);

    if (q.type === 'text') {
        document.getElementById('q-input-correct').value = q.correct || '';
    } else if (q.type === 'options') {
        const correctIdx = q.options.indexOf(q.correct);
        renderOptionRows(q.options.length, q.options, correctIdx >= 0 ? correctIdx : 0);
    }

    setTimeout(() => questionInput.classList.remove('idea-inserted'), 800);
    updateClearButtons();
    saveDraftToLocal();
}
