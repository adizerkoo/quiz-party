import { fetchGameResults } from '@/features/game/services/game-api';
import {
  getCachedGameResults,
  hydrateGameResultsCache,
  setCachedGameResults,
} from '@/features/game/store/game-results-cache';
import { GameResultsPayload } from '@/features/game/types';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';

const logger = createFeatureLogger('native.game.results-data');
const activeResultsLoads = new Map<string, Promise<GameResultsPayload>>();

type HistoryResultsWarmEntry = {
  quiz_code: string;
  can_open_results: boolean;
};

function normalizeRoomCode(roomCode: string | null | undefined) {
  return String(roomCode ?? '').trim().toUpperCase();
}

export class GameResultsUnavailableError extends Error {
  kind: 'missing_cache' | 'not_found';

  constructor(roomCode: string, kind: 'missing_cache' | 'not_found') {
    super(`Game results are unavailable for ${normalizeRoomCode(roomCode)}`);
    this.name = 'GameResultsUnavailableError';
    this.kind = kind;
  }
}

export async function fetchGameResultsWithCache(
  roomCode: string,
  options?: { preferCache?: boolean },
) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) {
    throw new GameResultsUnavailableError(roomCode, 'missing_cache');
  }

  if (options?.preferCache) {
    await hydrateGameResultsCache();

    const cachedPayload = getCachedGameResults(normalizedRoomCode);
    if (cachedPayload) {
      logger.info('results.load.succeeded', {
        roomCode: normalizedRoomCode,
        source: 'cache',
      });
      return cachedPayload;
    }
  }

  const activePromise = activeResultsLoads.get(normalizedRoomCode);
  if (activePromise) {
    return activePromise;
  }

  const nextPromise = (async () => {
    try {
      const payload = await fetchGameResults(normalizedRoomCode);
      await setCachedGameResults(normalizedRoomCode, payload);
      logger.info('results.load.succeeded', {
        roomCode: normalizedRoomCode,
        source: 'network',
      });
      return payload;
    } catch (error) {
      await hydrateGameResultsCache();

      const cachedPayload = getCachedGameResults(normalizedRoomCode);
      if (cachedPayload) {
        logger.info('results.load.succeeded', {
          roomCode: normalizedRoomCode,
          source: 'cache',
        });
        return cachedPayload;
      }

      const failureKind =
        error instanceof Error && error.message.includes('HTTP 404')
          ? 'not_found'
          : 'missing_cache';
      logger.warn('results.load.failed', {
        roomCode: normalizedRoomCode,
        source: 'cache',
        message: error instanceof Error ? error.message : 'unknown_error',
        failureKind,
      });
      throw new GameResultsUnavailableError(normalizedRoomCode, failureKind);
    } finally {
      activeResultsLoads.delete(normalizedRoomCode);
    }
  })();

  activeResultsLoads.set(normalizedRoomCode, nextPromise);
  return nextPromise;
}

export async function readCachedGameResults(roomCode: string) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) {
    return null;
  }

  await hydrateGameResultsCache();
  return getCachedGameResults(normalizedRoomCode);
}

export async function warmCachedGameResultsForHistory(
  entries: HistoryResultsWarmEntry[],
  options?: { limit?: number },
) {
  await hydrateGameResultsCache();

  const targetRoomCodes = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry.can_open_results)
    .map((entry) => normalizeRoomCode(entry.quiz_code))
    .filter((roomCode) => roomCode && !getCachedGameResults(roomCode))
    .slice(0, options?.limit ?? 10);

  if (!targetRoomCodes.length) {
    return;
  }

  await Promise.allSettled(targetRoomCodes.map((roomCode) => fetchGameResultsWithCache(roomCode)));
}
