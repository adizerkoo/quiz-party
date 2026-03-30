import * as FileSystem from 'expo-file-system/legacy';

import { normalizeMenuAvatar } from '@/features/menu/data/avatar-options';
import { MenuProfile } from '@/features/menu/types';

export type MenuProfileSyncStatus = 'pending_create' | 'pending_update' | 'synced';

type MenuProfilePersistedState = {
  profile: MenuProfile | null;
  installationPublicId: string | null;
  syncStatus: MenuProfileSyncStatus | null;
  lastSyncedAt: string | null;
  pendingUpdatedAt: string | null;
};

const PROFILE_DIRECTORY = `${FileSystem.documentDirectory ?? ''}quiz-party-mobile/`;
const PROFILE_FILE = `${PROFILE_DIRECTORY}menu-profile.json`;
const menuProfileListeners = new Set<() => void>();

let currentMenuProfile: MenuProfile | null = null;
let currentInstallationPublicId: string | null = null;
let currentSyncStatus: MenuProfileSyncStatus | null = null;
let currentLastSyncedAt: string | null = null;
let currentPendingUpdatedAt: string | null = null;
let menuProfileHydrated = false;
let menuProfileHydrationPromise: Promise<MenuProfile | null> | null = null;

function notifyMenuProfileListeners() {
  menuProfileListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      // Один сломанный listener не должен мешать остальным обновиться.
    }
  });
}

function normalizeSessionToken(token: string | null | undefined) {
  if (typeof token !== 'string') {
    return null;
  }

  const cleaned = token.trim();
  return cleaned || null;
}

function generatePublicId() {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function ensureInstallationPublicId() {
  if (!currentInstallationPublicId) {
    currentInstallationPublicId = generatePublicId();
  }

  return currentInstallationPublicId;
}

function normalizeMenuProfile(profile: MenuProfile | null) {
  if (!profile) {
    return null;
  }

  const installationPublicId =
    profile.installationPublicId ?? currentInstallationPublicId ?? ensureInstallationPublicId();

  return {
    id: profile.id ?? null,
    publicId: profile.publicId ?? null,
    installationPublicId,
    sessionToken: normalizeSessionToken(profile.sessionToken),
    name: profile.name.trim(),
    emoji: normalizeMenuAvatar(profile.emoji),
  } satisfies MenuProfile;
}

function buildPersistedState(): MenuProfilePersistedState {
  return {
    profile: currentMenuProfile
      ? {
          ...currentMenuProfile,
          installationPublicId:
            currentMenuProfile.installationPublicId ?? currentInstallationPublicId ?? ensureInstallationPublicId(),
          sessionToken: normalizeSessionToken(currentMenuProfile.sessionToken),
        }
      : null,
    installationPublicId: currentInstallationPublicId ?? ensureInstallationPublicId(),
    syncStatus: currentSyncStatus,
    lastSyncedAt: currentLastSyncedAt,
    pendingUpdatedAt: currentPendingUpdatedAt,
  };
}

async function ensureProfileDirectory() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(PROFILE_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROFILE_DIRECTORY, { intermediates: true });
  }
}

async function persistMenuProfileState() {
  if (!FileSystem.documentDirectory) {
    return;
  }

  try {
    await ensureProfileDirectory();
    await FileSystem.writeAsStringAsync(PROFILE_FILE, JSON.stringify(buildPersistedState()));
  } catch (error) {
    // Ошибка локального сохранения не должна ломать меню или создание игры.
  }
}

function applyPersistedState(state: Partial<MenuProfilePersistedState> | null | undefined) {
  currentInstallationPublicId =
    typeof state?.installationPublicId === 'string' && state.installationPublicId.trim()
      ? state.installationPublicId
      : currentInstallationPublicId;

  currentMenuProfile = normalizeMenuProfile(state?.profile ?? null);
  if (currentMenuProfile?.installationPublicId) {
    currentInstallationPublicId = currentMenuProfile.installationPublicId;
  }

  currentSyncStatus = state?.syncStatus ?? null;
  currentLastSyncedAt = state?.lastSyncedAt ?? null;
  currentPendingUpdatedAt = state?.pendingUpdatedAt ?? null;
  notifyMenuProfileListeners();
}

export function hasHydratedMenuSessionProfile() {
  return menuProfileHydrated;
}

export function getMenuSessionProfile() {
  return currentMenuProfile;
}

export function getMenuProfileStateSnapshot() {
  return {
    profile: currentMenuProfile,
    installationPublicId: currentInstallationPublicId ?? ensureInstallationPublicId(),
    syncStatus: currentSyncStatus,
    lastSyncedAt: currentLastSyncedAt,
    pendingUpdatedAt: currentPendingUpdatedAt,
    hydrated: menuProfileHydrated,
  };
}

