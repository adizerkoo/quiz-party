import * as FileSystem from 'expo-file-system/legacy';

import { MenuHistoryEntry } from '@/features/menu/types';

type MenuHistoryCacheRecord = {
  entries: MenuHistoryEntry[];
  cachedAt: string | null;
};

type PersistedHistoryCacheState = Record<string, MenuHistoryCacheRecord>;

const HISTORY_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const HISTORY_FILE = `${HISTORY_DIRECTORY}menu-history-cache.json`;

const historyCacheByUserId = new Map<number, MenuHistoryCacheRecord>();
let historyCacheHydrated = false;

function serializeHistoryCache(): PersistedHistoryCacheState {
  const result: PersistedHistoryCacheState = {};

  historyCacheByUserId.forEach((value, userId) => {
    result[String(userId)] = {
      entries: Array.isArray(value.entries) ? value.entries : [],
      cachedAt: value.cachedAt ?? null,
    };
  });

  return result;
}

async function ensureHistoryDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(HISTORY_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(HISTORY_DIRECTORY, { intermediates: true });
  }
}

async function persistHistoryCache() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureHistoryDirectory();
    await FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(serializeHistoryCache()));
  } catch (error) {
    // Ошибка кеширования не должна ломать экран профиля.
  }
}

export async function hydrateMenuHistoryCache() {
  if (historyCacheHydrated) {
    return historyCacheByUserId;
  }

  historyCacheHydrated = true;
  historyCacheByUserId.clear();

  if (!FileSystem.documentDirectory) {
    return historyCacheByUserId;
  }

  try {
    const info = await FileSystem.getInfoAsync(HISTORY_FILE);
    if (!info.exists) {
      return historyCacheByUserId;
    }

    const raw = await FileSystem.readAsStringAsync(HISTORY_FILE);
    const parsed = JSON.parse(raw) as PersistedHistoryCacheState;

    Object.entries(parsed || {}).forEach(([userId, value]) => {
      const numericUserId = Number(userId);
      if (!Number.isFinite(numericUserId) || numericUserId <= 0 || !value) {
        return;
      }

      historyCacheByUserId.set(numericUserId, {
        entries: Array.isArray(value.entries) ? value.entries : [],
        cachedAt: value.cachedAt ?? null,
      });
    });
  } catch (error) {
    historyCacheByUserId.clear();
  }

  return historyCacheByUserId;
}

export function getCachedMenuHistory(userId: number) {
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  return historyCacheByUserId.get(userId) ?? null;
}

export async function setCachedMenuHistory(userId: number, entries: MenuHistoryEntry[]) {
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  const nextValue: MenuHistoryCacheRecord = {
    entries: Array.isArray(entries) ? entries : [],
    cachedAt: new Date().toISOString(),
  };

  historyCacheByUserId.set(userId, nextValue);
  await persistHistoryCache();
  return nextValue;
}
