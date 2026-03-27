import { Platform } from 'react-native';

import { normalizeMenuAvatar } from '@/features/menu/data/avatar-options';
import {
  getMenuProfileStateSnapshot,
  getMenuSessionProfile,
  getOrCreateMenuInstallationPublicId,
  hydrateMenuSessionProfile,
  MenuProfileSyncStatus,
  setMenuSessionProfile,
} from '@/features/menu/store/menu-profile-session';
import { MenuProfile } from '@/features/menu/types';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

type ApiUserResponse = {
  id: number;
  public_id?: string | null;
  username: string;
  avatar_emoji: string;
  installation_public_id?: string | null;
};

type SyncTrigger = 'app_entry' | 'profile_save' | 'create_quiz';
type RemoteOperation = 'create' | 'update' | 'touch';

class HttpStatusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

function buildProfilePayload(profile: MenuProfile) {
  const installationPublicId =
    profile.installationPublicId ?? getOrCreateMenuInstallationPublicId();

  return {
    username: profile.name,
    avatar_emoji: normalizeMenuAvatar(profile.emoji),
    device_platform: Platform.OS,
    device_brand: null,
    installation_public_id: installationPublicId,
  };
}

function normalizeMenuProfile(profile: MenuProfile) {
  const installationPublicId =
    profile.installationPublicId ?? getOrCreateMenuInstallationPublicId();

  return {
    id: profile.id ?? null,
    publicId: profile.publicId ?? null,
    installationPublicId,
    name: profile.name.trim(),
    emoji: normalizeMenuAvatar(profile.emoji),
  } satisfies MenuProfile;
}

function toMenuProfile(apiUser: ApiUserResponse, fallback: MenuProfile) {
  return {
    id: apiUser.id,
    publicId: apiUser.public_id ?? fallback.publicId ?? null,
    installationPublicId:
      apiUser.installation_public_id ??
      fallback.installationPublicId ??
      getOrCreateMenuInstallationPublicId(),
    name: apiUser.username,
    emoji: normalizeMenuAvatar(apiUser.avatar_emoji),
  } satisfies MenuProfile;
}

function isRetryableError(error: unknown) {
  if (error instanceof HttpStatusError) {
    return error.status >= 500 || error.status === 429;
  }

  // В React Native сетевые ошибки fetch чаще всего приходят как TypeError.
  return error instanceof TypeError;
}

async function parseUserResponse(response: Response, failureMessage: string) {
  if (!response.ok) {
    throw new HttpStatusError(response.status, `${failureMessage}: HTTP ${response.status}`);
  }

  return (await response.json()) as ApiUserResponse;
}

async function createRemoteProfile(profile: MenuProfile) {
  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildProfilePayload(profile)),
  });

  return parseUserResponse(response, 'Failed to create profile');
}

async function updateRemoteProfile(profile: MenuProfile) {
  if (!profile.id) {
    throw new Error('Profile id is required for update');
  }

  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${profile.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildProfilePayload(profile)),
  });

  return parseUserResponse(response, 'Failed to update profile');
}

async function touchRemoteProfile(profile: MenuProfile) {
  if (!profile.id) {
    throw new Error('Profile id is required for touch');
  }

  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${profile.id}/touch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_platform: Platform.OS,
      device_brand: null,
      installation_public_id:
        profile.installationPublicId ?? getOrCreateMenuInstallationPublicId(),
    }),
  });

  return parseUserResponse(response, 'Failed to touch profile');
}

function resolveSyncOperation(trigger: SyncTrigger, profile: MenuProfile): RemoteOperation {
  const state = getMenuProfileStateSnapshot();

  if (!profile.id || state.syncStatus === 'pending_create') {
    return 'create';
  }

  if (trigger === 'profile_save' || state.syncStatus === 'pending_update') {
    return 'update';
  }

  return 'touch';
}

async function markProfilePending(profile: MenuProfile) {
  const syncStatus: MenuProfileSyncStatus = profile.id ? 'pending_update' : 'pending_create';
  const nowIso = new Date().toISOString();

  return setMenuSessionProfile(profile, {
    syncStatus,
    pendingUpdatedAt: nowIso,
  });
}

