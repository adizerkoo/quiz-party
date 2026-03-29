import * as FileSystem from 'expo-file-system/legacy';

import { CreateQuizQuestion } from '@/features/create/types';
import { MenuFavoriteQuestion } from '@/features/menu/types';

export type MenuFavoriteSyncQueueItem = {
  id: string;
  userId: number;
  action: 'add' | 'remove';
  questionPublicId: string;
  sourceQuestionPublicId: string | null;
  question: CreateQuizQuestion | null;
  optimisticEntry: MenuFavoriteQuestion | null;
  originScreen: 'create' | 'profile' | 'history';
  createdAt: string;
};

const FAVORITES_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const FAVORITES_SYNC_QUEUE_FILE = `${FAVORITES_DIRECTORY}menu-favorites-sync-queue.json`;

let favoriteSyncQueue: MenuFavoriteSyncQueueItem[] = [];
let favoriteSyncQueueHydrated = false;

async function ensureQueueDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(FAVORITES_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(FAVORITES_DIRECTORY, { intermediates: true });
  }
}

async function persistQueue() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureQueueDirectory();
    await FileSystem.writeAsStringAsync(
      FAVORITES_SYNC_QUEUE_FILE,
      JSON.stringify(Array.isArray(favoriteSyncQueue) ? favoriteSyncQueue : []),
    );
  } catch (error) {
    // Ошибка локального сохранения очереди не должна ломать избранное.
  }
}

function normalizeQueueItem(item: Partial<MenuFavoriteSyncQueueItem> | null | undefined): MenuFavoriteSyncQueueItem | null {
  if (!item) {
    return null;
  }

  const userId = Number(item.userId);
  const questionPublicId = String(item.questionPublicId ?? '').trim();
  if (!Number.isFinite(userId) || userId <= 0 || !questionPublicId) {
    return null;
  }

  const action = item.action === 'remove' ? 'remove' : 'add';
  const originScreen =
    item.originScreen === 'history' || item.originScreen === 'profile'
      ? item.originScreen
      : 'create';

  return {
    id: String(item.id ?? `${Date.now()}-${Math.random()}`),
    userId,
    action,
    questionPublicId,
    sourceQuestionPublicId: item.sourceQuestionPublicId ?? null,
    question: item.question ?? null,
    optimisticEntry: item.optimisticEntry ?? null,
    originScreen,
    createdAt: item.createdAt ?? new Date().toISOString(),
  } satisfies MenuFavoriteSyncQueueItem;
}

function isMenuFavoriteSyncQueueItem(item: MenuFavoriteSyncQueueItem | null): item is MenuFavoriteSyncQueueItem {
  return Boolean(item);
}

export async function hydrateMenuFavoriteSyncQueue() {
  if (favoriteSyncQueueHydrated) {
    return favoriteSyncQueue;
  }

  favoriteSyncQueueHydrated = true;
  favoriteSyncQueue = [];

  if (!FileSystem.documentDirectory) {
    return favoriteSyncQueue;
  }

  try {
    const info = await FileSystem.getInfoAsync(FAVORITES_SYNC_QUEUE_FILE);
    if (!info.exists) {
      return favoriteSyncQueue;
    }

    const raw = await FileSystem.readAsStringAsync(FAVORITES_SYNC_QUEUE_FILE);
    const parsed = JSON.parse(raw) as Array<Partial<MenuFavoriteSyncQueueItem>>;
    favoriteSyncQueue = (Array.isArray(parsed) ? parsed : [])
      .map((item) => normalizeQueueItem(item))
      .filter(isMenuFavoriteSyncQueueItem);
  } catch (error) {
    favoriteSyncQueue = [];
  }

  return favoriteSyncQueue;
}

export function listMenuFavoriteSyncQueue(userId?: number | null) {
  if (!Number.isFinite(userId ?? NaN) || !userId) {
    return [...favoriteSyncQueue];
  }

  return favoriteSyncQueue.filter((item) => item.userId === userId);
}

export async function replaceMenuFavoriteSyncQueue(items: MenuFavoriteSyncQueueItem[]) {
  favoriteSyncQueue = (Array.isArray(items) ? items : [])
    .map((item) => normalizeQueueItem(item))
    .filter(isMenuFavoriteSyncQueueItem);
  await persistQueue();
  return favoriteSyncQueue;
}
