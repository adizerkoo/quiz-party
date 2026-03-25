import { Platform } from 'react-native';

import { CreateLibraryQuestion, CreateQuizQuestion } from '@/features/create/types';
import { MenuProfile } from '@/features/menu/types';
import { setMenuSessionProfile } from '@/features/menu/store/menu-profile-session';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

type CreateQuizResponse = {
  id: number;
  code: string;
  title: string;
};

type ApiUserResponse = {
  id: number;
  username: string;
  avatar_emoji: string;
};

// Загрузить библиотеку готовых вопросов.
export async function fetchCreateLibraryQuestions() {
  const response = await fetch(`${WEB_APP_ORIGIN}/data/questions.json`);
  if (!response.ok) {
    throw new Error(`Failed to load questions library: HTTP ${response.status}`);
  }

  return (await response.json()) as CreateLibraryQuestion[];
}

// Убедиться, что у локального профиля есть backend-пользователь.
// Если id уже есть — пробуем обновить last_login_at через touch.
// Если id нет или запись исчезла — создаём пользователя заново.
export async function ensureOwnerProfile(profile: MenuProfile | null) {
  if (!profile) {
    return null;
  }

  const payload = {
    username: profile.name,
    avatar_emoji: profile.emoji,
    device_platform: Platform.OS,
    device_brand: null,
  };

  if (profile.id) {
    try {
      const touchResponse = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${profile.id}/touch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_platform: Platform.OS,
          device_brand: null,
        }),
      });

      if (touchResponse.ok) {
        const touched = (await touchResponse.json()) as ApiUserResponse;
        const syncedProfile: MenuProfile = {
          id: touched.id,
          name: touched.username,
          emoji: touched.avatar_emoji,
        };
        setMenuSessionProfile(syncedProfile);
        return syncedProfile;
      }
    } catch (error) {
      // Если touch не сработал, просто попробуем пересоздать запись.
    }
  }

  const createResponse = await fetch(`${WEB_APP_ORIGIN}/api/v1/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create owner profile: HTTP ${createResponse.status}`);
  }

  const created = (await createResponse.json()) as ApiUserResponse;
  const syncedProfile: MenuProfile = {
    id: created.id,
    name: created.username,
    emoji: created.avatar_emoji,
  };
  setMenuSessionProfile(syncedProfile);
  return syncedProfile;
}

// Создать квиз на backend и вернуть код комнаты.
export async function createQuizRequest(params: {
  title: string;
  questions: CreateQuizQuestion[];
  ownerId?: number | null;
}) {
  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      questions: params.questions,
      owner_id: params.ownerId ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create quiz: HTTP ${response.status}`);
  }

  return (await response.json()) as CreateQuizResponse;
}
