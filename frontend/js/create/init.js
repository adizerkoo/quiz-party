/* =========================================
   ИНИЦИАЛИЗАЦИЯ CREATE-СТРАНИЦЫ
   Гидратация draft, серверная библиотека, избранное
   и prefill из host history через template draft.
========================================= */

const createInitLogger = window.QuizFeatureLogger?.createLogger?.('web.create.init')
    || console;
let createIdeaIntervalId = null;

function readStoredEditorReturnSnapshot() {
    try {
        const raw = localStorage.getItem('quizEditorReturnSnapshot');
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        return null;
    }
}

function isLaunchReadyQuestion(question) {
    if (!question || !String(question.text || '').trim()) {
        return false;
    }

    if (question.type === 'text') {
        return Boolean(String(question.correct || '').trim());
    }

    if (!Array.isArray(question.options) || question.options.length < 2) {
        return false;
    }

    const normalizedOptions = question.options.map((item) => String(item || '').trim());
    if (normalizedOptions.some((item) => !item)) {
        return false;
    }

    return normalizedOptions.includes(String(question.correct || '').trim());
}

function shouldRepairStoredQuestions(questions) {
    return Array.isArray(questions)
        && questions.length > 0
        && questions.some((question) => !isLaunchReadyQuestion(question));
}

function setIdeaPlaceholder(message) {
    const ideaText = document.getElementById('random-idea-text');
    if (ideaText) {
        ideaText.textContent = message;
    }
}

function syncLibraryQuestionsWithFavorites(publicQuestions, favorites) {
    const favoriteKeys = new Set(
        favorites
            .map((item) => item.source_question_public_id || item.public_id)
            .filter(Boolean),
    );

    return publicQuestions.map((question) => ({
        ...question,
        is_favorite: favoriteKeys.has(question.source_question_public_id || question.public_id),
    }));
}

async function loadCreateLibraryData() {
    createInitLogger.info('library.load.started', {
        hasProfile: Boolean(window.QuizUserProfile?.getStoredUserProfile?.()?.id),
    });

    try {
        const profile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
        const favoritesPromise = profile?.id
            ? window.QuizQuestionBankApi.fetchFavoriteQuestions({ originScreen: 'create' })
                .catch((error) => {
                    createInitLogger.warn('favorites.load.failed', {
                        message: error?.message || 'unknown_error',
                    });
                    return [];
                })
            : Promise.resolve([]);
        const [categories, publicQuestions, favorites] = await Promise.all([
            window.QuizQuestionBankApi.fetchLibraryCategories(),
            window.QuizQuestionBankApi.fetchLibraryQuestions({
                scope: 'public',
                originScreen: 'create',
            }),
            favoritesPromise,
        ]);

        libraryCategories = categories;
        favoriteQuestions = favorites;
        questionsLibrary = syncLibraryQuestionsWithFavorites(publicQuestions, favorites);

        renderLibraryFilters();
        renderLibraryQuestions();
        if (questionsLibrary.length) {
            changeIdea();
            if (createIdeaIntervalId) {
                clearInterval(createIdeaIntervalId);
            }
            createIdeaIntervalId = setInterval(changeIdea, 4000);
        } else {
            setIdeaPlaceholder('Серверная библиотека пока пустая.');
        }

        createInitLogger.info('library.load.succeeded', {
            publicCount: questionsLibrary.length,
            favoriteCount: favoriteQuestions.length,
            categoryCount: libraryCategories.length,
        });
    } catch (error) {
        createInitLogger.warn('library.load.failed', {
            message: error?.message || 'unknown_error',
        });
        setIdeaPlaceholder('Не удалось загрузить библиотеку вопросов.');
        showToast('Не удалось загрузить библиотеку вопросов.');
    }
}

