let availableProfileAvatars = [];
let selectedProfileAvatar = null;
let isProfileModalLocked = false;
let profileModalMode = 'create';

function _profileModal() {
    return document.getElementById('profile-modal');
}

function _profileNameInput() {
    return document.getElementById('profile-name');
}

function _profileTitle() {
    return document.getElementById('profile-modal-title');
}

function _profileDescription() {
    return document.getElementById('profile-modal-description');
}

function _profileSubmitLabel() {
    return document.getElementById('profile-submit-label');
}

function _profileCancelButton() {
    return document.getElementById('profile-cancel-btn');
}

function _showProfileModalBase() {
    const modal = _profileModal();
    if (!modal) return;

    modal.style.display = 'flex';
    modal.style.opacity = '0';
    requestAnimationFrame(() => {
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '1';
    });
}

function _hideProfileModalBase() {
    const modal = _profileModal();
    if (!modal) return;

    const card = modal.querySelector('.light-glass-card');
    modal.style.transition = 'opacity 0.25s ease';
    modal.style.opacity = '0';
    if (card) {
        card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
        card.style.transform = 'translateY(20px) scale(0.97)';
        card.style.opacity = '0';
    }

    setTimeout(() => {
        modal.style.display = 'none';
        if (card) {
            card.style.transition = '';
            card.style.transform = '';
            card.style.opacity = '';
        }
        modal.style.transition = '';
        modal.style.opacity = '';
    }, 250);
}

function renderStoredProfile(profile) {
    const banner = document.getElementById('profile-banner');
    const emojiEl = document.getElementById('profile-banner-emoji');
    const nameEl = document.getElementById('profile-banner-name');
    const joinDesc = document.getElementById('join-menu-desc');

    const hasProfile = Boolean(profile);
    document.body.classList.toggle('has-user-profile', hasProfile);

    if (banner) {
        banner.style.display = hasProfile ? 'flex' : 'none';
    }
    if (emojiEl) {
        emojiEl.textContent = hasProfile ? profile.avatar_emoji : '👤';
    }
    if (nameEl) {
        nameEl.textContent = hasProfile ? profile.username : 'Игрок';
    }
    if (joinDesc) {
        joinDesc.textContent = hasProfile ? 'Войти в игру только по коду' : 'Войти в комнату';
    }

    if (hasProfile && window.QuizUserProfile) {
        window.QuizUserProfile.setPlayerSessionFromProfile(profile);
    }
}

function resetProfileErrors() {
    const nameField = document.getElementById('field-profile-name');
    const nameHint = document.getElementById('hint-profile-name');
    const avatarHint = document.getElementById('hint-profile-avatar');

    if (nameField) {
        nameField.classList.remove('error-active', 'error-shake');
    }
    if (nameHint) {
        nameHint.style.display = 'none';
    }
    if (avatarHint) {
        avatarHint.style.display = 'none';
    }
}

function showAvatarError(message) {
    const hint = document.getElementById('hint-profile-avatar');
    if (!hint) return;
    hint.textContent = message;
    hint.style.display = 'block';
}

function syncProfileNameFieldIcon() {
    const icon = document.querySelector('#field-profile-name .field-icon');
    if (!icon) return;

    icon.textContent = selectedProfileAvatar || '🙂';
}

