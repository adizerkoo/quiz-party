import { CreateQuestionDraft, CreateQuizQuestion } from '@/features/create/types';

// Ограничения экрана создания квиза.
export const CREATE_MIN_OPTIONS = 2;
export const CREATE_MAX_OPTIONS = 6;
export const CREATE_DEFAULT_OPTIONS = 4;

// Собрать массив непустых trimmed-опций.
export function normalizeOptions(options: string[]) {
  return options.map((item) => item.trim());
}

// Построить вопрос для сохранения из текущего состояния формы.
export function buildQuestionFromDraft(draft: CreateQuestionDraft): CreateQuizQuestion {
  if (draft.questionType === 'text') {
    return {
      text: draft.questionText.trim(),
      type: 'text',
      correct: draft.correctText.trim(),
      options: null,
      source_question_public_id: draft.sourceQuestionPublicId ?? null,
    };
  }

  const normalizedOptions = normalizeOptions(draft.options);
  const correctOption = normalizedOptions[draft.selectedCorrectIndex] ?? normalizedOptions[0] ?? '';

  return {
    text: draft.questionText.trim(),
    type: 'options',
    correct: correctOption,
    options: normalizedOptions,
    source_question_public_id: draft.sourceQuestionPublicId ?? null,
  };
}

// Проверка формы одного вопроса перед добавлением в список.
// Возвращает null, если всё валидно, иначе текст ошибки.
export function validateQuestionDraft(draft: CreateQuestionDraft) {
  if (!draft.questionText.trim()) {
    return 'Введите текст вопроса!';
  }

  if (draft.questionType === 'text') {
    if (!draft.correctText.trim()) {
      return 'Укажите правильный ответ!';
    }
    return null;
  }

  const normalizedOptions = normalizeOptions(draft.options);

  for (let index = 0; index < normalizedOptions.length; index += 1) {
    if (!normalizedOptions[index]) {
      return `Заполните вариант ${index + 1}!`;
    }
  }

  const correctOption = normalizedOptions[draft.selectedCorrectIndex];
  if (!correctOption) {
    return 'Выберите правильный вариант!';
  }

  return null;
}

// Проверка всего квиза перед отправкой на backend.
// Возвращает текст первой найденной ошибки или null.
export function validateQuizBeforeLaunch(title: string, questions: CreateQuizQuestion[]) {
  if (!title.trim()) {
    return 'Введите название вечеринки!';
  }

  if (questions.length === 0) {
    return 'Добавьте хотя бы один вопрос!';
  }

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];

    if (!question.text.trim()) {
      return `Вопрос №${index + 1} не заполнен!`;
    }

    if (question.type === 'text' && !question.correct.trim()) {
      return `Вопрос №${index + 1}: укажите правильный ответ!`;
    }

    if (question.type === 'options') {
      if (!question.options || question.options.length < CREATE_MIN_OPTIONS) {
        return `Вопрос №${index + 1}: добавьте варианты ответа!`;
      }

      if (question.options.some((item) => !item.trim())) {
        return `Вопрос №${index + 1}: заполните все варианты ответа!`;
      }

      if (!question.options.includes(question.correct)) {
        return `Вопрос №${index + 1}: выберите правильный вариант!`;
      }
    }
  }

  return null;
}

// Создать пустой стартовый черновик вопроса.
export function createEmptyQuestionDraft(): CreateQuestionDraft {
  return {
    questionText: '',
    questionType: 'options',
    correctText: '',
    options: Array.from({ length: CREATE_DEFAULT_OPTIONS }, () => ''),
    selectedCorrectIndex: 0,
    sourceQuestionPublicId: null,
  };
}
