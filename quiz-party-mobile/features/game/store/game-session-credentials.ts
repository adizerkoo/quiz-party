import * as FileSystem from 'expo-file-system/legacy';

import { GameRole } from '@/features/game/types';

export type GameSessionCredentials = {
  roomCode: string;
  role: GameRole;
  hostToken?: string | null;
  participantToken?: string | null;
  participantId?: string | null;
  installationPublicId?: string | null;
  updatedAt: string;
  storageKey: string;
};

type PersistedCredentialsState = Record<string, Omit<GameSessionCredentials, 'storageKey'>>;

const CREDENTIALS_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const CREDENTIALS_FILE = `${CREDENTIALS_DIRECTORY}game-session-credentials.json`;

const credentialsByKey = new Map<string, GameSessionCredentials>();
let gameCredentialsHydrated = false;

function buildKey(roomCode: string, role: GameRole) {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  return `${normalizedRoomCode}:${role}`;
}

function serializeState(): PersistedCredentialsState {
  const result: PersistedCredentialsState = {};
  credentialsByKey.forEach((value, key) => {
    result[key] = {
      roomCode: value.roomCode,
      role: value.role,
      hostToken: value.hostToken ?? null,
      participantToken: value.participantToken ?? null,
      participantId: value.participantId ?? null,
      installationPublicId: value.installationPublicId ?? null,
      updatedAt: value.updatedAt,
    };
  });
  return result;
}

async function ensureCredentialsDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(CREDENTIALS_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CREDENTIALS_DIRECTORY, { intermediates: true });
  }
}

async function persistCredentialsState() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureCredentialsDirectory();
    await FileSystem.writeAsStringAsync(CREDENTIALS_FILE, JSON.stringify(serializeState()));
  } catch (error) {
    // Ошибка локального сохранения не должна ломать игровой flow.
  }
}

export async function hydrateGameSessionCredentials() {
  if (gameCredentialsHydrated) {
    return credentialsByKey;
  }

  gameCredentialsHydrated = true;
  credentialsByKey.clear();

  if (!FileSystem.documentDirectory) {
    return credentialsByKey;
  }

  try {
    const info = await FileSystem.getInfoAsync(CREDENTIALS_FILE);
    if (!info.exists) {
      return credentialsByKey;
    }

    const raw = await FileSystem.readAsStringAsync(CREDENTIALS_FILE);
    const parsed = JSON.parse(raw) as PersistedCredentialsState;
    Object.entries(parsed || {}).forEach(([storageKey, value]) => {
      if (!value?.roomCode || !value?.role) {
        return;
      }

      credentialsByKey.set(storageKey, {
        ...value,
        roomCode: value.roomCode.trim().toUpperCase(),
        storageKey,
      });
    });
  } catch (error) {
    credentialsByKey.clear();
  }

  return credentialsByKey;
}

export function getGameSessionCredentials(roomCode: string, role: GameRole) {
  if (!roomCode.trim()) {
    return null;
  }

  return credentialsByKey.get(buildKey(roomCode, role)) ?? null;
}

export function listGameSessionCredentials() {
  return Array.from(credentialsByKey.values()).sort((left, right) =>
    String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')),
  );
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

  const storageKey = buildKey(normalizedRoomCode, params.role);
  const current = credentialsByKey.get(storageKey);
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
    storageKey,
  };

  credentialsByKey.set(storageKey, nextValue);
  void persistCredentialsState();
  return nextValue;
}

export function clearGameSessionCredentials(roomCode: string, role: GameRole) {
  if (!roomCode.trim()) {
    return;
  }

  credentialsByKey.delete(buildKey(roomCode, role));
  void persistCredentialsState();
}

export function clearGameSessionCredentialsByKey(storageKey: string) {
  if (!storageKey) {
    return;
  }

  credentialsByKey.delete(storageKey);
  void persistCredentialsState();
}
