import * as FileSystem from 'expo-file-system/legacy';

import { GameResultsPayload } from '@/features/game/types';

type GameResultsCacheState = Record<string, GameResultsPayload>;

const RESULTS_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const RESULTS_FILE = `${RESULTS_DIRECTORY}game-results-cache.json`;

const resultsCacheByRoomCode = new Map<string, GameResultsPayload>();
let gameResultsCacheHydrated = false;

function normalizeRoomCode(roomCode: string | null | undefined) {
  return String(roomCode ?? '').trim().toUpperCase();
}

async function ensureResultsDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(RESULTS_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RESULTS_DIRECTORY, { intermediates: true });
  }
}

async function persistResultsCache() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureResultsDirectory();

    const serializedState: GameResultsCacheState = {};
    resultsCacheByRoomCode.forEach((payload, roomCode) => {
      serializedState[roomCode] = payload;
    });

    await FileSystem.writeAsStringAsync(RESULTS_FILE, JSON.stringify(serializedState));
  } catch (error) {
    // Ошибка локального сохранения не должна ломать экран результатов.
  }
}

export async function hydrateGameResultsCache() {
  if (gameResultsCacheHydrated) {
    return resultsCacheByRoomCode;
  }

  gameResultsCacheHydrated = true;
  resultsCacheByRoomCode.clear();

  if (!FileSystem.documentDirectory) {
    return resultsCacheByRoomCode;
  }

  try {
    const info = await FileSystem.getInfoAsync(RESULTS_FILE);
    if (!info.exists) {
      return resultsCacheByRoomCode;
    }

    const raw = await FileSystem.readAsStringAsync(RESULTS_FILE);
    const parsed = JSON.parse(raw) as GameResultsCacheState;

    Object.entries(parsed || {}).forEach(([roomCode, payload]) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      if (!normalizedRoomCode || !payload) {
        return;
      }

      resultsCacheByRoomCode.set(normalizedRoomCode, payload);
    });
  } catch (error) {
    resultsCacheByRoomCode.clear();
  }

  return resultsCacheByRoomCode;
}

export function getCachedGameResults(roomCode: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) {
    return null;
  }

  return resultsCacheByRoomCode.get(normalizedRoomCode) ?? null;
}

export async function setCachedGameResults(roomCode: string, payload: GameResultsPayload) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) {
    return null;
  }

  resultsCacheByRoomCode.set(normalizedRoomCode, payload);
  await persistResultsCache();
  return payload;
}
