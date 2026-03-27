import { CreateLibraryQuestion, CreateQuizQuestion } from '@/features/create/types';
import { ensureOwnerMenuProfile } from '@/features/menu/services/menu-profile-api';
import { MenuProfile } from '@/features/menu/types';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

type CreateQuizResponse = {
  id: number;
  code: string;
  title: string;
  host_token?: string | null;
};

// Загрузить библиотеку готовых вопросов.
export async function fetchCreateLibraryQuestions() {
  const response = await fetch(`${WEB_APP_ORIGIN}/data/questions.json`);
  if (!response.ok) {
    throw new Error(`Failed to load questions library: HTTP ${response.status}`);
  }

  return (await response.json()) as CreateLibraryQuestion[];
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
