(function () {
    const logger = window.QuizFeatureLogger?.createLogger?.('web.menu.favorites') || console;
    let favoritesRequestId = 0;
    let favoriteEntries = [];

    function favoritesSection() {
        return document.getElementById('profile-favorites-section');
    }

    function favoritesList() {
        return document.getElementById('profile-favorites-list');
    }

    function favoritesStatus() {
        return document.getElementById('profile-favorites-status');
    }

    function favoriteCompose() {
        return document.getElementById('profile-favorite-compose');
    }

    function favoriteQuestionInput() {
        return document.getElementById('profile-favorite-question');
    }

    function favoriteTypeInput() {
        return document.getElementById('profile-favorite-type');
    }

    function favoriteCorrectInput() {
        return document.getElementById('profile-favorite-correct');
    }

    function favoriteCorrectZone() {
        return document.getElementById('profile-favorite-correct-zone');
    }

    function favoriteOptionsZone() {
        return document.getElementById('profile-favorite-options-zone');
    }

    function favoriteOptionsList() {
        return document.getElementById('profile-favorite-options-list');
    }

    function escapeValue(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setFavoritesStatus(message, tone = 'neutral') {
        const element = favoritesStatus();
        if (!element) return;

        if (!message) {
            element.hidden = true;
            element.textContent = '';
            element.className = 'profile-favorites-status';
            return;
        }

        element.hidden = false;
        element.textContent = message;
        element.className = `profile-favorites-status is-${tone}`;
    }

    function readStoredQuizQuestions() {
        try {
            const raw = localStorage.getItem('quizQuestions');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            logger.warn('favorite.reuse_to_create.storage_failed', {
                message: error?.message || 'unknown_error',
            });
            return [];
        }
    }

    function readStoredCreateDraft() {
        try {
            const raw = localStorage.getItem('quizDraft');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            logger.warn('favorite.reuse_to_create.storage_failed', {
                message: error?.message || 'unknown_error',
            });
            return null;
        }
    }

    function ensureCreateDraftShape(draft) {
        return {
            title: draft?.title || '',
            questionText: draft?.questionText || '',
            type: draft?.type || 'text',
            correctText: draft?.correctText || '',
            options: Array.isArray(draft?.options) && draft.options.length ? draft.options : ['', '', '', ''],
            selectedIndex: Number.isInteger(draft?.selectedIndex) ? draft.selectedIndex : 0,
            sourceQuestionPublicId: draft?.sourceQuestionPublicId || null,
        };
    }

    function renderFavoriteEntries(entries) {
        const list = favoritesList();
        if (!list) return;

        if (!entries.length) {
            list.innerHTML = '<div class="profile-history-state">Пока здесь пусто. Добавь первый любимый вопрос.</div>';
            return;
        }

        list.innerHTML = entries.map((entry) => `
            <div class="profile-history-card is-favorite">
                <div class="profile-history-card-head">
                    <div>
                        <div class="profile-history-card-date">${escapeValue(entry.category_title || (entry.source === 'system' ? 'Системная библиотека' : 'Пользовательский вопрос'))}</div>
                        <div class="profile-history-card-title">${escapeValue(entry.text)}</div>
                    </div>
                    <div class="profile-history-pill is-${entry.visibility === 'private' ? 'left' : 'finished'}">
                        ${escapeValue(entry.visibility === 'private' ? 'Private' : 'Public')}
                    </div>
                </div>

                <div class="profile-favorite-answer">
                    Ответ: <strong>${escapeValue(entry.correct)}</strong>
                </div>

                <div class="profile-history-actions">
                    <button type="button" class="profile-history-action is-repeat" data-favorite-reuse="${escapeValue(entry.public_id)}">
                        В create
                    </button>
                    <button type="button" class="profile-history-action" data-favorite-remove="${escapeValue(entry.public_id)}">
                        Убрать
                    </button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('[data-favorite-reuse]').forEach((button) => {
            button.addEventListener('click', () => {
                const publicId = button.getAttribute('data-favorite-reuse');
                const entry = favoriteEntries.find((item) => item.public_id === publicId);
                if (entry) {
                    reuseFavoriteQuestion(entry);
                }
            });
        });

        list.querySelectorAll('[data-favorite-remove]').forEach((button) => {
            button.addEventListener('click', () => {
                const publicId = button.getAttribute('data-favorite-remove');
                if (publicId) {
                    void removeFavoriteQuestion(publicId);
                }
            });
        });
    }

    function getComposerOptionCount() {
        return favoriteOptionsList()?.querySelectorAll('.profile-favorite-option-row').length || 0;
    }

    function collectComposerOptionValues() {
        return Array.from(
            favoriteOptionsList()?.querySelectorAll('.profile-favorite-option-input') || [],
        ).map((input) => input.value);
    }

    function getComposerSelectedCorrectIndex() {
        const radio = favoriteOptionsList()?.querySelector('input[name="profile-favorite-correct-option"]:checked');
        return radio ? parseInt(radio.value, 10) : 0;
    }

    function renderComposerOptionRows(count, values = [], correctIndex = 0) {
        const list = favoriteOptionsList();
        if (!list) return;

        const safeCount = Math.max(2, Math.min(6, count || 4));
        list.innerHTML = '';

        for (let index = 0; index < safeCount; index += 1) {
            const row = document.createElement('div');
            row.className = 'profile-favorite-option-row';

            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 200;
            input.className = 'profile-favorite-option-input';
            input.placeholder = `Вариант ${index + 1}`;
            input.value = values[index] ?? '';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'profile-favorite-correct-option';
            radio.value = String(index);
            if (index === correctIndex) {
                radio.checked = true;
            }

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'profile-inline-action';
            removeButton.textContent = '−';
            removeButton.disabled = safeCount <= 2;
            removeButton.addEventListener('click', () => removeOptionRow(index));

            row.appendChild(input);
            row.appendChild(radio);
            row.appendChild(removeButton);
            list.appendChild(row);
        }
    }

    function addOptionRow() {
        const count = getComposerOptionCount();
        if (count >= 6) return;
        renderComposerOptionRows(count + 1, collectComposerOptionValues(), getComposerSelectedCorrectIndex());
    }

    function removeOptionRow(index) {
        const values = collectComposerOptionValues();
        if (values.length <= 2) return;
        let correctIndex = getComposerSelectedCorrectIndex();
        values.splice(index, 1);
        if (index === correctIndex) {
            correctIndex = 0;
        } else if (index < correctIndex) {
            correctIndex -= 1;
        }
        renderComposerOptionRows(values.length, values, correctIndex);
    }

    function updateComposerType(type) {
        const normalizedType = type === 'options' ? 'options' : 'text';
        const typeInput = favoriteTypeInput();
        if (typeInput) {
            typeInput.value = normalizedType;
        }

        favoriteCorrectZone().hidden = normalizedType !== 'text';
        favoriteOptionsZone().hidden = normalizedType !== 'options';

        document.querySelectorAll('.profile-favorite-type-button').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.favoriteType === normalizedType);
        });

        if (normalizedType === 'options' && getComposerOptionCount() === 0) {
            renderComposerOptionRows(4);
        }
    }

    function resetComposer() {
        favoriteQuestionInput().value = '';
        favoriteCorrectInput().value = '';
        updateComposerType('text');
        renderComposerOptionRows(4);
    }

    function toggleComposer(forceVisible) {
        const compose = favoriteCompose();
        if (!compose) return;

        const nextVisible = typeof forceVisible === 'boolean' ? forceVisible : compose.hidden;
        compose.hidden = !nextVisible;
        if (nextVisible) {
            favoriteQuestionInput()?.focus();
        }
    }

    function buildComposerPayload() {
        const text = favoriteQuestionInput()?.value.trim() || '';
        const type = favoriteTypeInput()?.value === 'options' ? 'options' : 'text';
        if (!text) {
            setFavoritesStatus('Введите текст вопроса.', 'error');
            return null;
        }

        if (type === 'text') {
            const correct = favoriteCorrectInput()?.value.trim() || '';
            if (!correct) {
                setFavoritesStatus('Введите правильный ответ.', 'error');
                return null;
            }
            return {
                text,
                type,
                correct,
                options: null,
                source_question_public_id: null,
            };
        }

        const options = collectComposerOptionValues().map((item) => item.trim());
        const emptyIndex = options.findIndex((item) => !item);
        if (emptyIndex >= 0) {
            setFavoritesStatus(`Заполните вариант ${emptyIndex + 1}.`, 'error');
            return null;
        }

        const selectedCorrectIndex = getComposerSelectedCorrectIndex();
        return {
            text,
            type,
            correct: options[selectedCorrectIndex] || '',
            options,
            source_question_public_id: null,
        };
    }

    async function submitFavoriteQuestion() {
        const payload = buildComposerPayload();
        if (!payload) {
            return;
        }

        try {
            const favorite = await window.QuizQuestionBankApi.addFavoriteQuestion({
                originScreen: 'profile',
                question: payload,
            });
            favoriteEntries = [
                favorite,
                ...favoriteEntries.filter((item) => item.public_id !== favorite.public_id),
            ];
            logger.info('favorite.add.succeeded', {
                mode: 'custom',
                questionPublicId: favorite.public_id,
            });
            renderFavoriteEntries(favoriteEntries);
            setFavoritesStatus('Вопрос сохранён в избранное.', 'success');
            resetComposer();
            toggleComposer(false);
        } catch (error) {
            logger.warn('favorite.add.failed', {
                mode: 'custom',
                message: error?.message || 'unknown_error',
            });
            setFavoritesStatus('Не удалось сохранить вопрос в избранное.', 'error');
        }
    }

    function reuseFavoriteQuestion(entry) {
        const storedQuestions = readStoredQuizQuestions();
        const storedDraft = ensureCreateDraftShape(readStoredCreateDraft());
        const sourceQuestionPublicId = entry.source_question_public_id || entry.public_id || null;

        const alreadyAdded = storedQuestions.some((question) => (
            sourceQuestionPublicId &&
            question?.source_question_public_id &&
            question.source_question_public_id === sourceQuestionPublicId
        ));

        const nextQuestions = alreadyAdded
            ? storedQuestions
            : [
                ...storedQuestions,
                {
                    text: entry.text,
                    type: entry.type,
                    correct: entry.correct,
                    options: Array.isArray(entry.options) ? entry.options : null,
                    source_question_public_id: sourceQuestionPublicId,
                },
            ];

        localStorage.setItem('quizQuestions', JSON.stringify(nextQuestions));
        localStorage.setItem('quizDraft', JSON.stringify(storedDraft));
        logger.info('favorite.reuse_to_create', {
            questionPublicId: entry.public_id || null,
            appended: !alreadyAdded,
        });
        window.location.href = 'create.html';
    }

    async function removeFavoriteQuestion(questionPublicId) {
        const entry = favoriteEntries.find((item) => item.public_id === questionPublicId);
        if (!entry) {
            return;
        }

        const shouldRemove = window.confirm('Убрать этот вопрос из избранного?');
        if (!shouldRemove) {
            return;
        }

        try {
            await window.QuizQuestionBankApi.removeFavoriteQuestion(questionPublicId, {
                originScreen: 'profile',
            });
            favoriteEntries = favoriteEntries.filter((item) => item.public_id !== questionPublicId);
            renderFavoriteEntries(favoriteEntries);
            setFavoritesStatus('Вопрос удалён из избранного.', 'success');
            logger.info('favorite.remove.succeeded', {
                questionPublicId,
            });
        } catch (error) {
            logger.warn('favorite.remove.failed', {
                questionPublicId,
                message: error?.message || 'unknown_error',
            });
            setFavoritesStatus('Не удалось удалить вопрос из избранного.', 'error');
        }
    }

    function hideFavorites() {
        const section = favoritesSection();
        const list = favoritesList();
        if (section) {
            section.hidden = true;
        }
        if (list) {
            list.innerHTML = '';
        }
        setFavoritesStatus('');
        toggleComposer(false);
    }

    async function prepareProfileFavorites(options = {}) {
        const profile = options.profile || window.QuizUserProfile?.getStoredUserProfile?.() || null;
        const mode = options.mode || 'edit';
        const userId = profile?.id;

        if (mode !== 'edit' || !userId) {
            hideFavorites();
            return;
        }

        const requestId = ++favoritesRequestId;
        const section = favoritesSection();
        if (section) {
            section.hidden = false;
        }
        setFavoritesStatus('Загружаем избранные вопросы...', 'neutral');
        logger.info('favorites.load.started', {
            userId,
        });

        try {
            const entries = await window.QuizQuestionBankApi.fetchFavoriteQuestions({
                originScreen: 'profile',
            });
            if (requestId !== favoritesRequestId) {
                return;
            }
            favoriteEntries = Array.isArray(entries) ? entries : [];
            setFavoritesStatus('');
            renderFavoriteEntries(favoriteEntries);
            logger.info('favorites.load.succeeded', {
                userId,
                resultCount: favoriteEntries.length,
            });
        } catch (error) {
            if (requestId !== favoritesRequestId) {
                return;
            }
            favoriteEntries = [];
            logger.warn('favorites.load.failed', {
                userId,
                message: error?.message || 'unknown_error',
            });
            setFavoritesStatus('Не удалось загрузить избранные вопросы. Попробуй ещё раз.', 'error');
            if (favoritesList()) {
                favoritesList().innerHTML = '';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('profile-favorite-compose-open')?.addEventListener('click', () => {
            setFavoritesStatus('');
            toggleComposer(true);
        });

        document.getElementById('profile-favorite-compose-close')?.addEventListener('click', () => {
            toggleComposer(false);
        });

        document.getElementById('profile-favorite-add-option')?.addEventListener('click', () => {
            addOptionRow();
        });

        document.getElementById('profile-favorite-submit')?.addEventListener('click', () => {
            void submitFavoriteQuestion();
        });

        document.querySelectorAll('.profile-favorite-type-button').forEach((button) => {
            button.addEventListener('click', () => {
                updateComposerType(button.dataset.favoriteType);
            });
        });

        resetComposer();
    });

    window.QuizProfileFavorites = {
        prepareProfileFavorites,
        hideFavorites,
        toggleComposer,
        addOptionRow,
    };
})();
