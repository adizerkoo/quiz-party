import { buildWebAppUrl, WEB_APP_ORIGIN } from '@/features/web/config/web-app';
import { GameQuizResponse, GameRole } from '@/features/game/types';

export async function fetchGameQuiz(roomCode: string, role: GameRole) {
  const querySuffix = role === 'host' ? '?role=host' : '';
  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/quizzes/${encodeURIComponent(roomCode)}${querySuffix}`);

  if (!response.ok) {
    throw new Error(`Failed to load quiz: HTTP ${response.status}`);
  }

  return (await response.json()) as GameQuizResponse;
}

export function buildGameShareUrl(roomCode: string) {
  return buildWebAppUrl('/index.html', { room: roomCode });
}
