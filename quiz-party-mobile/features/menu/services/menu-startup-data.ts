import {
  fetchCreatePublicLibraryWithCache,
} from '@/features/create/services/create-library-data';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';

import { fetchMenuFavorites } from '@/features/menu/services/menu-favorites-api';
import { fetchMenuHistory } from '@/features/menu/services/menu-history-api';
import { MenuProfile } from '@/features/menu/types';

const logger = createFeatureLogger('native.menu.startup-data');

let inFlightStartupRefresh: Promise<void> | null = null;

export async function refreshStartupAppData(profile: MenuProfile | null) {
  if (inFlightStartupRefresh) {
    return inFlightStartupRefresh;
  }

  inFlightStartupRefresh = (async () => {
    logger.info('startup.refresh.started', {
      hasProfile: Boolean(profile?.id),
    });

    const tasks: Promise<unknown>[] = [
      fetchCreatePublicLibraryWithCache({
        userId: profile?.id ?? null,
        installationPublicId: profile?.installationPublicId ?? null,
        sessionToken: profile?.sessionToken ?? null,
        originScreen: 'create',
      }),
    ];

    if (profile?.id) {
      tasks.push(fetchMenuFavorites(profile));
      tasks.push(fetchMenuHistory(profile));
    }

    const results = await Promise.allSettled(tasks);
    const failedCount = results.filter((result) => result.status === 'rejected').length;

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warn('startup.refresh.task_failed', {
          taskIndex: index,
          message: result.reason instanceof Error ? result.reason.message : 'unknown_error',
        });
      }
    });

    logger.info('startup.refresh.completed', {
      hasProfile: Boolean(profile?.id),
      taskCount: tasks.length,
      failedCount,
    });
  })();

  try {
    await inFlightStartupRefresh;
  } finally {
    inFlightStartupRefresh = null;
  }
}
