/* =========================================
   ЗАПУСК ВЕЧЕРИНКИ
   Валидация, сохранение шаблона на backend и переход
   в host-runtime без поломки существующего сценария.
========================================= */

const createLaunchLogger = window.QuizFeatureLogger?.createLogger?.('web.create.launch')
    || console;

async function saveAndGo() {
    const titleInput = document.getElementById('quiz-title-input');
    const title = titleInput?.value.trim() || '';

    if (!title) {
        showToast('Введи название вечеринки!');
        titleInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        titleInput?.focus();
        return;
    }

    if (quizQuestions.length === 0) {
        showToast('Добавьте хотя бы один вопрос!');
        const questionInput = document.getElementById('q-input-text');
        questionInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        questionInput?.focus();
        return;
    }

    for (let index = 0; index < quizQuestions.length; index += 1) {
        const question = quizQuestions[index];
        if (!question?.text?.trim()) {
            showToast(`Вопрос №${index + 1} не заполнен!`);
            renderQuestions();
            document.querySelectorAll('.question-row')[index]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            document.getElementById('q-input-text')?.focus();
            return;
        }

        if (question.type === 'text' && !question?.correct?.trim()) {
            showToast(`Вопрос №${index + 1}: укажите правильный ответ!`);
            renderQuestions();
            document.querySelectorAll('.question-row')[index]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            document.getElementById('q-input-correct')?.focus();
            return;
        }

        if (question.type === 'options') {
            if (!Array.isArray(question.options) || question.options.some((item) => !item?.trim())) {
                showToast(`Вопрос №${index + 1}: заполните все варианты ответа!`);
                renderQuestions();
                document.querySelectorAll('.question-row')[index]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
                return;
            }
            if (!question.correct || !question.options.includes(question.correct)) {
                showToast(`Вопрос №${index + 1}: выберите правильный вариант!`);
                renderQuestions();
                document.querySelectorAll('.question-row')[index]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
                return;
            }
        }
    }

    createLaunchLogger.info('quiz.create.started', {
        questionCount: quizQuestions.length,
        linkedSourceCount: quizQuestions.filter((item) => item.source_question_public_id).length,
    });

    try {
        let currentProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
        const deviceInfo = window.QuizUserProfile?.detectClientDeviceInfo?.() || {};
        const installationPublicId =
            currentProfile?.installation_public_id ||
            window.QuizUserProfile?.getOrCreateInstallationPublicId?.() ||
            null;
        let ownerId = currentProfile?.id ?? null;

        if (ownerId && window.QuizUserProfile) {
            try {
                const touchResponse = await window.QuizUserProfile.fetchWithStoredProfileAuth(
                    `/api/v1/users/${ownerId}/touch`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            device_platform: deviceInfo.device_platform || null,
                            device_brand: deviceInfo.device_brand || null,
                            installation_public_id: installationPublicId,
                        }),
                    },
                    {
                        required: true,
                        profile: currentProfile,
                    },
                );

                if (touchResponse.ok) {
                    const syncedProfile = await touchResponse.json();
                    window.QuizUserProfile.saveStoredUserProfile(syncedProfile);
                    currentProfile = window.QuizUserProfile.getStoredUserProfile();
                    ownerId = syncedProfile.id;
                } else {
                    ownerId = null;
                }
            } catch (syncError) {
                ownerId = null;
            }
        }

        const requestHeaders = new Headers({ 'Content-Type': 'application/json' });
        if (ownerId && currentProfile && window.QuizUserProfile?.buildAuthHeaders) {
            const authHeaders = window.QuizUserProfile.buildAuthHeaders({ profile: currentProfile });
            authHeaders.forEach((value, key) => requestHeaders.set(key, value));
        }
        const response = await fetch('/api/v1/quizzes', {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({
                title,
                questions: quizQuestions,
                owner_id: ownerId,
            }),
        });

        if (!response.ok) {
            createLaunchLogger.warn('quiz.create.failed', {
                status: response.status,
            });
            showToast('Сервер не принял данные');
            return;
        }

        const data = await response.json();
        const roomCode = data.code;
        window.QuizUserProfile?.saveStoredSessionCredentials?.({
            roomCode,
            role: 'host',
            host_token: data.host_token || null,
            installation_public_id: installationPublicId,
        });
        localStorage.removeItem('quizQuestions');
        localStorage.removeItem('quizTitle');
        localStorage.removeItem('quizDraft');
        createLaunchLogger.info('quiz.create.succeeded', {
            roomCode,
            templatePublicId: data.template_public_id || null,
        });
        window.location.href = `game.html?role=host&room=${roomCode}`;
    } catch (error) {
        createLaunchLogger.warn('quiz.create.failed', {
            message: error?.message || 'unknown_error',
        });
        showToast('Backend не запущен! Проверь Python.');
    }
}
