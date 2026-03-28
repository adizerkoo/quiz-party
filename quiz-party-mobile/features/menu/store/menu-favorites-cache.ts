import * as FileSystem from 'expo-file-system/legacy';

import { MenuFavoriteQuestion } from '@/features/menu/types';

type MenuFavoritesCacheRecord = {
  entries: MenuFavoriteQuestion[];
  cachedAt: string | null;
};

type PersistedFavoritesCacheState = Record<string, MenuFavoritesCacheRecord>;

const FAVORITES_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const FAVORITES_FILE = `${FAVORITES_DIRECTORY}menu-favorites-cache.json`;

const favoritesCacheByUserId = new Map<number, MenuFavoritesCacheRecord>();
let favoritesCacheHydrated = false;

function serializeFavoritesCache(): PersistedFavoritesCacheState {
  const result: PersistedFavoritesCacheState = {};

  favoritesCacheByUserId.forEach((value, userId) => {
    result[String(userId)] = {
      entries: Array.isArray(value.entries) ? value.entries : [],
      cachedAt: value.cachedAt ?? null,
    };
  });

  return result;
}

async function ensureFavoritesDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(FAVORITES_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(FAVORITES_DIRECTORY, { intermediates: true });
  }
}

async function persistFavoritesCache() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureFavoritesDirectory();
    await FileSystem.writeAsStringAsync(FAVORITES_FILE, JSON.stringify(serializeFavoritesCache()));
  } catch (error) {
    // Ошибка кеширования не должна ломать экран профиля.
  }
}

export async function hydrateMenuFavoritesCache() {
  if (favoritesCacheHydrated) {
    return favoritesCacheByUserId;
  }

  favoritesCacheHydrated = true;
  favoritesCacheByUserId.clear();

  if (!FileSystem.documentDirectory) {
    return favoritesCacheByUserId;
  }

  try {
    const info = await FileSystem.getInfoAsync(FAVORITES_FILE);
    if (!info.exists) {
      return favoritesCacheByUserId;
    }

    const raw = await FileSystem.readAsStringAsync(FAVORITES_FILE);
    const parsed = JSON.parse(raw) as PersistedFavoritesCacheState;

    Object.entries(parsed || {}).forEach(([userId, value]) => {
      const numericUserId = Number(userId);
      if (!Number.isFinite(numericUserId) || numericUserId <= 0 || !value) {
        return;
      }

      favoritesCacheByUserId.set(numericUserId, {
        entries: Array.isArray(value.entries) ? value.entries : [],
        cachedAt: value.cachedAt ?? null,
      });
    });
  } catch (error) {
    favoritesCacheByUserId.clear();
  }

  return favoritesCacheByUserId;
}

export function getCachedMenuFavorites(userId: number) {
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  return favoritesCacheByUserId.get(userId) ?? null;
}

export async function setCachedMenuFavorites(userId: number, entries: MenuFavoriteQuestion[]) {
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  const nextValue: MenuFavoritesCacheRecord = {
    entries: Array.isArray(entries) ? entries : [],
    cachedAt: new Date().toISOString(),
  };

  favoritesCacheByUserId.set(userId, nextValue);
  await persistFavoritesCache();
  return nextValue;
}
