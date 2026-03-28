/* =========================================
   БИБЛИОТЕКА ВОПРОСОВ
   Серверная библиотека, вкладка избранного и импорт
   reusable-вопросов в create-форму.
========================================= */

const createLibraryLogger = window.QuizFeatureLogger?.createLogger?.('web.create.library')
    || console;

function getLibraryModal() {
    return document.getElementById('library-modal');
}

function getLibraryFilterContainer() {
    return document.getElementById('library-filter');
}

function getLibraryListContainer() {
    return document.getElementById('library-list');
}

function normalizeLibraryFavoriteKey(question) {
    return question?.source_question_public_id || question?.public_id || null;
}

function isQuestionFavorite(question) {
    const favoriteKey = normalizeLibraryFavoriteKey(question);
    if (!favoriteKey) {
        return Boolean(question?.is_favorite);
    }
    return favoriteQuestions.some((item) => normalizeLibraryFavoriteKey(item) === favoriteKey);
}

function upsertFavoriteQuestionLocally(question) {
    const favoriteKey = normalizeLibraryFavoriteKey(question);
    const nextFavorite = {
        ...question,
        is_favorite: true,
    };

    favoriteQuestions = [
        nextFavorite,
        ...favoriteQuestions.filter((item) => normalizeLibraryFavoriteKey(item) !== favoriteKey),
    ];

    questionsLibrary = questionsLibrary.map((item) => {
        if (normalizeLibraryFavoriteKey(item) !== favoriteKey) {
            return item;
        }
        return {
            ...item,
            is_favorite: true,
        };
    });

    if (currentIdea && normalizeLibraryFavoriteKey(currentIdea) === favoriteKey) {
        currentIdea = {
            ...currentIdea,
            is_favorite: true,
        };
    }
}

function removeFavoriteQuestionLocally(question) {
    const favoriteKey = normalizeLibraryFavoriteKey(question);
    favoriteQuestions = favoriteQuestions.filter((item) => normalizeLibraryFavoriteKey(item) !== favoriteKey);
    questionsLibrary = questionsLibrary.map((item) => {
        if (normalizeLibraryFavoriteKey(item) !== favoriteKey) {
            return item;
        }
        return {
            ...item,
            is_favorite: false,
        };
    });

    if (currentIdea && normalizeLibraryFavoriteKey(currentIdea) === favoriteKey) {
        currentIdea = {
            ...currentIdea,
            is_favorite: false,
        };
    }
}

