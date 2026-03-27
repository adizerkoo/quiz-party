(function () {
    const STORAGE_KEY = 'quiz_user_profile_v1';
    const INSTALLATION_KEY = 'quiz_installation_public_id_v1';
    const SESSION_CREDENTIALS_KEY = 'quiz_session_credentials_v1';
    const FALLBACK_AVATARS = ['рџђ¶', 'рџђ±', 'рџђ­', 'рџђ№', 'рџђ°', 'рџ¦Љ', 'рџђ»', 'рџђј', 'рџђЁ', 'рџђЇ', 'рџ¦Ѓ', 'рџђ®', 'рџђ·', 'рџђё', 'рџђµ'];

    function _generatePublicId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
        return template.replace(/[xy]/g, (char) => {
            const random = Math.random() * 16 | 0;
            const value = char === 'x' ? random : (random & 0x3 | 0x8);
            return value.toString(16);
        });
    }

    function _normalizeRoomCode(roomCode) {
        return String(roomCode || '').trim().toUpperCase();
    }

    function _isValidProfile(profile) {
        return Boolean(
            profile &&
            typeof profile.id === 'number' &&
            typeof profile.username === 'string' &&
            profile.username.trim() &&
            typeof profile.avatar_emoji === 'string'
        );
    }

    function getOrCreateInstallationPublicId() {
        try {
            const existing = localStorage.getItem(INSTALLATION_KEY);
            if (existing) return existing;

            const generated = _generatePublicId();
            localStorage.setItem(INSTALLATION_KEY, generated);
            return generated;
        } catch (error) {
            console.warn('Failed to access installation storage', error);
            return _generatePublicId();
        }
    }

    function getStoredUserProfile() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!_isValidProfile(parsed)) return null;

            if (!parsed.installation_public_id) {
                parsed.installation_public_id = getOrCreateInstallationPublicId();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            }

            return parsed;
        } catch (error) {
            console.warn('Failed to read stored user profile', error);
            return null;
        }
    }

    function saveStoredUserProfile(profile) {
        if (!_isValidProfile(profile)) return;

        const normalized = {
            id: profile.id,
            public_id: profile.public_id || null,
            username: String(profile.username).trim(),
            avatar_emoji: profile.avatar_emoji,
            device_platform: profile.device_platform || null,
            device_brand: profile.device_brand || null,
            installation_public_id: profile.installation_public_id || getOrCreateInstallationPublicId(),
            created_at: profile.created_at || null,
            last_login_at: profile.last_login_at || null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }

    function clearStoredUserProfile() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function mergeStoredUserProfileIdentity(patch = {}) {
        const storedProfile = getStoredUserProfile();
        if (!storedProfile) return null;

        const nextProfile = {
            ...storedProfile,
            public_id: patch.public_id || storedProfile.public_id || null,
            installation_public_id:
                patch.installation_public_id ||
                storedProfile.installation_public_id ||
                getOrCreateInstallationPublicId(),
        };

        saveStoredUserProfile(nextProfile);
        return nextProfile;
    }

    function _readSessionCredentialsStore() {
        try {
            const raw = localStorage.getItem(SESSION_CREDENTIALS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('Failed to read stored session credentials', error);
            return {};
        }
    }

    function _writeSessionCredentialsStore(store) {
        try {
            localStorage.setItem(SESSION_CREDENTIALS_KEY, JSON.stringify(store));
        } catch (error) {
            console.warn('Failed to persist session credentials', error);
        }
    }

    function _buildSessionCredentialKey(params = {}) {
        const roomCode = _normalizeRoomCode(params.roomCode);
        const role = params.role === 'host' ? 'host' : 'player';
        const profile = params.profile || getStoredUserProfile();
        const installationPublicId =
            params.installation_public_id ||
            params.installationPublicId ||
            profile?.installation_public_id ||
            getOrCreateInstallationPublicId();
        const identity = profile?.public_id || profile?.id || installationPublicId || 'anonymous';

        if (!roomCode) return null;
        return `${roomCode}:${role}:${identity}`;
    }

    function getStoredSessionCredentials(params = {}) {
        const roomCode = _normalizeRoomCode(params.roomCode);
        if (!roomCode) return null;

        const store = _readSessionCredentialsStore();
        const exactKey = _buildSessionCredentialKey(params);
        if (exactKey && store[exactKey]) {
            return store[exactKey];
        }

        const role = params.role === 'host' ? 'host' : 'player';
        const prefix = `${roomCode}:${role}:`;
        const fallback = Object.entries(store)
            .filter(([key]) => key.startsWith(prefix))
            .sort((left, right) => String(right[1]?.updated_at || '').localeCompare(String(left[1]?.updated_at || '')))[0];

        return fallback ? fallback[1] : null;
    }

    function saveStoredSessionCredentials(params = {}) {
        const key = _buildSessionCredentialKey(params);
        if (!key) return null;

        const roomCode = _normalizeRoomCode(params.roomCode);
        const role = params.role === 'host' ? 'host' : 'player';
        const store = _readSessionCredentialsStore();
        const current = store[key] || {};
        const installationPublicId =
            params.installation_public_id ||
            params.installationPublicId ||
            current.installation_public_id ||
            getStoredUserProfile()?.installation_public_id ||
            getOrCreateInstallationPublicId();

        const nextValue = {
            roomCode,
            role,
            participant_id:
                params.participant_id !== undefined
                    ? params.participant_id
                    : (current.participant_id || null),
            participant_token:
                params.participant_token !== undefined
                    ? params.participant_token
                    : (current.participant_token || null),
            host_token:
                params.host_token !== undefined
                    ? params.host_token
                    : (current.host_token || null),
            installation_public_id: installationPublicId,
            updated_at: new Date().toISOString(),
        };

        store[key] = nextValue;
        _writeSessionCredentialsStore(store);

        if (installationPublicId) {
            mergeStoredUserProfileIdentity({ installation_public_id: installationPublicId });
        }

        return nextValue;
    }

    function clearStoredSessionCredentials(params = {}) {
        const roomCode = _normalizeRoomCode(params.roomCode);
        if (!roomCode) return;

        const role = params.role === 'host' ? 'host' : 'player';
        const store = _readSessionCredentialsStore();
        const exactKey = _buildSessionCredentialKey(params);
        let changed = false;

        if (exactKey && store[exactKey]) {
            delete store[exactKey];
            changed = true;
        } else {
            const prefix = `${roomCode}:${role}:`;
            Object.keys(store)
                .filter((key) => key.startsWith(prefix))
                .forEach((key) => {
                    delete store[key];
                    changed = true;
                });
        }

        if (changed) {
            _writeSessionCredentialsStore(store);
        }
    }

    function detectClientDeviceInfo() {
        const ua = navigator.userAgent || '';
        let device = 'desktop';
        if (/Mobi|Android|iPhone|iPod/i.test(ua)) device = 'mobile';
        else if (/iPad|Tablet/i.test(ua)) device = 'tablet';

        let device_platform = 'web';
        if (/Android/i.test(ua)) device_platform = 'android';
        else if (/iPhone|iPad|iPod/i.test(ua)) device_platform = 'ios';

        const brandMatchers = [
            ['Apple', /iPhone|iPad|iPod/i],
            ['Samsung', /Samsung|SM-[A-Z0-9]+/i],
            ['Google', /Pixel/i],
            ['Xiaomi', /Xiaomi|Mi |Redmi|POCO/i],
            ['Huawei', /HUAWEI|HONOR/i],
            ['OnePlus', /ONEPLUS/i],
            ['OPPO', /OPPO|CPH\d+/i],
            ['vivo', /vivo|V\d{4}/i],
            ['Motorola', /moto|motorola/i],
            ['Sony', /Sony/i],
            ['Nokia', /Nokia/i],
            ['Nothing', /Nothing/i],
            ['realme', /realme/i],
            ['LG', /LG-/i],
        ];
        let device_brand = 'unknown';
        for (const [brand, matcher] of brandMatchers) {
            if (matcher.test(ua)) {
                device_brand = brand;
                break;
            }
        }

        const browsers = [
            { name: 'Yandex', re: /YaBrowser\/(\d+)/ },
            { name: 'Edge', re: /Edg\/(\d+)/ },
            { name: 'Opera', re: /OPR\/(\d+)/ },
            { name: 'Chrome', re: /Chrome\/(\d+)/ },
            { name: 'Firefox', re: /Firefox\/(\d+)/ },
            { name: 'Safari', re: /Version\/(\d+).*Safari/ },
        ];
        let browser = 'unknown';
        let browser_version = 'unknown';
        for (const item of browsers) {
            const match = ua.match(item.re);
            if (match) {
                browser = item.name;
                browser_version = match[1];
                break;
            }
        }

        let device_model = 'unknown';
        const androidModel = ua.match(/Android[^;]*;\s*([^)]+)\)/);
        if (androidModel) {
            device_model = androidModel[1].trim();
        } else if (/iPhone/i.test(ua)) {
            device_model = 'Apple iPhone';
        } else if (/iPad/i.test(ua)) {
            device_model = 'Apple iPad';
        }

        return {
            device,
            browser,
            browser_version,
            device_model,
            device_platform,
            device_brand,
        };
    }

    async function fetchAvailableAvatars() {
        try {
            const response = await fetch('/api/v1/users/meta');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (Array.isArray(data.avatar_emojis) && data.avatar_emojis.length > 0) {
                return data.avatar_emojis;
            }
        } catch (error) {
            console.warn('Failed to load avatar list, using fallback', error);
        }
        return FALLBACK_AVATARS.slice();
    }

    function setPlayerSessionFromProfile(profile) {
        if (!_isValidProfile(profile)) return;
        sessionStorage.setItem('quiz_player_name', profile.username);
        sessionStorage.setItem('quiz_player_emoji', profile.avatar_emoji);
    }

    window.QuizUserProfile = {
        getStoredUserProfile,
        saveStoredUserProfile,
        clearStoredUserProfile,
        mergeStoredUserProfileIdentity,
        getOrCreateInstallationPublicId,
        getStoredSessionCredentials,
        saveStoredSessionCredentials,
        clearStoredSessionCredentials,
        detectClientDeviceInfo,
        fetchAvailableAvatars,
        setPlayerSessionFromProfile,
    };
})();
