(function () {
    const logger = window.QuizFeatureLogger?.createLogger?.('web.menu.history') || console;
    const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    let historyRequestId = 0;

    function historySection() {
        return document.getElementById('profile-history-section');
    }

    function historyList() {
        return document.getElementById('profile-history-list');
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

    function normalizeDate(value) {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatHistoryDate(entry) {
        const value = normalizeDate(entry.finished_at) || normalizeDate(entry.started_at);
        return value ? dateFormatter.format(value) : 'Дата неизвестна';
    }

    function buildStatusPills(entry) {
        const pills = [];

        if (entry.game_status === 'cancelled') {
            pills.push({ label: 'Игра отменена', tone: 'cancelled' });
        } else if (entry.game_status === 'finished') {
            pills.push({ label: 'Игра завершена', tone: 'finished' });
        }

        if (entry.participant_status === 'left') {
            pills.push({ label: 'Вышел сам', tone: 'left' });
        } else if (entry.participant_status === 'kicked') {
            pills.push({ label: 'Исключён', tone: 'kicked' });
        }

        if (entry.is_winner) {
            pills.push({ label: 'Победа', tone: 'winner' });
        }

        if (entry.is_host_game) {
            pills.push({ label: 'Хост', tone: 'finished' });
        }

        return pills;
    }

    function formatRank(entry) {
        return typeof entry.final_rank === 'number' ? `#${entry.final_rank}` : '—';
    }

    function formatScore(entry) {
        return typeof entry.score === 'number' ? String(entry.score) : '—';
    }

    function buildWinnersLine(entry) {
        if (!Array.isArray(entry.winner_names) || entry.winner_names.length === 0) {
            return 'Победитель не определён';
        }

        const label = entry.winner_names.length > 1 ? 'Победители' : 'Победитель';
        return `${label}: ${entry.winner_names.join(', ')}`;
    }

    function renderHistoryState(message) {
        const section = historySection();
        const list = historyList();
        if (!section || !list) return;

        section.hidden = false;
        list.innerHTML = `<div class="profile-history-state">${escapeValue(message)}</div>`;
    }

    function openHistoryResults(quizCode) {
        const normalizedCode = String(quizCode || '').trim().toUpperCase();
        if (!normalizedCode) {
            return;
        }

        window.location.href = `game.html?room=${encodeURIComponent(normalizedCode)}&role=player`;
    }

    function repeatHistoryTemplate(templatePublicId, quizCode) {
        const normalizedTemplateId = String(templatePublicId || '').trim();
        if (!normalizedTemplateId) {
            return;
        }
        logger.info('repeat.from_history.tapped', {
            quizCode: quizCode || null,
            templatePublicId: normalizedTemplateId,
        });
        window.location.href = `create.html?templatePublicId=${encodeURIComponent(normalizedTemplateId)}`;
    }

    function attachHistoryActions(list) {
        list.querySelectorAll('[data-history-room]').forEach((button) => {
            button.addEventListener('click', () => {
                openHistoryResults(button.getAttribute('data-history-room'));
            });
        });

        list.querySelectorAll('[data-history-repeat]').forEach((button) => {
            button.addEventListener('click', () => {
                repeatHistoryTemplate(
                    button.getAttribute('data-history-repeat'),
                    button.getAttribute('data-history-quiz'),
                );
            });
        });
    }

    function renderHistoryEntries(entries) {
        const section = historySection();
        const list = historyList();
        if (!section || !list) return;

        section.hidden = false;

        if (!entries.length) {
            renderHistoryState('Пока нет завершённых или отменённых игр. Когда сыграешь, история появится здесь.');
            return;
        }

        list.innerHTML = entries.map((entry) => {
            const statusPills = buildStatusPills(entry)
                .map((pill) => `<span class="profile-history-pill is-${pill.tone}">${escapeValue(pill.label)}</span>`)
                .join('');
            const canOpenResults = Boolean(entry.can_open_results);
            const canRepeat = Boolean(entry.can_repeat && entry.template_public_id);
            const cardClasses = [
                'profile-history-card',
                entry.is_winner ? 'is-winner' : '',
            ].filter(Boolean).join(' ');

            return `
                <div class="${cardClasses}">
                    <div class="profile-history-card-head">
                        <div>
                            <div class="profile-history-card-date">${escapeValue(formatHistoryDate(entry))}</div>
                            <div class="profile-history-card-title">${escapeValue(entry.title)}</div>
                        </div>
                        ${entry.is_winner ? '<div class="profile-history-winner-badge">Победа</div>' : ''}
                    </div>

                    <div class="profile-history-pills">${statusPills}</div>

                    <div class="profile-history-grid">
                        <div class="profile-history-stat">
                            <div class="profile-history-stat-label">Мой ранг</div>
                            <div class="profile-history-stat-value">${escapeValue(formatRank(entry))}</div>
                        </div>
                        <div class="profile-history-stat">
                            <div class="profile-history-stat-label">Мой счёт</div>
                            <div class="profile-history-stat-value">${escapeValue(formatScore(entry))}</div>
                        </div>
                        <div class="profile-history-stat">
                            <div class="profile-history-stat-label">Код игры</div>
                            <div class="profile-history-stat-value">${escapeValue(entry.quiz_code)}</div>
                        </div>
                    </div>

                    <div class="profile-history-winners"><strong>${escapeValue(buildWinnersLine(entry))}</strong></div>

                    <div class="profile-history-actions">
                        <button
                            type="button"
                            class="profile-history-action ${canOpenResults ? '' : 'is-disabled'}"
                            ${canOpenResults ? `data-history-room="${escapeValue(entry.quiz_code)}"` : 'disabled'}
                        >
                            Итоги
                        </button>
                        ${canRepeat
                            ? `
                                <button
                                    type="button"
                                    class="profile-history-action is-repeat"
                                    data-history-repeat="${escapeValue(entry.template_public_id)}"
                                    data-history-quiz="${escapeValue(entry.quiz_code)}"
                                >
                                    Повторить
                                </button>
                            `
                            : ''}
                    </div>
                </div>
            `;
        }).join('');

        attachHistoryActions(list);
    }

    function hideHistory() {
        const section = historySection();
        const list = historyList();
        if (!section || !list) return;

        section.hidden = true;
        list.innerHTML = '';
    }

    async function prepareProfileHistory(options = {}) {
        const profile = options.profile || window.QuizUserProfile?.getStoredUserProfile?.() || null;
        const mode = options.mode || 'edit';
        const userId = profile?.id;

        if (mode !== 'edit' || !userId) {
            hideHistory();
            return;
        }

        const requestId = ++historyRequestId;
        renderHistoryState('Загружаем историю игр...');
        logger.info('history.load.started', { userId });

        try {
            const response = await window.QuizUserProfile.fetchWithStoredProfileAuth(
                `/api/v1/users/${userId}/history`,
                undefined,
                {
                    required: true,
                    profile,
                },
            );
            if (!response.ok) {
                logger.warn('history.load.failed', {
                    userId,
                    status: response.status,
                });
                throw new Error(`HTTP ${response.status}`);
            }

            const entries = await response.json();
            if (requestId !== historyRequestId) {
                return;
            }

            const normalizedEntries = Array.isArray(entries) ? entries : [];
            logger.info('history.load.succeeded', {
                userId,
                resultCount: normalizedEntries.length,
            });
            renderHistoryEntries(normalizedEntries);
        } catch (error) {
            if (requestId !== historyRequestId) {
                return;
            }
            logger.warn('history.load.failed', {
                userId,
                message: error?.message || 'unknown_error',
            });
            renderHistoryState('Не удалось загрузить историю игр. Попробуй открыть профиль ещё раз.');
        }
    }

    window.QuizProfileHistory = {
        openHistoryResults,
        prepareProfileHistory,
        hideHistory,
    };
})();
