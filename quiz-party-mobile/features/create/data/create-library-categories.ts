import { CreateLibraryCategory } from '@/features/create/types';

// Категории библиотеки вопросов.
// Подписи оставлены такими же, как в web-версии.
export const CREATE_LIBRARY_CATEGORIES: CreateLibraryCategory[] = [
  { id: 'all', label: 'Все' },
  { id: 'favorites', label: 'Избранные' },
  { id: 'about-me', label: 'Обо мне' },
  { id: 'funny', label: 'Юмор' },
  { id: 'music', label: 'Музыка' },
  { id: 'sports', label: 'Спорт' },
  { id: 'movie', label: 'Фильмы' },
  { id: 'friends', label: 'О нас' },
];
