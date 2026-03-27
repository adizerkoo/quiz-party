import { GameRole } from '@/features/game/types';

export type GameSessionCredentials = {
  roomCode: string;
  role: GameRole;
  hostToken?: string | null;
  participantToken?: string | null;
  participantId?: string | null;
  installationPublicId?: string | null;
  updatedAt: string;
};

const credentialsByKey = new Map<string, GameSessionCredentials>();

function buildKey(roomCode: string, role: GameRole) {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  return `${normalizedRoomCode}:${role}`;
}

export function getGameSessionCredentials(roomCode: string, role: GameRole) {
  if (!roomCode.trim()) {
    return null;
  }

  return credentialsByKey.get(buildKey(roomCode, role)) ?? null;
}

export function saveGameSessionCredentials(params: {
  roomCode: string;
  role: GameRole;
  hostToken?: string | null;
  participantToken?: string | null;
  participantId?: string | null;
  installationPublicId?: string | null;
}) {
  const normalizedRoomCode = params.roomCode.trim().toUpperCase();
  if (!normalizedRoomCode) {
    return null;
  }

  const key = buildKey(normalizedRoomCode, params.role);
  const current = credentialsByKey.get(key);
  const nextValue: GameSessionCredentials = {
    roomCode: normalizedRoomCode,
    role: params.role,
    hostToken: params.hostToken !== undefined ? params.hostToken : (current?.hostToken ?? null),
    participantToken:
      params.participantToken !== undefined ? params.participantToken : (current?.participantToken ?? null),
    participantId: params.participantId !== undefined ? params.participantId : (current?.participantId ?? null),
    installationPublicId:
      params.installationPublicId !== undefined
        ? params.installationPublicId
        : (current?.installationPublicId ?? null),
    updatedAt: new Date().toISOString(),
  };

  credentialsByKey.set(key, nextValue);
  return nextValue;
}

export function clearGameSessionCredentials(roomCode: string, role: GameRole) {
  if (!roomCode.trim()) {
    return;
  }

  credentialsByKey.delete(buildKey(roomCode, role));
}
