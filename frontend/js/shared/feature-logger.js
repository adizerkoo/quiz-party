(function () {
    function normalizePayload(payload) {
        return payload && typeof payload === 'object' ? payload : {};
    }

    function write(level, scope, eventName, payload) {
        const logger = console[level] || console.log;
        logger(`[${scope}] ${eventName}`, normalizePayload(payload));
    }

    function createLogger(scope) {
        const normalizedScope = String(scope || 'web.feature');

        return {
            info(eventName, payload) {
                write('info', normalizedScope, eventName, payload);
            },
            warn(eventName, payload) {
                write('warn', normalizedScope, eventName, payload);
            },
            error(eventName, payload) {
                write('error', normalizedScope, eventName, payload);
            },
        };
    }

    window.QuizFeatureLogger = {
        createLogger,
    };
})();