function hydrateStoredCreateQuestions() {
    quizQuestions = readStoredQuizQuestions();

    if (shouldRepairStoredQuestions(quizQuestions)) {
        const storedSnapshot = readStoredEditorReturnSnapshot();
        const snapshotQuestions = Array.isArray(storedSnapshot?.questions)
            ? storedSnapshot.questions.map(normalizeTemplateQuestion)
            : [];

        if (snapshotQuestions.length && snapshotQuestions.every(isLaunchReadyQuestion)) {
            quizQuestions = snapshotQuestions;
            localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));

            const titleInput = document.getElementById('quiz-title-input');
            if (titleInput && !titleInput.value.trim() && storedSnapshot?.title) {
                titleInput.value = storedSnapshot.title;
            }

            createInitLogger.info('create.draft.repaired_from_snapshot', {
                questionCount: snapshotQuestions.length,
                roomCode: storedSnapshot?.roomCode || null,
            });
        } else {
            createInitLogger.warn('create.draft.repair_skipped', {
                reason: 'missing_valid_snapshot',
                questionCount: quizQuestions.length,
            });
        }
    }

    renderQuestions();
}

function hydrateStoredCreateDraft() {
    const draft = readStoredCreateDraft();
    const typeOptions = document.querySelectorAll('.type-option');
    if (!draft) {
        renderOptionRows(DEFAULT_OPTIONS);
        if (typeOptions.length > 0) {
            selectType('text', typeOptions[0], { preserveSourceQuestion: true });
        }
        currentQuestionSourcePublicId = null;
        return;
    }

    document.getElementById('quiz-title-input').value = draft.title || '';
    document.getElementById('q-input-text').value = draft.questionText || '';
    document.getElementById('q-input-correct').value = draft.correctText || '';
    currentQuestionSourcePublicId = draft.sourceQuestionPublicId || null;

    const type = draft.type === 'options' ? 'options' : 'text';
    selectType(
        type,
        type === 'options' ? typeOptions[1] : typeOptions[0],
        { preserveSourceQuestion: true },
    );

    if (Array.isArray(draft.options) && draft.options.length > 0) {
        renderOptionRows(draft.options.length, draft.options, draft.selectedIndex || 0);
    } else {
        renderOptionRows(DEFAULT_OPTIONS);
    }

    updateClearButtons();
}

function hasLocalCreateConflict() {
    const title = document.getElementById('quiz-title-input')?.value.trim() || '';
    const questionText = document.getElementById('q-input-text')?.value.trim() || '';
    const correctText = document.getElementById('q-input-correct')?.value.trim() || '';
    const options = collectOptionValues();

    return Boolean(
        title ||
        quizQuestions.length ||
        questionText ||
        correctText ||
        options.some((item) => item.trim()),
    );
}

function normalizeTemplateQuestion(question) {
    return {
        text: question?.text || '',
        type: question?.type === 'options' ? 'options' : 'text',
        correct: question?.correct || '',
        options: Array.isArray(question?.options) ? question.options : null,
        source_question_public_id: question?.source_question_public_id || null,
    };
}

function applyTemplateDraft(templateDraft) {
    document.getElementById('quiz-title-input').value = templateDraft?.title || '';
    quizQuestions = Array.isArray(templateDraft?.questions)
        ? templateDraft.questions.map(normalizeTemplateQuestion)
        : [];
    renderQuestions();
    clearForm();
    saveDraftToLocal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearTemplateDraftQueryParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('templatePublicId')) {
        return;
    }
    url.searchParams.delete('templatePublicId');
    window.history.replaceState({}, '', url.toString());
}