async function markProfileSynced(profile: MenuProfile) {
  const nowIso = new Date().toISOString();
  return setMenuSessionProfile(profile, {
    syncStatus: 'synced',
    lastSyncedAt: nowIso,
    pendingUpdatedAt: null,
  });
}

async function syncProfileWithBackend(profile: MenuProfile, trigger: SyncTrigger) {
  const operation = resolveSyncOperation(trigger, profile);

  try {
    if (operation === 'create') {
      return toMenuProfile(await createRemoteProfile(profile), profile);
    }

    if (operation === 'update') {
      try {
        return toMenuProfile(await updateRemoteProfile(profile), profile);
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 404) {
          return toMenuProfile(await createRemoteProfile(profile), profile);
        }
        throw error;
      }
    }

    try {
      return toMenuProfile(await touchRemoteProfile(profile), profile);
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) {
        return toMenuProfile(await createRemoteProfile(profile), profile);
      }
      throw error;
    }
  } catch (error) {
    const canContinueWithLocalProfile =
      isRetryableError(error) &&
      trigger === 'create_quiz' &&
      Boolean(profile.id) &&
      operation !== 'create';

    if (canContinueWithLocalProfile) {
      return profile;
    }

    throw error;
  }
}

export async function hydrateAndSyncMenuProfileOnAppEntry() {
  const profile = await hydrateMenuSessionProfile();
  if (!profile) {
    return null;
  }

  try {
    return await syncStoredMenuProfile('app_entry');
  } catch (error) {
    // На старте приложения не блокируем UI из-за временной недоступности backend.
    return getMenuSessionProfile();
  }
}

export async function saveMenuProfileAndSync(profile: MenuProfile) {
  await hydrateMenuSessionProfile();

  const normalizedProfile = normalizeMenuProfile(profile);
  await markProfilePending(normalizedProfile);

  try {
    const syncedProfile = await syncProfileWithBackend(normalizedProfile, 'profile_save');
    return (await markProfileSynced(syncedProfile)) ?? syncedProfile;
  } catch (error) {
    if (isRetryableError(error)) {
      return getMenuSessionProfile() ?? normalizedProfile;
    }

    throw error;
  }
}

export async function syncStoredMenuProfile(trigger: SyncTrigger) {
  await hydrateMenuSessionProfile();

  const storedProfile = getMenuSessionProfile();
  if (!storedProfile) {
    return null;
  }

  const normalizedProfile = normalizeMenuProfile(storedProfile);
  const syncStatus = getMenuProfileStateSnapshot().syncStatus;

  // Если есть локальные несинхронизированные правки, сначала поднимем их в БД.
  if (syncStatus === 'pending_create' || syncStatus === 'pending_update') {
    const syncedProfile = await syncProfileWithBackend(normalizedProfile, trigger);
    return (await markProfileSynced(syncedProfile)) ?? syncedProfile;
  }

  try {
    const syncedProfile = await syncProfileWithBackend(normalizedProfile, trigger);
    return (await markProfileSynced(syncedProfile)) ?? syncedProfile;
  } catch (error) {
    if (isRetryableError(error)) {
      return getMenuSessionProfile() ?? normalizedProfile;
    }

    throw error;
  }
}

export async function ensureOwnerMenuProfile(profile: MenuProfile | null) {
  await hydrateMenuSessionProfile();

  if (profile) {
    const normalizedProfile = normalizeMenuProfile(profile);
    const snapshot = getMenuProfileStateSnapshot();
    const syncStatus = snapshot.syncStatus ?? (normalizedProfile.id ? 'synced' : 'pending_create');

    await setMenuSessionProfile(normalizedProfile, {
      syncStatus,
      lastSyncedAt: snapshot.lastSyncedAt,
      pendingUpdatedAt: snapshot.pendingUpdatedAt,
    });
  }

  const syncedProfile = await syncStoredMenuProfile('create_quiz');
  if (!syncedProfile?.id) {
    throw new Error('Profile sync is required before quiz creation');
  }

  return syncedProfile;
}
