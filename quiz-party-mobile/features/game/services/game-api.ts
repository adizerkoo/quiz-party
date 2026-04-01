import { fetchWithTimeout } from '@/features/shared/services/fetch-with-timeout';
import { buildWebAppUrl, WEB_APP_ORIGIN } from '@/features/web/config/web-app';
import { GameQuizResponse, GameResultsPayload, GameResumeCheckResponse, GameRole } from '@/features/game/types';

type ResumeCheckSessionInput = {
  roomCode: string;
  role: GameRole;
  participantId?: string | null;
  participantToken?: string | null;
  hostToken?: string | null;
  installationPublicId?: string | null;
};

export async function fetchGameQuiz(roomCode: string, role: GameRole, hostToken?: string | null) {
  const params = new URLSearchParams();
  if (role === 'host') {
    params.set('role', 'host');
    if (hostToken) {
      params.set('host_token', hostToken);
    }
  }
  const querySuffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetchWithTimeout(`${WEB_APP_ORIGIN}/api/v1/quizzes/${encodeURIComponent(roomCode)}${querySuffix}`);

  if (!response.ok) {
    throw new Error(`Failed to load quiz: HTTP ${response.status}`);
  }

  return (await response.json()) as GameQuizResponse;
}

export async function fetchGameResults(roomCode: string) {
  const response = await fetchWithTimeout(`${WEB_APP_ORIGIN}/api/v1/quizzes/${encodeURIComponent(roomCode)}/results`);

  if (!response.ok) {
    throw new Error(`Failed to load results: HTTP ${response.status}`);
  }

  return (await response.json()) as GameResultsPayload;
}

export async function checkStoredGameResume(params: {
  sessions: ResumeCheckSessionInput[];
  userId?: number | null;
  installationPublicId?: string | null;
}) {
  const response = await fetchWithTimeout(`${WEB_APP_ORIGIN}/api/v1/resume/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessions: params.sessions.map((session) => ({
        room_code: session.roomCode,
        role: session.role,
        participant_id: session.participantId ?? null,
        participant_token: session.participantToken ?? null,
        host_token: session.hostToken ?? null,
        installation_public_id: session.installationPublicId ?? null,
      })),
      user_id: params.userId ?? null,
      installation_public_id: params.installationPublicId ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to check resume: HTTP ${response.status}`);
  }

  return (await response.json()) as GameResumeCheckResponse;
}

export function buildGameShareUrl(roomCode: string) {
  return buildWebAppUrl('/index.html', { room: roomCode });
}