async function handleTemplateDraftPrefill() {
    const url = new URL(window.location.href);
    const templatePublicId = url.searchParams.get('templatePublicId');
    if (!templatePublicId || handledTemplateDraftPublicId === templatePublicId) {
        return;
    }

    handledTemplateDraftPublicId = templatePublicId;
    createInitLogger.info('create.prefill.requested', {
        templatePublicId,
    });

    try {
        const templateDraft = await window.QuizQuestionBankApi.fetchTemplateDraft(templatePublicId, {
            originScreen: 'history',
        });

        if (hasLocalCreateConflict()) {
            createInitLogger.warn('create.prefill.conflicted', {
                templatePublicId,
                existingQuestionCount: quizQuestions.length,
            });
            const shouldReplace = window.confirm(
                'У тебя уже есть локальный черновик. Заменить его вопросами из прошлой игры?',
            );
            if (!shouldReplace) {
                clearTemplateDraftQueryParam();
                return;
            }
        }

        applyTemplateDraft(templateDraft);
        createInitLogger.info('create.prefill.applied', {
            templatePublicId,
            questionCount: Array.isArray(templateDraft?.questions) ? templateDraft.questions.length : 0,
        });
    } catch (error) {
        const status = Number(error?.status || 0);
        createInitLogger.warn('create.prefill.failed', {
            templatePublicId,
            message: error?.message || 'unknown_error',
            status,
        });
        if (status === 403) {
            showToast('Повтор этой игры доступен только ведущему.');
            createInitLogger.warn('repeat.denied.local', {
                templatePublicId,
            });
        } else if (error?.message === 'PROFILE_REQUIRED') {
            showToast('Для повтора игры нужен сохраненный профиль.');
        } else {
            showToast('Не удалось загрузить шаблон для повтора.');
        }
    } finally {
        clearTemplateDraftQueryParam();
    }
}

async function saveCurrentDraftToFavorites() {
    const profile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
    if (!profile?.id) {
        showToast('Сначала сохрани профиль, чтобы пользоваться избранным.');
        createInitLogger.warn('favorite.toggle.denied_local', {
            reason: 'missing_profile',
        });
        return;
    }

    const questionPayload = buildCurrentQuestionPayload();
    if (!questionPayload) {
        return;
    }

    try {
        const savedFavorite = await window.QuizQuestionBankApi.addFavoriteQuestion({
            originScreen: 'create',
            sourceQuestionPublicId: questionPayload.source_question_public_id || null,
            question: questionPayload.source_question_public_id ? null : questionPayload,
        });
        upsertFavoriteQuestionLocally(savedFavorite);
        currentQuestionSourcePublicId =
            savedFavorite.source_question_public_id || savedFavorite.public_id || null;
        renderLibraryQuestions();
        saveDraftToLocal();
        showToast('Вопрос добавлен в избранное.');
    } catch (error) {
        createInitLogger.warn('favorite.save_custom.failed', {
            message: error?.message || 'unknown_error',
        });
        showToast('Не удалось сохранить вопрос в избранное.');
    }
}

function shouldInvalidateCurrentSourceFromTarget(target) {
    if (!target) {
        return false;
    }
    if (target.id === 'q-input-text' || target.id === 'q-input-correct') {
        return true;
    }
    if (target.classList?.contains('opt-input')) {
        return true;
    }
    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    hydrateStoredCreateQuestions();
    hydrateStoredCreateDraft();

    document.getElementById('save-favorite-btn')?.addEventListener('click', (event) => {
        event.preventDefault();
        void saveCurrentDraftToFavorites();
    });

    const ideaContainer = document.getElementById('idea-container');
    if (ideaContainer) {
        ideaContainer.onclick = insertIdea;
    }

    const refreshButton = document.getElementById('refresh-idea');
    if (refreshButton) {
        refreshButton.onclick = (event) => {
            event.preventDefault();
            changeIdea();
        };
    }

    document.addEventListener('input', (event) => {
        const target = event.target;
        if (!target) {
            return;
        }

        if (
            ['quiz-title-input', 'q-input-text', 'q-input-correct'].includes(target.id) ||
            target.classList?.contains('opt-input')
        ) {
            if (shouldInvalidateCurrentSourceFromTarget(target)) {
                clearCurrentDraftSourceLink();
            }
            saveDraftToLocal();
        }

        if (
            target.classList?.contains('opt-input') ||
            target.id === 'q-input-correct'
        ) {
            const wrapper = target.closest('.input-with-clear');
            const clearButton = wrapper?.querySelector('.clear-input');
            if (clearButton) {
                clearButton.style.display = target.value ? 'block' : 'none';
            }
        }
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (target?.name === 'correct-opt') {
            clearCurrentDraftSourceLink();
            updateCorrectHighlight();
            saveDraftToLocal();
        }
    });

    await loadCreateLibraryData();
    await handleTemplateDraftPrefill();
    updateCorrectHighlight();
});

document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) {
        event.preventDefault();
    }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
