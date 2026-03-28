import { MenuHistoryEntry } from '@/features/menu/types';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

export async function fetchMenuHistory(userId: number) {
  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${userId}/history`);

  if (!response.ok) {
    throw new Error(`Failed to load history: HTTP ${response.status}`);
  }

  return (await response.json()) as MenuHistoryEntry[];
}
