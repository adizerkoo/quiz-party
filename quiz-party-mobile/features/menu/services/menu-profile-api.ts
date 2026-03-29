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
  session_token?: string | null;
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

function normalizeSessionToken(token: string | null | undefined) {
  if (typeof token !== 'string') {
    return null;
  }

  const cleaned = token.trim();
  return cleaned || null;
}

function normalizeMenuProfile(profile: MenuProfile) {
  const installationPublicId =
    profile.installationPublicId ?? getOrCreateMenuInstallationPublicId();

  return {
    id: profile.id ?? null,
    publicId: profile.publicId ?? null,
    installationPublicId,
    sessionToken: normalizeSessionToken(profile.sessionToken),
    name: profile.name.trim(),
    emoji: normalizeMenuAvatar(profile.emoji),
  } satisfies MenuProfile;
}

function getProfileSyncSignature(
  profile: MenuProfile | null,
  syncStatus: MenuProfileSyncStatus | null,
  pendingUpdatedAt: string | null,
) {
  const normalizedProfile = profile ? normalizeMenuProfile(profile) : null;

  return JSON.stringify({
    profile: normalizedProfile
      ? {
          id: normalizedProfile.id ?? null,
          publicId: normalizedProfile.publicId ?? null,
          installationPublicId: normalizedProfile.installationPublicId ?? null,
          sessionToken: normalizedProfile.sessionToken ?? null,
          name: normalizedProfile.name,
          emoji: normalizedProfile.emoji,
        }
      : null,
    syncStatus,
    pendingUpdatedAt: pendingUpdatedAt ?? null,
  });
}

function createProfileSyncGuard(
  profile: MenuProfile | null,
  syncStatus: MenuProfileSyncStatus | null,
  pendingUpdatedAt: string | null,
) {
  const expectedSignature = getProfileSyncSignature(profile, syncStatus, pendingUpdatedAt);

  return () => {
    const snapshot = getMenuProfileStateSnapshot();

    return (
      getProfileSyncSignature(snapshot.profile, snapshot.syncStatus, snapshot.pendingUpdatedAt) ===
      expectedSignature
    );
  };
}

