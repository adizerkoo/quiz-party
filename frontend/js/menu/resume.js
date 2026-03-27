let currentResumeSession = null;

function closeResumeModal() {
    const modal = document.getElementById('resume-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function openResumeModal(session) {
    currentResumeSession = session;

    const modal = document.getElementById('resume-modal');
    const subtitle = document.getElementById('resume-modal-subtitle');
    if (!modal || !subtitle) {
        return;
    }

    const roleLabel = session.role === 'host' ? 'как ведущий' : 'как игрок';
    const titleLabel = session.title ? `«${session.title}»` : `комнату ${session.room_code}`;
    subtitle.textContent = `Можно вернуться в ${titleLabel} ${roleLabel}.`;
    modal.style.display = 'flex';
}

function resumeStoredGame() {
    if (!currentResumeSession) {
        return;
    }

    const targetRole = currentResumeSession.role === 'host' ? 'host' : 'player';
    const targetRoom = encodeURIComponent(currentResumeSession.room_code);
    window.location.href = `game.html?room=${targetRoom}&role=${targetRole}`;
}

async function checkStoredResumeGameOnMenuEntry() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) {
        return;
    }

    const allStoredSessions = window.QuizUserProfile?.listStoredSessionCredentials?.() || [];
    if (!allStoredSessions.length) {
        return;
    }

    const profile = window.QuizUserProfile?.getStoredUserProfile?.() || null;
    const candidateSessions = allStoredSessions
        .filter((session) => {
            if (!session?.roomCode || !session?.role) {
                return false;
            }

            if (session.role === 'player' && !profile) {
                return false;
            }

            return true;
        })
        .sort((left, right) => String(right?.updated_at || '').localeCompare(String(left?.updated_at || '')));

    if (!candidateSessions.length) {
        return;
    }

    try {
        const response = await fetch('/api/v1/resume/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessions: candidateSessions.map((session) => ({
                    room_code: session.roomCode,
                    role: session.role,
                    participant_id: session.participant_id || null,
                    participant_token: session.participant_token || null,
                    host_token: session.host_token || null,
                    installation_public_id: session.installation_public_id || null,
                })),
                user_id: profile?.id || null,
                installation_public_id: profile?.installation_public_id || null,
            }),
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        const checkedSessions = Array.isArray(data.sessions) ? data.sessions : [];

        checkedSessions.forEach((sessionResult, index) => {
            const localSession = candidateSessions[index];
            if (sessionResult?.clear_credentials && localSession?.storageKey) {
                window.QuizUserProfile?.clearStoredSessionCredentialsByKey?.(localSession.storageKey);
            }
        });

        if (data?.resume_game?.can_resume) {
            openResumeModal(data.resume_game);
        }
    } catch (error) {
        console.warn('Failed to check stored resume game', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    void checkStoredResumeGameOnMenuEntry();
});
