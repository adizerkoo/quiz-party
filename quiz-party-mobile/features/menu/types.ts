import type { CreateLibraryQuestion } from '@/features/create/types';

// Базовые типы для native-меню.

export type MenuProfile = {
  id?: number | null;
  publicId?: string | null;
  installationPublicId?: string | null;
  name: string;
  emoji: string;
};

export type MenuHistoryEntry = {
  quiz_code: string;
  title: string;
  started_at?: string | null;
  finished_at?: string | null;
  game_status: 'waiting' | 'playing' | 'finished' | 'cancelled' | string;
  cancel_reason?: string | null;
  participant_status: 'joined' | 'disconnected' | 'kicked' | 'left' | 'finished' | string;
  score?: number | null;
  final_rank?: number | null;
  is_winner: boolean;
  winner_names: string[];
  can_open_results: boolean;
  template_public_id?: string | null;
  is_host_game: boolean;
  can_repeat: boolean;
};

export type MenuFavoriteQuestion = CreateLibraryQuestion;

export type ProfileModalMode = 'create' | 'edit';
export type ProfileScreenTab = 'profile' | 'history' | 'favorites';
export type MenuHistorySortMode = 'time' | 'wins' | 'host';
export type MenuHistoryFetchSource = 'network' | 'cache';
export type MenuFavoriteFetchSource = 'network' | 'cache';

export type MenuHistoryFetchResult = {
  entries: MenuHistoryEntry[];
  source: MenuHistoryFetchSource;
  cachedAt: string | null;
};

export type MenuFavoriteFetchResult = {
  entries: MenuFavoriteQuestion[];
  source: MenuFavoriteFetchSource;
  cachedAt: string | null;
};
