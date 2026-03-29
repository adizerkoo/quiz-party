// Тип ответа в вопросе.
export type CreateQuestionType = 'text' | 'options';

// Вопрос в том виде, в котором он отправляется на backend.
export type CreateQuizQuestion = {
  text: string;
  type: CreateQuestionType;
  correct: string;
  options: string[] | null;
  source_question_public_id?: string | null;
};

// Вопрос из библиотеки идей.
// Отличается только наличием категории.
export type CreateLibraryQuestion = CreateQuizQuestion & {
  public_id?: string;
  cat?: string;
  source?: 'system' | 'user';
  visibility?: 'public' | 'private';
  category_title?: string | null;
  is_favorite?: boolean;
  sync_state?: 'synced' | 'pending_add';
};

// Набор фильтров для библиотеки.
export type CreateLibraryCategoryId =
  | 'all'
  | 'favorites'
  | 'about-me'
  | 'funny'
  | 'music'
  | 'sports'
  | 'movie'
  | 'friends';

// Описание категории для UI-чипа.
export type CreateLibraryCategory = {
  id: CreateLibraryCategoryId;
  label: string;
};

// Состояние формы текущего редактируемого вопроса.
export type CreateQuestionDraft = {
  questionText: string;
  questionType: CreateQuestionType;
  correctText: string;
  options: string[];
  selectedCorrectIndex: number;
  sourceQuestionPublicId?: string | null;
};

// Полный черновик экрана, который сохраняем локально.
export type CreateScreenDraft = {
  title: string;
  questions: CreateQuizQuestion[];
  questionDraft: CreateQuestionDraft;
};

// Короткое toast-уведомление.
export type CreateToastItem = {
  id: string;
  message: string;
};

export type CreateTemplateDraft = {
  template_public_id: string;
  title: string;
  total_questions: number;
  questions: CreateQuizQuestion[];
};
