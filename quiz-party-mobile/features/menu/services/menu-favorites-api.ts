import {
  addFavoriteQuestion,
  fetchFavoriteQuestions,
  removeFavoriteQuestion,
} from '@/features/create/services/create-api';
import {
  getCachedMenuFavorites,
  hydrateMenuFavoritesCache,
  setCachedMenuFavorites,
} from '@/features/menu/store/menu-favorites-cache';
import { MenuFavoriteFetchResult, MenuFavoriteQuestion, MenuProfile } from '@/features/menu/types';

export async function fetchMenuFavorites(
  profile: Pick<MenuProfile, 'id' | 'installationPublicId'>,
) {
  const userId = profile.id;
  if (!userId) {
    return {
      entries: [],
      source: 'cache',
      cachedAt: null,
    } satisfies MenuFavoriteFetchResult;
  }

  try {
    const entries = await fetchFavoriteQuestions({
      userId,
      installationPublicId: profile.installationPublicId ?? null,
      originScreen: 'profile',
    });
    const cachedRecord = await setCachedMenuFavorites(userId, entries);

    return {
      entries: cachedRecord?.entries ?? [],
      source: 'network',
      cachedAt: cachedRecord?.cachedAt ?? null,
    } satisfies MenuFavoriteFetchResult;
  } catch (error) {
    await hydrateMenuFavoritesCache();

    const cachedRecord = getCachedMenuFavorites(userId);
    if (cachedRecord) {
      return {
        entries: cachedRecord.entries,
        source: 'cache',
        cachedAt: cachedRecord.cachedAt ?? null,
      } satisfies MenuFavoriteFetchResult;
    }

    throw error;
  }
}

export async function addMenuFavorite(profile: MenuProfile, question: MenuFavoriteQuestion) {
  if (!profile.id) {
    throw new Error('Profile id is required for favorites');
  }

  const favorite = await addFavoriteQuestion({
    userId: profile.id,
    installationPublicId: profile.installationPublicId ?? null,
    originScreen: 'profile',
    sourceQuestionPublicId: question.source_question_public_id ?? question.public_id ?? null,
    question,
  });
  const current = getCachedMenuFavorites(profile.id)?.entries ?? [];
  const nextEntries = [favorite, ...current.filter((item) => item.public_id !== favorite.public_id)];
  await setCachedMenuFavorites(profile.id, nextEntries);
  return favorite;
}

export async function removeMenuFavorite(profile: MenuProfile, questionPublicId: string) {
  if (!profile.id) {
    throw new Error('Profile id is required for favorites');
  }

  await removeFavoriteQuestion({
    userId: profile.id,
    installationPublicId: profile.installationPublicId ?? null,
    questionPublicId,
    originScreen: 'profile',
  });

  const current = getCachedMenuFavorites(profile.id)?.entries ?? [];
  const nextEntries = current.filter((item) => item.public_id !== questionPublicId);
  await setCachedMenuFavorites(profile.id, nextEntries);
}
