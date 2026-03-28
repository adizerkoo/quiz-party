(function () {
    const logger = window.QuizFeatureLogger?.createLogger?.('web.question_bank.api')
        || console;

    function buildQuery(params) {
        const searchParams = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') {
                return;
            }
            searchParams.set(key, String(value));
        });
        const query = searchParams.toString();
        return query ? `?${query}` : '';
    }

    function getCurrentIdentity() {
        const profile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
        return {
            profile,
            userId: profile?.id ?? null,
            installationPublicId: profile?.installation_public_id || null,
        };
    }

    function requireCurrentIdentity() {
        const identity = getCurrentIdentity();
        if (!identity.userId) {
            throw new Error('PROFILE_REQUIRED');
        }
        return identity;
    }

    function normalizeQuestion(payload) {
        return {
            public_id: payload?.public_id || null,
            text: payload?.text || '',
            type: payload?.type === 'options' ? 'options' : 'text',
            correct: payload?.correct || '',
            options: Array.isArray(payload?.options) ? payload.options : null,
            source_question_public_id:
                payload?.source_question_public_id ||
                payload?.public_id ||
                null,
            source: payload?.source || 'system',
            visibility: payload?.visibility || 'public',
            category_slug: payload?.category_slug || null,
            category_title: payload?.category_title || null,
            is_favorite: Boolean(payload?.is_favorite),
            created_at: payload?.created_at || null,
            updated_at: payload?.updated_at || null,
        };
    }

    async function requestJson(url, options, meta) {
        const response = await fetch(url, options);
        if (!response.ok) {
            logger.warn('request.failed', {
                ...(meta || {}),
                status: response.status,
                url,
            });
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    async function fetchLibraryCategories() {
        logger.info('library.categories.load.started', {});
        const payload = await requestJson('/api/v1/library/categories', undefined, {
            action: 'fetchLibraryCategories',
        });
        const categories = Array.isArray(payload)
            ? payload.map((category) => ({
                public_id: category.public_id || null,
                slug: category.slug || '',
                title: category.title || '',
                sort_order: Number(category.sort_order || 0),
                is_active: category.is_active !== false,
            }))
            : [];
        logger.info('library.categories.load.succeeded', {
            resultCount: categories.length,
        });
        return categories;
    }

    async function fetchLibraryQuestions(params = {}) {
        const identity = getCurrentIdentity();
        const query = buildQuery({
            scope: params.scope || 'public',
            category: params.category || null,
            search: params.search || null,
            user_id: identity.userId,
            installation_public_id: identity.installationPublicId,
            origin_screen: params.originScreen || 'create',
        });
        logger.info('library.load.started', {
            scope: params.scope || 'public',
            category: params.category || null,
            originScreen: params.originScreen || 'create',
        });
        const payload = await requestJson(`/api/v1/library/questions${query}`, undefined, {
            action: 'fetchLibraryQuestions',
            scope: params.scope || 'public',
        });
        const questions = Array.isArray(payload) ? payload.map(normalizeQuestion) : [];
        logger.info('library.load.succeeded', {
            scope: params.scope || 'public',
            resultCount: questions.length,
        });
        return questions;
    }

    async function fetchFavoriteQuestions(params = {}) {
        const identity = requireCurrentIdentity();
        const query = buildQuery({
            user_id: identity.userId,
            installation_public_id: identity.installationPublicId,
            category: params.category || null,
            search: params.search || null,
            origin_screen: params.originScreen || 'profile',
        });
        logger.info('favorites.load.started', {
            originScreen: params.originScreen || 'profile',
        });
        const payload = await requestJson(`/api/v1/me/favorites/questions${query}`, undefined, {
            action: 'fetchFavoriteQuestions',
        });
        const questions = Array.isArray(payload) ? payload.map(normalizeQuestion) : [];
        logger.info('favorites.load.succeeded', {
            resultCount: questions.length,
        });
        return questions;
    }

    function buildFavoriteRequestBody(params = {}) {
        const identity = requireCurrentIdentity();
        return {
            user_id: identity.userId,
            installation_public_id: identity.installationPublicId,
            origin_screen: params.originScreen || 'create',
            source_question_public_id: params.sourceQuestionPublicId || null,
            question: params.question || null,
        };
    }

    async function addFavoriteQuestion(params = {}) {
        const body = buildFavoriteRequestBody(params);
        logger.info('favorite.toggle.started', {
            mode: body.source_question_public_id ? 'existing' : 'custom',
            originScreen: body.origin_screen,
        });
        const payload = await requestJson('/api/v1/me/favorites/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, {
            action: 'addFavoriteQuestion',
            mode: body.source_question_public_id ? 'existing' : 'custom',
        });
        const question = normalizeQuestion(payload);
        logger.info('favorite.toggle.succeeded', {
            mode: body.source_question_public_id ? 'existing' : 'custom',
            questionPublicId: question.public_id,
        });
        return question;
    }

    async function removeFavoriteQuestion(questionPublicId, params = {}) {
        const identity = requireCurrentIdentity();
        const query = buildQuery({
            user_id: identity.userId,
            installation_public_id: identity.installationPublicId,
            origin_screen: params.originScreen || 'create',
        });
        logger.info('favorite.toggle.started', {
            mode: 'remove',
            questionPublicId,
            originScreen: params.originScreen || 'create',
        });
        const response = await fetch(
            `/api/v1/me/favorites/questions/${encodeURIComponent(questionPublicId)}${query}`,
            { method: 'DELETE' },
        );
        if (!response.ok) {
            logger.warn('favorite.toggle.failed', {
                mode: 'remove',
                questionPublicId,
                status: response.status,
            });
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        logger.info('favorite.toggle.succeeded', {
            mode: 'remove',
            questionPublicId,
        });
    }

    async function fetchTemplateDraft(templatePublicId, params = {}) {
        const identity = requireCurrentIdentity();
        const query = buildQuery({
            user_id: identity.userId,
            installation_public_id: identity.installationPublicId,
            origin_screen: params.originScreen || 'history',
        });
        logger.info('template.draft.load.started', {
            templatePublicId,
            originScreen: params.originScreen || 'history',
        });
        const payload = await requestJson(
            `/api/v1/templates/${encodeURIComponent(templatePublicId)}/draft${query}`,
            undefined,
            {
                action: 'fetchTemplateDraft',
                templatePublicId,
            },
        );
        logger.info('template.draft.load.succeeded', {
            templatePublicId,
            questionCount: Array.isArray(payload?.questions) ? payload.questions.length : 0,
        });
        return payload;
    }

    window.QuizQuestionBankApi = {
        fetchLibraryCategories,
        fetchLibraryQuestions,
        fetchFavoriteQuestions,
        addFavoriteQuestion,
        removeFavoriteQuestion,
        fetchTemplateDraft,
        getCurrentIdentity,
        requireCurrentIdentity,
        normalizeQuestion,
    };
})();
