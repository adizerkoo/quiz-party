(function () {
    const STORAGE_KEY = 'quiz_user_profile_v1';
    const FALLBACK_AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];

    function _isValidProfile(profile) {
        return Boolean(
            profile &&
            typeof profile.id === 'number' &&
            typeof profile.username === 'string' &&
            profile.username.trim() &&
            typeof profile.avatar_emoji === 'string'
        );
    }

    function getStoredUserProfile() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return _isValidProfile(parsed) ? parsed : null;
        } catch (error) {
            console.warn('Failed to read stored user profile', error);
            return null;
        }
    }

    function saveStoredUserProfile(profile) {
        if (!_isValidProfile(profile)) return;
        const normalized = {
            id: profile.id,
            username: String(profile.username).trim(),
            avatar_emoji: profile.avatar_emoji,
            device_platform: profile.device_platform || null,
            device_brand: profile.device_brand || null,
            created_at: profile.created_at || null,
            last_login_at: profile.last_login_at || null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }

    function clearStoredUserProfile() {
        localStorage.removeItem(STORAGE_KEY);
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
        detectClientDeviceInfo,
        fetchAvailableAvatars,
        setPlayerSessionFromProfile,
    };
})();