export function subscribeMenuProfileState(listener: () => void) {
  menuProfileListeners.add(listener);

  return () => {
    menuProfileListeners.delete(listener);
  };
}

export async function hydrateMenuSessionProfile() {
  if (menuProfileHydrated) {
    return currentMenuProfile;
  }

  if (menuProfileHydrationPromise) {
    return menuProfileHydrationPromise;
  }

  menuProfileHydrationPromise = (async () => {
    if (!FileSystem.documentDirectory) {
      ensureInstallationPublicId();
      menuProfileHydrated = true;
      return currentMenuProfile;
    }

    try {
      const info = await FileSystem.getInfoAsync(PROFILE_FILE);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(PROFILE_FILE);
        applyPersistedState(JSON.parse(raw) as MenuProfilePersistedState);
      }
    } catch (error) {
      // Если файл битый или недоступен, просто стартуем с пустого локального состояния.
    }

    if (!currentInstallationPublicId) {
      ensureInstallationPublicId();
      await persistMenuProfileState();
    }

    menuProfileHydrated = true;
    return currentMenuProfile;
  })();

  try {
    return await menuProfileHydrationPromise;
  } finally {
    menuProfileHydrationPromise = null;
  }
}

export function getOrCreateMenuInstallationPublicId() {
  if (currentMenuProfile?.installationPublicId) {
    currentInstallationPublicId = currentMenuProfile.installationPublicId;
    return currentInstallationPublicId;
  }

  const installationPublicId = currentInstallationPublicId ?? ensureInstallationPublicId();

  if (currentMenuProfile && currentMenuProfile.installationPublicId !== installationPublicId) {
    currentMenuProfile = {
      ...currentMenuProfile,
      installationPublicId,
    };
  }

  void persistMenuProfileState();
  return installationPublicId;
}

export async function setMenuSessionProfile(
  profile: MenuProfile | null,
  options?: {
    syncStatus?: MenuProfileSyncStatus | null;
    lastSyncedAt?: string | null;
    pendingUpdatedAt?: string | null;
  },
) {
  menuProfileHydrated = true;
  currentMenuProfile = normalizeMenuProfile(profile);

  if (currentMenuProfile?.installationPublicId) {
    currentInstallationPublicId = currentMenuProfile.installationPublicId;
  } else {
    currentInstallationPublicId = currentInstallationPublicId ?? ensureInstallationPublicId();
  }

  if (profile === null) {
    currentSyncStatus = options?.syncStatus ?? null;
    currentLastSyncedAt = options?.lastSyncedAt ?? null;
    currentPendingUpdatedAt = options?.pendingUpdatedAt ?? null;
  } else {
    if (options?.syncStatus !== undefined) {
      currentSyncStatus = options.syncStatus;
    }
    if (options?.lastSyncedAt !== undefined) {
      currentLastSyncedAt = options.lastSyncedAt;
    }
    if (options?.pendingUpdatedAt !== undefined) {
      currentPendingUpdatedAt = options.pendingUpdatedAt;
    }
  }

  notifyMenuProfileListeners();
  await persistMenuProfileState();
  return currentMenuProfile;
}

export async function mergeMenuSessionProfileIdentity(
  patch: {
    id?: number | null;
    publicId?: string | null;
    installationPublicId?: string | null;
    sessionToken?: string | null;
  },
  options?: {
    syncStatus?: MenuProfileSyncStatus | null;
    lastSyncedAt?: string | null;
    pendingUpdatedAt?: string | null;
  },
) {
  menuProfileHydrated = true;

  if (patch.installationPublicId) {
    currentInstallationPublicId = patch.installationPublicId;
  } else {
    currentInstallationPublicId = currentInstallationPublicId ?? ensureInstallationPublicId();
  }

  if (options?.syncStatus !== undefined) {
    currentSyncStatus = options.syncStatus;
  }
  if (options?.lastSyncedAt !== undefined) {
    currentLastSyncedAt = options.lastSyncedAt;
  }
  if (options?.pendingUpdatedAt !== undefined) {
    currentPendingUpdatedAt = options.pendingUpdatedAt;
  }

  if (!currentMenuProfile) {
    await persistMenuProfileState();
    return null;
  }

  currentMenuProfile = {
    ...currentMenuProfile,
    id: patch.id !== undefined ? patch.id : currentMenuProfile.id,
    publicId: patch.publicId !== undefined ? patch.publicId : currentMenuProfile.publicId,
    installationPublicId:
      patch.installationPublicId !== undefined
        ? patch.installationPublicId
        : (currentMenuProfile.installationPublicId ?? currentInstallationPublicId),
    sessionToken:
      patch.sessionToken !== undefined
        ? normalizeSessionToken(patch.sessionToken)
        : normalizeSessionToken(currentMenuProfile.sessionToken),
  };

  notifyMenuProfileListeners();
  await persistMenuProfileState();
  return currentMenuProfile;
}
