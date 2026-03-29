import {
  CreateLibraryQuestion,
  CreateQuizQuestion,
  CreateTemplateDraft,
} from '@/features/create/types';
import {
  ensureOwnerMenuProfile,
  fetchWithMenuProfileAuth,
} from '@/features/menu/services/menu-profile-api';
import { MenuProfile } from '@/features/menu/types';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

type CreateQuizResponse = {
  id: number;
  code: string;
  title: string;
  host_token?: string | null;
  template_public_id?: string | null;
};

type LibraryApiQuestion = {
  public_id: string;
  text: string;
  type: 'text' | 'options';
  correct: string;
  options?: string[] | null;
  source_question_public_id?: string | null;
  source: 'system' | 'user';
  visibility: 'public' | 'private';
  category_slug?: string | null;
  category_title?: string | null;
  is_favorite: boolean;
};

type FetchLibraryParams = {
  scope?: 'public' | 'favorites';
  userId?: number | null;
  installationPublicId?: string | null;
  sessionToken?: string | null;
  category?: string | null;
  search?: string | null;
  originScreen?: 'create' | 'profile' | 'history';
};

type FavoriteMutationParams = {
  userId: number;
  installationPublicId?: string | null;
  sessionToken?: string | null;
  originScreen?: 'create' | 'profile' | 'history';
  sourceQuestionPublicId?: string | null;
  question?: CreateQuizQuestion | null;
};

const logger = createFeatureLogger('native.create.api');

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : '';
}

function toCreateLibraryQuestion(payload: LibraryApiQuestion): CreateLibraryQuestion {
  return {
    public_id: payload.public_id,
    text: payload.text,
    type: payload.type,
    correct: payload.correct,
    options: payload.options ?? null,
    source_question_public_id: payload.source_question_public_id ?? payload.public_id,
    source: payload.source,
    visibility: payload.visibility,
    cat: payload.category_slug ?? undefined,
    category_title: payload.category_title ?? null,
    is_favorite: payload.is_favorite,
  };
}

function buildFavoriteBody(params: FavoriteMutationParams) {
  return {
    user_id: params.userId,
    installation_public_id: params.installationPublicId ?? null,
    origin_screen: params.originScreen ?? 'create',
    source_question_public_id: params.sourceQuestionPublicId ?? null,
    question: params.question ?? null,
  };
}

function buildAuthProfile(params: {
  userId?: number | null;
  installationPublicId?: string | null;
  sessionToken?: string | null;
}) {
  if (!params.userId) {
    return null;
  }

  return {
    id: params.userId,
    installationPublicId: params.installationPublicId ?? null,
    sessionToken: params.sessionToken ?? null,
    name: '',
    emoji: '',
  } satisfies MenuProfile;
}

export async function fetchCreateLibraryQuestions(params: FetchLibraryParams = {}) {
  const query = buildQuery({
    scope: params.scope ?? 'public',
    user_id: params.userId ?? null,
    installation_public_id: params.installationPublicId ?? null,
    category: params.category ?? null,
    search: params.search ?? null,
    origin_screen: params.originScreen ?? 'create',
  });
  logger.info('library.load.started', {
    scope: params.scope ?? 'public',
    category: params.category ?? null,
  });

  const authProfile = buildAuthProfile({
    userId: params.userId ?? null,
    installationPublicId: params.installationPublicId ?? null,
    sessionToken: params.sessionToken ?? null,
  });
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/library/questions${query}`,
    undefined,
    authProfile,
    {
      required: false,
      retryAnonymouslyOnAuthFailure: true,
    },
  );
  if (!response.ok) {
    logger.warn('library.load.failed', {
      scope: params.scope ?? 'public',
      status: response.status,
    });
    throw new Error(`Failed to load questions library: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LibraryApiQuestion[];
  const items = Array.isArray(payload) ? payload.map(toCreateLibraryQuestion) : [];
  logger.info('library.load.succeeded', {
    scope: params.scope ?? 'public',
    resultCount: items.length,
  });
  return items;
}

export async function fetchFavoriteQuestions(params: {
  userId: number;
  installationPublicId?: string | null;
  sessionToken?: string | null;
  category?: string | null;
  search?: string | null;
  originScreen?: 'create' | 'profile' | 'history';
}) {
  const query = buildQuery({
    user_id: params.userId,
    installation_public_id: params.installationPublicId ?? null,
    category: params.category ?? null,
    search: params.search ?? null,
    origin_screen: params.originScreen ?? 'create',
  });

  logger.info('favorites.load.started', {
    category: params.category ?? null,
  });

  const authProfile = buildAuthProfile({
    userId: params.userId,
    installationPublicId: params.installationPublicId ?? null,
    sessionToken: params.sessionToken ?? null,
  });
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/me/favorites/questions${query}`,
    undefined,
    authProfile,
  );
  if (!response.ok) {
    logger.warn('favorites.load.failed', {
      status: response.status,
    });
    throw new Error(`Failed to load favorite questions: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LibraryApiQuestion[];
  const items = Array.isArray(payload) ? payload.map(toCreateLibraryQuestion) : [];
  logger.info('favorites.load.succeeded', {
    resultCount: items.length,
  });
  return items;
}

