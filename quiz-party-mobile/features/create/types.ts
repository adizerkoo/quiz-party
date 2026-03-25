// Тип ответа в вопросе.
export type CreateQuestionType = 'text' | 'options';

// Вопрос в том виде, в котором он отправляется на backend.
export type CreateQuizQuestion = {
  text: string;
  type: CreateQuestionType;
  correct: string;
  options: string[] | null;
};

// Вопрос из библиотеки идей.
// Отличается только наличием категории.
export type CreateLibraryQuestion = CreateQuizQuestion & {
  cat?: string;
};

// Набор фильтров для библиотеки.
export type CreateLibraryCategoryId =
  | 'all'
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