function selectProfileAvatar(emoji) {
    selectedProfileAvatar = emoji;
    syncProfileNameFieldIcon();

    const buttons = document.querySelectorAll('.avatar-option');
    buttons.forEach((button) => {
        const isSelected = button.dataset.emoji === emoji;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    const avatarHint = document.getElementById('hint-profile-avatar');
    if (avatarHint) {
        avatarHint.style.display = 'none';
    }
}

function renderProfileAvatarPicker() {
    const container = document.getElementById('avatar-picker');
    if (!container) return;

    container.innerHTML = '';
    availableProfileAvatars.forEach((emoji) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-option';
        button.dataset.emoji = emoji;
        button.textContent = emoji;
        button.onclick = () => selectProfileAvatar(emoji);
        container.appendChild(button);
    });

    if (!selectedProfileAvatar && availableProfileAvatars.length > 0) {
        selectedProfileAvatar = availableProfileAvatars[0];
    }
    if (selectedProfileAvatar) {
        selectProfileAvatar(selectedProfileAvatar);
    }
}

async function loadProfileAvatars() {
    if (!window.QuizUserProfile) return;
    availableProfileAvatars = await window.QuizUserProfile.fetchAvailableAvatars();
    renderProfileAvatarPicker();
}

function _setProfileModalCopy(mode) {
    const titleEl = _profileTitle();
    const descriptionEl = _profileDescription();
    const submitLabelEl = _profileSubmitLabel();
    const cancelBtn = _profileCancelButton();

    if (mode === 'edit') {
        if (titleEl) titleEl.textContent = 'Редактировать профиль';
        if (descriptionEl) descriptionEl.textContent = 'Измени имя или аватар. Мы обновим твой профиль в базе, не создавая новый.';
        if (submitLabelEl) submitLabelEl.textContent = 'Обновить профиль ✨';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    } else {
        if (titleEl) titleEl.textContent = 'Сначала познакомимся';
        if (descriptionEl) descriptionEl.textContent = 'Один раз выбери имя и аватар, дальше в игру можно будет входить только по коду';
        if (submitLabelEl) submitLabelEl.textContent = 'Сохранить профиль ✨';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }
}

function _applyProfileModalState(mode, profile = null) {
    profileModalMode = mode;
    _setProfileModalCopy(mode);

    const nameInput = _profileNameInput();
    if (nameInput) {
        nameInput.value = profile?.username || '';
    }

    selectedProfileAvatar = profile?.avatar_emoji || availableProfileAvatars[0] || null;
    syncProfileNameFieldIcon();
    renderProfileAvatarPicker();
}

function openProfileModal(options = {}) {
    const storedProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
    const mode = options.mode || (storedProfile ? 'edit' : 'create');
    const profile = options.profile || (mode === 'edit' ? storedProfile : null);

    isProfileModalLocked = Boolean(options.locked);
    resetProfileErrors();
    _applyProfileModalState(mode, profile);
    _showProfileModalBase();

    setTimeout(() => {
        const nameInput = _profileNameInput();
        if (nameInput) {
            nameInput.focus();
        }
    }, 60);
}

function closeProfileModal() {
    if (isProfileModalLocked) return;
    _hideProfileModalBase();
}

async function touchStoredProfile(profile) {
    if (!profile || !window.QuizUserProfile) return;

    const deviceInfo = window.QuizUserProfile.detectClientDeviceInfo();
    try {
        const response = await fetch(`/api/v1/users/${profile.id}/touch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                device_platform: deviceInfo.device_platform,
                device_brand: deviceInfo.device_brand,
            }),
        });

        if (response.status === 404) {
            window.QuizUserProfile?.clearStoredUserProfile?.();
            renderStoredProfile(null);
            openProfileModal({ locked: true });
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const updatedProfile = await response.json();
        window.QuizUserProfile.saveStoredUserProfile(updatedProfile);
        renderStoredProfile(updatedProfile);
    } catch (error) {
        console.warn('Failed to touch stored user profile', error);
        renderStoredProfile(profile);
    }
}

async function submitProfileRegistration() {
    const nameInput = _profileNameInput();
    const nameField = document.getElementById('field-profile-name');
    const nameHint = document.getElementById('hint-profile-name');
    const username = nameInput ? nameInput.value.trim() : '';

    resetProfileErrors();

    if (!username) {
        showFieldError(nameField, nameHint, 'Напиши, как тебя зовут ✨');
        return;
    }

    if (!selectedProfileAvatar) {
        showAvatarError('Выбери аватар, чтобы мы тебя запомнили');
        return;
    }

    const deviceInfo = window.QuizUserProfile?.detectClientDeviceInfo?.() || {};
    const storedProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
    const isUpdate = profileModalMode === 'edit' && Boolean(storedProfile?.id);
    const url = isUpdate ? `/api/v1/users/${storedProfile.id}` : '/api/v1/users';
    const method = isUpdate ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                avatar_emoji: selectedProfileAvatar,
                device_platform: deviceInfo.device_platform || null,
                device_brand: deviceInfo.device_brand || null,
            }),
        });

        if (response.status === 404 && isUpdate) {
            window.QuizUserProfile?.clearStoredUserProfile?.();
            renderStoredProfile(null);
            isProfileModalLocked = true;
            resetProfileErrors();
            _applyProfileModalState('create', {
                username,
                avatar_emoji: selectedProfileAvatar,
            });
            showFieldError(nameField, nameHint, 'Профиль не найден. Сохраним его заново.');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const detail = errorData?.detail;
            if (typeof detail === 'string') {
                showFieldError(nameField, nameHint, detail);
            } else {
                showFieldError(nameField, nameHint, 'Не удалось сохранить профиль');
            }
            return;
        }

        const profile = await response.json();
        window.QuizUserProfile?.saveStoredUserProfile?.(profile);
        renderStoredProfile(profile);
        _hideProfileModalBase();

        const roomInput = document.getElementById('room-code');
        if (!isUpdate && roomInput && roomInput.value.trim()) {
            openJoinModal();
        }
    } catch (error) {
        console.error('Profile save failed', error);
        showFieldError(nameField, nameHint, 'Ошибка сервера. Попробуй ещё раз');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadProfileAvatars();

    const storedProfile = window.QuizUserProfile?.getStoredUserProfile?.();
    if (storedProfile) {
        renderStoredProfile(storedProfile);
        touchStoredProfile(storedProfile);
    } else {
        renderStoredProfile(null);
        openProfileModal({ locked: true, mode: 'create' });
    }

    const modal = _profileModal();
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (!isProfileModalLocked && event.target === modal) {
                closeProfileModal();
            }
        });
    }

    const banner = document.getElementById('profile-banner');
    if (banner) {
        banner.addEventListener('click', () => {
            const currentProfile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
            if (currentProfile) {
                openProfileModal({ mode: 'edit' });
            }
        });
    }
});
