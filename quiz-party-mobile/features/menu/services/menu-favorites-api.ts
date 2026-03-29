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
import { MenuFavoriteFetchResult, MenuFavoriteQuestion, MenuProfile } from '@/features/menu/types';

export async function fetchMenuFavorites(
  profile: Pick<MenuProfile, 'id' | 'installationPublicId' | 'sessionToken'>,
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
    const authenticatedProfile = await ensureMenuProfileSession(profile as MenuProfile);
    const entries = await fetchFavoriteQuestions({
      userId,
      installationPublicId: authenticatedProfile?.installationPublicId ?? profile.installationPublicId ?? null,
      sessionToken: authenticatedProfile?.sessionToken ?? profile.sessionToken ?? null,
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

  const authenticatedProfile = await ensureMenuProfileSession(profile);
  const favorite = await addFavoriteQuestion({
    userId: profile.id,
    installationPublicId:
      authenticatedProfile?.installationPublicId ?? profile.installationPublicId ?? null,
    sessionToken: authenticatedProfile?.sessionToken ?? profile.sessionToken ?? null,
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

  const authenticatedProfile = await ensureMenuProfileSession(profile);
  await removeFavoriteQuestion({
    userId: profile.id,
    installationPublicId:
      authenticatedProfile?.installationPublicId ?? profile.installationPublicId ?? null,
    sessionToken: authenticatedProfile?.sessionToken ?? profile.sessionToken ?? null,
    questionPublicId,
    originScreen: 'profile',
  });

  const current = getCachedMenuFavorites(profile.id)?.entries ?? [];
  const nextEntries = current.filter((item) => item.public_id !== questionPublicId);
  await setCachedMenuFavorites(profile.id, nextEntries);
}