function toMenuProfile(apiUser: ApiUserResponse, fallback: MenuProfile) {
  return {
    id: apiUser.id,
    publicId: apiUser.public_id ?? fallback.publicId ?? null,
    installationPublicId:
      apiUser.installation_public_id ??
      fallback.installationPublicId ??
      getOrCreateMenuInstallationPublicId(),
    sessionToken:
      normalizeSessionToken(apiUser.session_token) ??
      normalizeSessionToken(fallback.sessionToken),
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

export function buildMenuProfileAuthHeaders(
  initHeaders?: HeadersInit,
  profile?: MenuProfile | null,
) {
  const headers = new Headers(initHeaders ?? {});
  const sessionToken = normalizeSessionToken(profile?.sessionToken);

  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  } else {
    headers.delete('Authorization');
  }

  return headers;
}

async function exchangeRemoteProfileSession(profile: MenuProfile) {
  if (!profile.id) {
    throw new Error('Profile id is required for session exchange');
  }

  const response = await fetch(`${WEB_APP_ORIGIN}/api/v1/users/${profile.id}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_platform: Platform.OS,
      device_brand: null,
      installation_public_id:
        profile.installationPublicId ?? getOrCreateMenuInstallationPublicId(),
    }),
  });

  return parseUserResponse(response, 'Failed to refresh profile session');
}

export async function ensureMenuProfileSession(
  profile: MenuProfile | null,
  options?: { forceRefresh?: boolean },
) {
  if (!profile?.id) {
    return profile;
  }

  const normalizedProfile = normalizeMenuProfile(profile);
  const storedProfile = getMenuSessionProfile();
  const normalizedStoredProfile =
    storedProfile?.id === normalizedProfile.id
      ? normalizeMenuProfile(storedProfile)
      : null;
  const activeProfile = normalizedStoredProfile ?? normalizedProfile;

  if (!options?.forceRefresh && activeProfile.sessionToken) {
    return activeProfile;
  }

  let refreshedProfile: MenuProfile;
  try {
    refreshedProfile = toMenuProfile(
      await exchangeRemoteProfileSession(activeProfile),
      activeProfile,
    );
  } catch (error) {
    if (
      error instanceof HttpStatusError
      && (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      const snapshot = getMenuProfileStateSnapshot();
      if (snapshot.profile?.id === activeProfile.id) {
        await setMenuSessionProfile(null, {
          syncStatus: null,
          lastSyncedAt: null,
          pendingUpdatedAt: null,
        });
      }
    }

    throw error;
  }

  const snapshot = getMenuProfileStateSnapshot();

  return (
    (await setMenuSessionProfile(refreshedProfile, {
      syncStatus: snapshot.syncStatus ?? 'synced',
      lastSyncedAt: snapshot.lastSyncedAt,
      pendingUpdatedAt: snapshot.pendingUpdatedAt,
    })) ?? refreshedProfile
  );
}

export async function fetchWithMenuProfileAuth(
  input: string,
  init?: RequestInit,
  profile?: MenuProfile | null,
  options?: {
    required?: boolean;
    retryAnonymouslyOnAuthFailure?: boolean;
  },
) {
  const required = options?.required !== false;
  const retryAnonymouslyOnAuthFailure = options?.retryAnonymouslyOnAuthFailure === true;
  let authenticatedProfile = profile ?? null;

  if (authenticatedProfile?.id) {
    try {
      authenticatedProfile = await ensureMenuProfileSession(authenticatedProfile);
    } catch (error) {
      if (required) {
        throw error;
      }

      authenticatedProfile = null;
    }
  }

  const sendRequest = (requestProfile: MenuProfile | null) => fetch(input, {
    ...init,
    headers: buildMenuProfileAuthHeaders(init?.headers, requestProfile),
  });

  if (required && !buildMenuProfileAuthHeaders(init?.headers, authenticatedProfile).has('Authorization')) {
    throw new HttpStatusError(401, 'Session token is required');
  }

  let response = await sendRequest(authenticatedProfile);

  if (response.status === 401 && authenticatedProfile?.id) {
    try {
      authenticatedProfile = await ensureMenuProfileSession(authenticatedProfile, {
        forceRefresh: true,
      });
    } catch (error) {
      if (required) {
        throw error;
      }

      authenticatedProfile = null;
    }

    if (authenticatedProfile?.sessionToken) {
      response = await sendRequest(authenticatedProfile);
    } else if (!required && retryAnonymouslyOnAuthFailure) {
      response = await sendRequest(null);
    }
  } else if (response.status === 401 && !required && retryAnonymouslyOnAuthFailure) {
    response = await sendRequest(null);
  }

  return {
    response,
    profile: authenticatedProfile,
  };
}

async function updateRemoteProfile(profile: MenuProfile) {
  if (!profile.id) {
    throw new Error('Profile id is required for update');
  }

  const authenticatedProfile = await ensureMenuProfileSession(profile);
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/users/${profile.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildProfilePayload(authenticatedProfile ?? profile)),
    },
    authenticatedProfile ?? profile,
  );

  return parseUserResponse(response, 'Failed to update profile');
}

async function touchRemoteProfile(profile: MenuProfile) {
  if (!profile.id) {
    throw new Error('Profile id is required for touch');
  }

  const authenticatedProfile = await ensureMenuProfileSession(profile);
  const { response } = await fetchWithMenuProfileAuth(
    `${WEB_APP_ORIGIN}/api/v1/users/${profile.id}/touch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_platform: Platform.OS,
        device_brand: null,
        installation_public_id:
          authenticatedProfile?.installationPublicId ?? getOrCreateMenuInstallationPublicId(),
      }),
    },
    authenticatedProfile ?? profile,
  );

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
  const pendingSnapshot = getMenuProfileStateSnapshot();
  const isCurrentSync = createProfileSyncGuard(
    pendingSnapshot.profile ?? normalizedProfile,
    pendingSnapshot.syncStatus,
    pendingSnapshot.pendingUpdatedAt,
  );

  try {
    const syncedProfile = await syncProfileWithBackend(normalizedProfile, 'profile_save');
    if (!isCurrentSync()) {
      return getMenuSessionProfile() ?? normalizedProfile;
    }

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

  const snapshot = getMenuProfileStateSnapshot();
  const storedProfile = snapshot.profile;
  if (!storedProfile) {
    return null;
  }

  const normalizedProfile = normalizeMenuProfile(storedProfile);
  const syncStatus = snapshot.syncStatus;
  const isCurrentSync = createProfileSyncGuard(storedProfile, syncStatus, snapshot.pendingUpdatedAt);

  // Если есть локальные несинхронизированные правки, сначала поднимем их в БД.
  if (syncStatus === 'pending_create' || syncStatus === 'pending_update') {
    const syncedProfile = await syncProfileWithBackend(normalizedProfile, trigger);
    if (!isCurrentSync()) {
      return getMenuSessionProfile() ?? normalizedProfile;
    }

    return (await markProfileSynced(syncedProfile)) ?? syncedProfile;
  }

  try {
    const syncedProfile = await syncProfileWithBackend(normalizedProfile, trigger);
    if (!isCurrentSync()) {
      return getMenuSessionProfile() ?? normalizedProfile;
    }

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