function renderLibraryFilters(categories = libraryCategories) {
    const container = getLibraryFilterContainer();
    if (!container) {
        return;
    }

    const buttonConfigs = [
        { id: 'all', label: 'Все' },
        { id: 'favorites', label: 'Избранные' },
        ...categories.map((category) => ({
            id: category.slug,
            label: category.title,
        })),
    ];

    container.innerHTML = '';
    buttonConfigs.forEach((config) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-btn ${activeLibraryCategory === config.id ? 'active' : ''}`;
        button.dataset.category = config.id;
        button.textContent = config.label;
        button.onclick = () => filterLibrary(config.id);
        container.appendChild(button);
    });
}

function getFilteredLibraryItems() {
    if (activeLibraryCategory === 'favorites') {
        return favoriteQuestions;
    }
    if (activeLibraryCategory === 'all') {
        return questionsLibrary;
    }
    return questionsLibrary.filter((question) => question.category_slug === activeLibraryCategory);
}

function renderLibraryEmptyState(container) {
    const profile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
    const requiresProfile = activeLibraryCategory === 'favorites' && !profile?.id;
    container.innerHTML = `
        <div class="library-empty-state">
            ${escapeHtml(
                requiresProfile
                    ? 'Сначала сохрани профиль, чтобы пользоваться избранным.'
                    : 'По этому фильтру пока нет вопросов.',
            )}
        </div>
    `;
}

async function handleLibraryFavoriteToggle(question) {
    const profile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
    if (!profile?.id) {
        showToast('Сначала сохрани профиль, чтобы пользоваться избранным.');
        createLibraryLogger.warn('favorite.toggle.denied_local', {
            reason: 'missing_profile',
        });
        return;
    }

    try {
        if (isQuestionFavorite(question)) {
            await window.QuizQuestionBankApi.removeFavoriteQuestion(question.public_id, {
                originScreen: 'create',
            });
            removeFavoriteQuestionLocally(question);
        } else {
            const savedQuestion = await window.QuizQuestionBankApi.addFavoriteQuestion({
                originScreen: 'create',
                sourceQuestionPublicId: normalizeLibraryFavoriteKey(question),
            });
            upsertFavoriteQuestionLocally(savedQuestion);
        }
        renderLibraryQuestions();
    } catch (error) {
        createLibraryLogger.warn('favorite.toggle.failed', {
            questionPublicId: question?.public_id || null,
            message: error?.message || 'unknown_error',
        });
        showToast('Не удалось обновить избранное. Попробуй еще раз.');
    }
}

function renderLibraryQuestions() {
    const container = getLibraryListContainer();
    if (!container) {
        return;
    }

    const items = getFilteredLibraryItems();
    renderLibraryFilters();

    if (!items.length) {
        renderLibraryEmptyState(container);
        return;
    }

    container.innerHTML = '';
    items.forEach((question) => {
        const card = document.createElement('div');
        card.className = 'library-item';

        const favoriteActive = isQuestionFavorite(question);
        const typeMarkup = question.type === 'text'
            ? '<i class="fa-solid fa-pen"></i> Текст'
            : '<i class="fa-solid fa-circle-dot"></i> Выбор';

        card.innerHTML = `
            <div class="library-item-top">
                <span class="library-tag">${typeMarkup}</span>
                <button type="button" class="library-favorite-button ${favoriteActive ? 'is-active' : ''}">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
            <div class="library-item-content">
                <b>${escapeHtml(question.text)}</b>
                <div class="library-answer-preview">
                    <i class="fa-solid fa-check-double"></i> Ответ: ${escapeHtml(question.correct)}
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            importQuestion(question);
            toggleLibrary();
        });

        card.querySelector('.library-favorite-button')?.addEventListener('click', (event) => {
            event.stopPropagation();
            void handleLibraryFavoriteToggle(question);
        });

        container.appendChild(card);
    });

    container.scrollTop = 0;
}

function toggleLibrary() {
    const modal = getLibraryModal();
    if (!modal) {
        return;
    }

    const isVisible = modal.style.display === 'flex';
    if (isVisible) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        return;
    }

    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    renderLibraryQuestions();
}

function filterLibrary(category) {
    activeLibraryCategory = category || 'all';
    renderLibraryQuestions();
}

function importQuestion(question) {
    const questionInput = document.getElementById('q-input-text');
    const typeOptions = document.querySelectorAll('.type-option');
    if (!questionInput) {
        return;
    }

    questionInput.value = question.text || '';
    questionInput.classList.remove('idea-inserted');
    void questionInput.offsetWidth;
    questionInput.classList.add('idea-inserted');

    currentQuestionSourcePublicId = normalizeLibraryFavoriteKey(question);
    if (question.type === 'text') {
        selectType('text', typeOptions[0], { preserveSourceQuestion: true });
        document.getElementById('q-input-correct').value = question.correct || '';
    } else {
        selectType('options', typeOptions[1], { preserveSourceQuestion: true });
        const optionValues = Array.isArray(question.options) ? question.options : [];
        const correctIndex = optionValues.indexOf(question.correct);
        renderOptionRows(
            optionValues.length || DEFAULT_OPTIONS,
            optionValues,
            correctIndex >= 0 ? correctIndex : 0,
        );
    }

    setTimeout(() => questionInput.classList.remove('idea-inserted'), 800);
    updateClearButtons();
    saveDraftToLocal();
}
