(function () {
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

        section.style.display = 'block';
        list.innerHTML = `<div class="profile-history-state">${escapeValue(message)}</div>`;
    }

    function renderHistoryEntries(entries) {
        const section = historySection();
        const list = historyList();
        if (!section || !list) return;

        section.style.display = 'block';

        if (!entries.length) {
            renderHistoryState('Пока нет завершённых или отменённых игр. Когда сыграешь, история появится здесь.');
            return;
        }

        list.innerHTML = entries.map((entry) => {
            const statusPills = buildStatusPills(entry)
                .map((pill) => `<span class="profile-history-pill is-${pill.tone}">${escapeValue(pill.label)}</span>`)
                .join('');
            const canOpenResults = Boolean(entry.can_open_results);
            const cardClasses = [
                'profile-history-card',
                canOpenResults ? 'is-clickable' : 'is-disabled',
                entry.is_winner ? 'is-winner' : '',
            ].filter(Boolean).join(' ');

            return `
                <div class="${cardClasses}" ${canOpenResults ? `data-history-room="${escapeValue(entry.quiz_code)}"` : ''}>
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
                    <div class="profile-history-open-label">${canOpenResults ? 'Открыть итоги игры' : 'Итоги недоступны для этой записи'}</div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('[data-history-room]').forEach((card) => {
            card.addEventListener('click', () => {
                const quizCode = card.getAttribute('data-history-room');
                if (quizCode) {
                    openHistoryResults(quizCode);
                }
            });
        });
    }

    function hideHistory() {
        const section = historySection();
        const list = historyList();
        if (!section || !list) return;

        section.style.display = 'none';
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

        try {
            const response = await fetch(`/api/v1/users/${userId}/history`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const entries = await response.json();
            if (requestId !== historyRequestId) {
                return;
            }

            renderHistoryEntries(Array.isArray(entries) ? entries : []);
        } catch (error) {
            if (requestId !== historyRequestId) {
                return;
            }
            renderHistoryState('Не удалось загрузить историю игр. Попробуй открыть профиль ещё раз.');
        }
    }

    function openHistoryResults(quizCode) {
        const normalizedCode = String(quizCode || '').trim().toUpperCase();
        if (!normalizedCode) {
            return;
        }

        window.location.href = `game.html?room=${encodeURIComponent(normalizedCode)}&role=player`;
    }

    window.QuizProfileHistory = {
        openHistoryResults,
        prepareProfileHistory,
        hideHistory,
    };
})();
