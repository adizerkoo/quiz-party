// Базовые типы для native-меню.

export type MenuProfile = {
  id?: number | null;
  publicId?: string | null;
  installationPublicId?: string | null;
  name: string;
  emoji: string;
};

export type ProfileModalMode = 'create' | 'edit';
