import {
  getCachedMenuHistory,
  hydrateMenuHistoryCache,
  setCachedMenuHistory,
} from '@/features/menu/store/menu-history-cache';
import { MenuHistoryEntry, MenuHistoryFetchResult } from '@/features/menu/types';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

export async function fetchMenuHistory(userId: number) {
  try {
    const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${userId}/history`);

    if (!response.ok) {
      throw new Error(`Failed to load history: HTTP ${response.status}`);
    }

    const entries = (await response.json()) as MenuHistoryEntry[];
    const cachedRecord = await setCachedMenuHistory(userId, Array.isArray(entries) ? entries : []);

    return {
      entries: cachedRecord?.entries ?? [],
      source: 'network',
      cachedAt: cachedRecord?.cachedAt ?? null,
    } satisfies MenuHistoryFetchResult;
  } catch (error) {
    await hydrateMenuHistoryCache();

    const cachedRecord = getCachedMenuHistory(userId);
    if (cachedRecord) {
      return {
        entries: cachedRecord.entries,
        source: 'cache',
        cachedAt: cachedRecord.cachedAt ?? null,
      } satisfies MenuHistoryFetchResult;
    }

    throw error;
  }
}
