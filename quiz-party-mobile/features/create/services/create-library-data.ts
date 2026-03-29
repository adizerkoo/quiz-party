import { CreateLibraryQuestion } from '@/features/create/types';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';

import { fetchCreateLibraryQuestions } from '@/features/create/services/create-api';
import {
  getCachedCreateLibraryQuestions,
  hydrateCreateLibraryCache,
  setCachedCreateLibraryQuestions,
} from '@/features/create/store/create-library-cache';

type FetchCreatePublicLibraryParams = {
  userId?: number | null;
  installationPublicId?: string | null;
  sessionToken?: string | null;
  originScreen?: 'create' | 'profile' | 'history';
};

type CreateLibraryFetchResult = {
  entries: CreateLibraryQuestion[];
  source: 'network' | 'cache';
  cachedAt: string | null;
};

const logger = createFeatureLogger('native.create.library-data');

function normalizePublicLibraryEntries(entries: CreateLibraryQuestion[]) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    is_favorite: false,
  }));
}

export function syncLibraryQuestionsWithFavorites(
  publicQuestions: CreateLibraryQuestion[],
  favorites: CreateLibraryQuestion[],
) {
  const favoriteKeys = new Set(
    (Array.isArray(favorites) ? favorites : [])
      .map((item) => item.source_question_public_id ?? item.public_id)
      .filter(Boolean),
  );

  return (Array.isArray(publicQuestions) ? publicQuestions : []).map((question) => ({
    ...question,
    is_favorite: favoriteKeys.has(question.source_question_public_id ?? question.public_id),
  }));
}

export async function fetchCreatePublicLibraryWithCache(
  params: FetchCreatePublicLibraryParams = {},
) {
  try {
    const entries = normalizePublicLibraryEntries(await fetchCreateLibraryQuestions({
      scope: 'public',
      userId: params.userId ?? null,
      installationPublicId: params.installationPublicId ?? null,
      sessionToken: params.sessionToken ?? null,
      originScreen: params.originScreen ?? 'create',
    }));
    const cachedRecord = await setCachedCreateLibraryQuestions(entries);
    logger.info('library.load.succeeded', {
      source: 'network',
      resultCount: cachedRecord?.entries.length ?? 0,
    });

    return {
      entries: cachedRecord?.entries ?? [],
      source: 'network',
      cachedAt: cachedRecord?.cachedAt ?? null,
    } satisfies CreateLibraryFetchResult;
  } catch (error) {
    await hydrateCreateLibraryCache();

    const cachedRecord = getCachedCreateLibraryQuestions();
    if (cachedRecord) {
      logger.info('library.load.succeeded', {
        source: 'cache',
        resultCount: cachedRecord.entries.length,
      });
      return {
        entries: cachedRecord.entries,
        source: 'cache',
        cachedAt: cachedRecord.cachedAt ?? null,
      } satisfies CreateLibraryFetchResult;
    }

    logger.warn('library.load.failed', {
      source: 'cache',
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}
