import { CreateLibraryQuestion, CreateQuizQuestion } from '@/features/create/types';
import {
  addFavoriteQuestion,
  fetchFavoriteQuestions,
  removeFavoriteQuestion,
} from '@/features/create/services/create-api';
import { ensureMenuProfileSession } from '@/features/menu/services/menu-profile-api';
import {
  getCachedMenuFavorites,
  hydrateMenuFavoritesCache,
  setCachedMenuFavorites,
} from '@/features/menu/store/menu-favorites-cache';
import {
  hydrateMenuFavoriteSyncQueue,
  listMenuFavoriteSyncQueue,
  MenuFavoriteSyncQueueItem,
  replaceMenuFavoriteSyncQueue,
} from '@/features/menu/store/menu-favorites-sync-queue';
import { MenuFavoriteFetchResult, MenuFavoriteQuestion, MenuProfile } from '@/features/menu/types';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';

const logger = createFeatureLogger('native.menu.favorites');
const LOCAL_FAVORITE_PREFIX = 'local-favorite:';
const activeFavoriteSyncByUserId = new Map<number, Promise<MenuProfile>>();

type FavoriteOriginScreen = 'create' | 'profile' | 'history';

type AddMenuFavoriteParams = {
  question: CreateQuizQuestion | MenuFavoriteQuestion;
  sourceQuestionPublicId?: string | null;
  originScreen?: FavoriteOriginScreen;
};

