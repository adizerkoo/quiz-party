import {
  getCachedMenuHistory,
  hydrateMenuHistoryCache,
  setCachedMenuHistory,
} from '@/features/menu/store/menu-history-cache';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';
import { MenuHistoryEntry, MenuHistoryFetchResult } from '@/features/menu/types';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

const logger = createFeatureLogger('native.menu.history');

export async function fetchMenuHistory(userId: number) {
  try {
    logger.info('history.load.started', { userId });
    const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${userId}/history`);

    if (!response.ok) {
      logger.warn('history.load.failed', { userId, status: response.status });
      throw new Error(`Failed to load history: HTTP ${response.status}`);
    }

    const entries = (await response.json()) as MenuHistoryEntry[];
    const cachedRecord = await setCachedMenuHistory(userId, Array.isArray(entries) ? entries : []);
    logger.info('history.load.succeeded', {
      userId,
      resultCount: cachedRecord?.entries.length ?? 0,
      source: 'network',
    });

    return {
      entries: cachedRecord?.entries ?? [],
      source: 'network',
      cachedAt: cachedRecord?.cachedAt ?? null,
    } satisfies MenuHistoryFetchResult;
  } catch (error) {
    await hydrateMenuHistoryCache();

    const cachedRecord = getCachedMenuHistory(userId);
    if (cachedRecord) {
      logger.info('history.load.succeeded', {
        userId,
        resultCount: cachedRecord.entries.length,
        source: 'cache',
      });
      return {
        entries: cachedRecord.entries,
        source: 'cache',
        cachedAt: cachedRecord.cachedAt ?? null,
      } satisfies MenuHistoryFetchResult;
    }

    logger.warn('history.load.failed', {
      userId,
      source: 'cache',
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}
