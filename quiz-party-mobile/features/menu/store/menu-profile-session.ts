import { MenuProfile } from '@/features/menu/types';

// Простое in-memory хранилище профиля для текущей сессии приложения.
// Оно нужно, чтобы профиль из native-меню не пропадал при переходе
// на другие экраны внутри одного запуска приложения.
let currentMenuProfile: MenuProfile | null = null;

// Получить профиль, который уже был создан в текущей сессии.
export function getMenuSessionProfile() {
  return currentMenuProfile;
}

// Сохранить профиль в памяти приложения.
export function setMenuSessionProfile(profile: MenuProfile | null) {
  currentMenuProfile = profile;
}
