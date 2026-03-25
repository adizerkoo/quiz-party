import * as FileSystem from 'expo-file-system/legacy';

import { CreateScreenDraft } from '@/features/create/types';

const DRAFT_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const DRAFT_FILE = `${DRAFT_DIRECTORY}create-draft.json`;

// Убедиться, что директория для черновиков существует.
async function ensureDraftDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(DRAFT_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DRAFT_DIRECTORY, { intermediates: true });
  }
}

// Загрузить черновик экрана создания квиза из локального файла.
export async function loadCreateDraft() {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  try {
    const info = await FileSystem.getInfoAsync(DRAFT_FILE);
    if (!info.exists) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(DRAFT_FILE);
    return JSON.parse(raw) as CreateScreenDraft;
  } catch (error) {
    return null;
  }
}

// Сохранить черновик текущей формы.
export async function saveCreateDraft(draft: CreateScreenDraft) {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureDraftDirectory();
    await FileSystem.writeAsStringAsync(DRAFT_FILE, JSON.stringify(draft));
  } catch (error) {
    // Ошибка сохранения черновика не должна ломать основной экран.
  }
}

// Удалить локальный черновик после успешного запуска игры.
export async function clearCreateDraft() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(DRAFT_FILE);
    if (info.exists) {
      await FileSystem.deleteAsync(DRAFT_FILE, { idempotent: true });
    }
  } catch (error) {
    // Игнорируем, чтобы не мешать основному сценарию.
  }
}
