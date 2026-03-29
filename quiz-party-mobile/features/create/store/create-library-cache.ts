import * as FileSystem from 'expo-file-system/legacy';

import { CreateLibraryQuestion } from '@/features/create/types';

type CreateLibraryCacheRecord = {
  entries: CreateLibraryQuestion[];
  cachedAt: string | null;
};

const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const LIBRARY_FILE = `${LIBRARY_DIRECTORY}create-library-cache.json`;

let libraryCache: CreateLibraryCacheRecord | null = null;
let libraryCacheHydrated = false;

function sanitizeLibraryEntries(entries: CreateLibraryQuestion[]) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    is_favorite: false,
  }));
}

async function ensureLibraryDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(LIBRARY_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, { intermediates: true });
  }
}

async function persistLibraryCache() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureLibraryDirectory();
    await FileSystem.writeAsStringAsync(
      LIBRARY_FILE,
      JSON.stringify({
        entries: libraryCache?.entries ?? [],
        cachedAt: libraryCache?.cachedAt ?? null,
      }),
    );
  } catch (error) {
    // Ошибка кэширования не должна ломать экран создания.
  }
}

export async function hydrateCreateLibraryCache() {
  if (libraryCacheHydrated) {
    return libraryCache;
  }

  libraryCacheHydrated = true;
  libraryCache = null;

  if (!FileSystem.documentDirectory) {
    return libraryCache;
  }

  try {
    const info = await FileSystem.getInfoAsync(LIBRARY_FILE);
    if (!info.exists) {
      return libraryCache;
    }

    const raw = await FileSystem.readAsStringAsync(LIBRARY_FILE);
    const parsed = JSON.parse(raw) as Partial<CreateLibraryCacheRecord>;

    libraryCache = {
      entries: sanitizeLibraryEntries(
        Array.isArray(parsed?.entries) ? parsed.entries as CreateLibraryQuestion[] : [],
      ),
      cachedAt: parsed?.cachedAt ?? null,
    };
  } catch (error) {
    libraryCache = null;
  }

  return libraryCache;
}

export function getCachedCreateLibraryQuestions() {
  return libraryCache;
}

export async function setCachedCreateLibraryQuestions(entries: CreateLibraryQuestion[]) {
  libraryCache = {
    entries: sanitizeLibraryEntries(entries),
    cachedAt: new Date().toISOString(),
  };

  await persistLibraryCache();
  return libraryCache;
}