function makeLocalFavoritePublicId() {
  return `${LOCAL_FAVORITE_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isLocalFavoritePublicId(publicId: string | null | undefined) {
  return typeof publicId === 'string' && publicId.startsWith(LOCAL_FAVORITE_PREFIX);
}

function parseErrorStatus(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const matchedStatus = error.message.match(/HTTP (\d{3})/);
  if (!matchedStatus) {
    return null;
  }

  const status = Number(matchedStatus[1]);
  return Number.isFinite(status) ? status : null;
}

function isRetryableFavoriteError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  const status = parseErrorStatus(error);
  if (!status) {
    return false;
  }

  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isFavoriteNotFoundError(error: unknown) {
  return parseErrorStatus(error) === 404;
}

function favoriteIdentity(entry: MenuFavoriteQuestion) {
  return (
    entry.public_id
    ?? entry.source_question_public_id
    ?? `${entry.source ?? 'unknown'}:${entry.type}:${entry.text}:${entry.correct}`
  );
}

function normalizeFavoriteEntry(entry: MenuFavoriteQuestion) {
  return {
    ...entry,
    is_favorite: true,
    sync_state: entry.sync_state === 'pending_add' ? 'pending_add' : 'synced',
  } satisfies MenuFavoriteQuestion;
}

function dedupeFavoriteEntries(entries: MenuFavoriteQuestion[]) {
  const seen = new Set<string>();
  const result: MenuFavoriteQuestion[] = [];

  entries.forEach((entry) => {
    const key = favoriteIdentity(entry);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(normalizeFavoriteEntry(entry));
  });

  return result;
}

function favoriteMatchesPublicId(entry: MenuFavoriteQuestion, questionPublicId: string) {
  return entry.public_id === questionPublicId || entry.source_question_public_id === questionPublicId;
}

function applyQueuedFavoriteMutations(entries: MenuFavoriteQuestion[], userId: number) {
  const queuedItems = listMenuFavoriteSyncQueue(userId)
    .slice()
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));

  let nextEntries = dedupeFavoriteEntries(entries);

  queuedItems.forEach((item) => {
    if (item.action === 'remove') {
      nextEntries = nextEntries.filter((entry) => !favoriteMatchesPublicId(entry, item.questionPublicId));
      return;
    }

    if (!item.optimisticEntry) {
      return;
    }

    const optimisticEntry = normalizeFavoriteEntry({
      ...item.optimisticEntry,
      sync_state: 'pending_add',
    });

    nextEntries = [
      optimisticEntry,
      ...nextEntries.filter((entry) => !favoriteMatchesPublicId(entry, item.questionPublicId)),
    ];
    nextEntries = dedupeFavoriteEntries(nextEntries);
  });

  return nextEntries;
}

function stripFavoriteQueueTarget(
  queue: MenuFavoriteSyncQueueItem[],
  userId: number,
  questionPublicId: string,
) {
  let removedPendingAdd = false;

  const nextQueue = queue.filter((item) => {
    const isTarget = item.userId === userId && item.questionPublicId === questionPublicId;
    if (!isTarget) {
      return true;
    }

    removedPendingAdd = removedPendingAdd || item.action === 'add';
    return false;
  });

  return {
    nextQueue,
    removedPendingAdd,
  };
}

function resolveRemoteSourceQuestionPublicId(
  question: CreateQuizQuestion | MenuFavoriteQuestion,
  explicitSourceQuestionPublicId?: string | null,
) {
  const explicitPublicId = String(explicitSourceQuestionPublicId ?? '').trim();
  if (explicitPublicId && !isLocalFavoritePublicId(explicitPublicId)) {
    return explicitPublicId;
  }

  const questionSourcePublicId = String(question.source_question_public_id ?? '').trim();
  if (questionSourcePublicId && !isLocalFavoritePublicId(questionSourcePublicId)) {
    return questionSourcePublicId;
  }

  const questionPublicId = String((question as MenuFavoriteQuestion).public_id ?? '').trim();
  if (questionPublicId && !isLocalFavoritePublicId(questionPublicId)) {
    return questionPublicId;
  }

  return null;
}

function buildOptimisticFavoriteEntry(params: {
  question: CreateQuizQuestion | MenuFavoriteQuestion;
  sourceQuestionPublicId?: string | null;
}) {
  const remoteSourceQuestionPublicId = resolveRemoteSourceQuestionPublicId(
    params.question,
    params.sourceQuestionPublicId,
  );
  const isExistingQuestion = Boolean(remoteSourceQuestionPublicId);
  const questionPublicId = remoteSourceQuestionPublicId ?? makeLocalFavoritePublicId();
  const question = params.question as MenuFavoriteQuestion;

  return {
    public_id: questionPublicId,
    text: params.question.text,
    type: params.question.type,
    correct: params.question.correct,
    options: params.question.options ?? null,
    source_question_public_id: remoteSourceQuestionPublicId ?? questionPublicId,
    source: question.source ?? (isExistingQuestion ? 'system' : 'user'),
    visibility: question.visibility ?? (isExistingQuestion ? 'public' : 'private'),
    cat: question.cat ?? undefined,
    category_title: question.category_title ?? null,
    is_favorite: true,
    sync_state: 'pending_add',
  } satisfies MenuFavoriteQuestion;
}

async function saveFavoriteEntries(userId: number, entries: MenuFavoriteQuestion[]) {
  return setCachedMenuFavorites(userId, dedupeFavoriteEntries(entries));
}

function schedulePendingFavoriteSync(profile: MenuProfile) {
  const userId = profile.id ?? null;
  if (!userId) {
    return;
  }

  const initialQueueIds = new Set(listMenuFavoriteSyncQueue(userId).map((item) => item.id));

  void syncPendingMenuFavorites(profile)
    .then(async () => {
      const hasNewQueuedItems = listMenuFavoriteSyncQueue(userId)
        .some((item) => !initialQueueIds.has(item.id));
      if (!hasNewQueuedItems) {
        return;
      }

      await syncPendingMenuFavorites(profile);
    })
    .catch((error) => {
      logger.warn('favorites.sync.scheduled_failed', {
        userId,
        message: error instanceof Error ? error.message : 'unknown_error',
      });
    });
}

async function syncPendingMenuFavorites(profile: MenuProfile) {
  const userId = profile.id ?? null;
  if (!userId) {
    return profile;
  }

  const activePromise = activeFavoriteSyncByUserId.get(userId);
  if (activePromise) {
    return activePromise;
  }

  const nextPromise = (async () => {
    await hydrateMenuFavoriteSyncQueue();
    let activeProfile = profile;
    const queuedItems = listMenuFavoriteSyncQueue(userId)
      .slice()
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));

    for (const item of queuedItems) {
      try {
        const authenticatedProfile = await ensureMenuProfileSession(activeProfile);
        if (!authenticatedProfile?.id) {
          throw new Error('Profile session is unavailable for favorites sync');
        }
        activeProfile = authenticatedProfile;

        if (item.action === 'add') {
          const favorite = await addFavoriteQuestion({
            userId,
            installationPublicId:
              activeProfile.installationPublicId ?? profile.installationPublicId ?? null,
            sessionToken: activeProfile.sessionToken ?? profile.sessionToken ?? null,
            originScreen: item.originScreen,
            sourceQuestionPublicId: item.sourceQuestionPublicId ?? null,
            question: item.question ?? null,
          });

          const currentEntries = getCachedMenuFavorites(userId)?.entries ?? [];
          await saveFavoriteEntries(userId, [
            { ...favorite, sync_state: 'synced' },
            ...currentEntries.filter((entry) => !favoriteMatchesPublicId(entry, item.questionPublicId)),
          ]);
        } else {
          await removeFavoriteQuestion({
            userId,
            installationPublicId:
              activeProfile.installationPublicId ?? profile.installationPublicId ?? null,
            sessionToken: activeProfile.sessionToken ?? profile.sessionToken ?? null,
            questionPublicId: item.questionPublicId,
            originScreen: item.originScreen,
          });
        }

        const nextQueue = listMenuFavoriteSyncQueue().filter((queuedItem) => queuedItem.id !== item.id);
        await replaceMenuFavoriteSyncQueue(nextQueue);
      } catch (error) {
        if (item.action === 'remove' && isFavoriteNotFoundError(error)) {
          const nextQueue = listMenuFavoriteSyncQueue().filter((queuedItem) => queuedItem.id !== item.id);
          await replaceMenuFavoriteSyncQueue(nextQueue);
          continue;
        }

        logger.warn('favorites.sync.failed', {
          userId,
          action: item.action,
          questionPublicId: item.questionPublicId,
          message: error instanceof Error ? error.message : 'unknown_error',
        });
        break;
      }
    }

    return activeProfile;
  })();

  activeFavoriteSyncByUserId.set(userId, nextPromise);

  try {
    return await nextPromise;
  } finally {
    activeFavoriteSyncByUserId.delete(userId);
  }
}

export async function fetchMenuFavorites(
  profile: Pick<MenuProfile, 'id' | 'installationPublicId' | 'sessionToken'>,
  options?: { originScreen?: FavoriteOriginScreen },
) {
  const userId = profile.id;
  if (!userId) {
    return {
      entries: [],
      source: 'cache',
      cachedAt: null,
    } satisfies MenuFavoriteFetchResult;
  }

  await Promise.all([
    hydrateMenuFavoritesCache(),
    hydrateMenuFavoriteSyncQueue(),
  ]);

  const originScreen = options?.originScreen ?? 'profile';
  const optimisticCachedEntries = applyQueuedFavoriteMutations(
    getCachedMenuFavorites(userId)?.entries ?? [],
    userId,
  );
  if (optimisticCachedEntries.length) {
    await saveFavoriteEntries(userId, optimisticCachedEntries);
  }

  try {
    const authenticatedProfile = await syncPendingMenuFavorites(profile as MenuProfile);
    const entries = await fetchFavoriteQuestions({
      userId,
      installationPublicId:
        authenticatedProfile?.installationPublicId ?? profile.installationPublicId ?? null,
      sessionToken: authenticatedProfile?.sessionToken ?? profile.sessionToken ?? null,
      originScreen,
    });
    const mergedEntries = applyQueuedFavoriteMutations(entries, userId);
    const cachedRecord = await saveFavoriteEntries(userId, mergedEntries);

    return {
      entries: cachedRecord?.entries ?? [],
      source: 'network',
      cachedAt: cachedRecord?.cachedAt ?? null,
    } satisfies MenuFavoriteFetchResult;
  } catch (error) {
    const cachedEntries = applyQueuedFavoriteMutations(
      getCachedMenuFavorites(userId)?.entries ?? [],
      userId,
    );

    if (cachedEntries.length || getCachedMenuFavorites(userId)) {
      const cachedRecord = await saveFavoriteEntries(userId, cachedEntries);
      return {
        entries: cachedRecord?.entries ?? [],
        source: 'cache',
        cachedAt: cachedRecord?.cachedAt ?? null,
      } satisfies MenuFavoriteFetchResult;
    }

    throw error;
  }
}

export async function addMenuFavorite(
  profile: MenuProfile,
  params: AddMenuFavoriteParams,
) {
  if (!profile.id) {
    throw new Error('Profile id is required for favorites');
  }

  await Promise.all([
    hydrateMenuFavoritesCache(),
    hydrateMenuFavoriteSyncQueue(),
  ]);

  const originScreen = params.originScreen ?? 'profile';
  const optimisticFavorite = buildOptimisticFavoriteEntry({
    question: params.question,
    sourceQuestionPublicId: params.sourceQuestionPublicId ?? null,
  });
  const currentEntries = applyQueuedFavoriteMutations(
    getCachedMenuFavorites(profile.id)?.entries ?? [],
    profile.id,
  );
  const nextEntries = [
    optimisticFavorite,
    ...currentEntries.filter((entry) => !favoriteMatchesPublicId(entry, optimisticFavorite.public_id ?? '')),
  ];
  const queue = listMenuFavoriteSyncQueue();
  const { nextQueue } = stripFavoriteQueueTarget(queue, profile.id, optimisticFavorite.public_id ?? '');
  const queueItem: MenuFavoriteSyncQueueItem = {
    id: `${Date.now()}-${Math.random()}`,
    userId: profile.id,
    action: 'add',
    questionPublicId: optimisticFavorite.public_id ?? makeLocalFavoritePublicId(),
    sourceQuestionPublicId:
      resolveRemoteSourceQuestionPublicId(params.question, params.sourceQuestionPublicId ?? null),
    question:
      resolveRemoteSourceQuestionPublicId(params.question, params.sourceQuestionPublicId ?? null)
        ? null
        : params.question,
    optimisticEntry: optimisticFavorite,
    originScreen,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    saveFavoriteEntries(profile.id, nextEntries),
    replaceMenuFavoriteSyncQueue([
      ...nextQueue,
      queueItem,
    ]),
  ]);

  schedulePendingFavoriteSync(profile);
  return optimisticFavorite;
}

export async function removeMenuFavorite(
  profile: MenuProfile,
  questionPublicId: string,
  options?: { originScreen?: FavoriteOriginScreen },
) {
  if (!profile.id) {
    throw new Error('Profile id is required for favorites');
  }

  if (!questionPublicId) {
    return;
  }

  await Promise.all([
    hydrateMenuFavoritesCache(),
    hydrateMenuFavoriteSyncQueue(),
  ]);

  const currentEntries = applyQueuedFavoriteMutations(
    getCachedMenuFavorites(profile.id)?.entries ?? [],
    profile.id,
  );
  const nextEntries = currentEntries.filter((entry) => !favoriteMatchesPublicId(entry, questionPublicId));
  await saveFavoriteEntries(profile.id, nextEntries);

  const originScreen = options?.originScreen ?? 'profile';
  const queue = listMenuFavoriteSyncQueue();
  const { nextQueue, removedPendingAdd } = stripFavoriteQueueTarget(queue, profile.id, questionPublicId);

  if (removedPendingAdd || isLocalFavoritePublicId(questionPublicId)) {
    await replaceMenuFavoriteSyncQueue(nextQueue);
    return;
  }

  await replaceMenuFavoriteSyncQueue([
    ...nextQueue,
    {
      id: `${Date.now()}-${Math.random()}`,
      userId: profile.id,
      action: 'remove',
      questionPublicId,
      sourceQuestionPublicId: null,
      question: null,
      optimisticEntry: null,
      originScreen,
      createdAt: new Date().toISOString(),
    },
  ]);

  schedulePendingFavoriteSync(profile);
}