export async function addFavoriteQuestion(params: FavoriteMutationParams) {
  logger.info('favorite.toggle.started', {
    mode: params.sourceQuestionPublicId ? 'existing' : 'custom',
    originScreen: params.originScreen ?? 'create',
  });

  const authProfile = buildAuthProfile({
    userId: params.userId,
    installationPublicId: params.installationPublicId ?? null,
    sessionToken: params.sessionToken ?? null,
  });
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/me/favorites/questions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFavoriteBody(params)),
    },
    authProfile,
  );
  if (!response.ok) {
    logger.warn('favorite.toggle.failed', {
      mode: params.sourceQuestionPublicId ? 'existing' : 'custom',
      status: response.status,
    });
    throw new Error(`Failed to add favorite question: HTTP ${response.status}`);
  }

  const payload = toCreateLibraryQuestion((await response.json()) as LibraryApiQuestion);
  logger.info('favorite.toggle.succeeded', {
    questionPublicId: payload.public_id ?? null,
    mode: params.sourceQuestionPublicId ? 'existing' : 'custom',
  });
  return payload;
}

export async function removeFavoriteQuestion(params: {
  userId: number;
  installationPublicId?: string | null;
  sessionToken?: string | null;
  questionPublicId: string;
  originScreen?: 'create' | 'profile' | 'history';
}) {
  const query = buildQuery({
    user_id: params.userId,
    installation_public_id: params.installationPublicId ?? null,
    origin_screen: params.originScreen ?? 'create',
  });

  logger.info('favorite.toggle.started', {
    mode: 'remove',
    questionPublicId: params.questionPublicId,
    originScreen: params.originScreen ?? 'create',
  });

  const authProfile = buildAuthProfile({
    userId: params.userId,
    installationPublicId: params.installationPublicId ?? null,
    sessionToken: params.sessionToken ?? null,
  });
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/me/favorites/questions/${params.questionPublicId}${query}`,
    {
      method: 'DELETE',
    },
    authProfile,
  );
  if (!response.ok) {
    logger.warn('favorite.toggle.failed', {
      mode: 'remove',
      questionPublicId: params.questionPublicId,
      status: response.status,
    });
    throw new Error(`Failed to remove favorite question: HTTP ${response.status}`);
  }

  logger.info('favorite.toggle.succeeded', {
    mode: 'remove',
    questionPublicId: params.questionPublicId,
  });
}

export async function fetchTemplateDraft(params: {
  templatePublicId: string;
  userId: number;
  installationPublicId?: string | null;
  sessionToken?: string | null;
  originScreen?: 'create' | 'profile' | 'history';
}) {
  const query = buildQuery({
    user_id: params.userId,
    installation_public_id: params.installationPublicId ?? null,
    origin_screen: params.originScreen ?? 'history',
  });

  const authProfile = buildAuthProfile({
    userId: params.userId,
    installationPublicId: params.installationPublicId ?? null,
    sessionToken: params.sessionToken ?? null,
  });
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/templates/${params.templatePublicId}/draft${query}`,
    undefined,
    authProfile,
  );
  if (!response.ok) {
    throw new Error(`Failed to load template draft: HTTP ${response.status}`);
  }

  return (await response.json()) as CreateTemplateDraft;
}

// Убедиться, что профиль владельца уже есть в backend.
// Если сеть временно недоступна, локальный pending-профиль дожидается
// следующего успешного онлайнового действия.
export async function ensureOwnerProfile(profile: MenuProfile | null) {
  return ensureOwnerMenuProfile(profile);
}

// Создать квиз на backend и вернуть код комнаты.
export async function createQuizRequest(params: {
  title: string;
  questions: CreateQuizQuestion[];
  ownerId?: number | null;
  ownerInstallationPublicId?: string | null;
  ownerSessionToken?: string | null;
}) {
  let response: Response;
  if (params.ownerId) {
    const authProfile = buildAuthProfile({
      userId: params.ownerId,
      installationPublicId: params.ownerInstallationPublicId ?? null,
      sessionToken: params.ownerSessionToken ?? null,
    });
    ({ response } = await fetchWithMenuProfileAuth(
      `${WEB_APP_ORIGIN}/api/v1/quizzes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          questions: params.questions,
          owner_id: params.ownerId ?? null,
        }),
      },
      authProfile,
    ));
  } else {
    response = await fetch(`${WEB_APP_ORIGIN}/api/v1/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: params.title,
        questions: params.questions,
        owner_id: null,
      }),
    });
  }

  if (!response.ok) {
    throw new Error(`Failed to create quiz: HTTP ${response.status}`);
  }

  return (await response.json()) as CreateQuizResponse;
}
