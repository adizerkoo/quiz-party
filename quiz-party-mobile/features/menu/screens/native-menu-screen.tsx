import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JoinModal } from '@/features/menu/components/join-modal';
import { MenuActionCard } from '@/features/menu/components/menu-action-card';
import { MenuBackground } from '@/features/menu/components/menu-background';
import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuInfoModal } from '@/features/menu/components/menu-info-modal';
import { MenuLogo } from '@/features/menu/components/menu-logo';
import { MenuModalShell } from '@/features/menu/components/menu-modal-shell';
import { ProfileBanner } from '@/features/menu/components/profile-banner';
import { checkStoredGameResume } from '@/features/game/services/game-api';
import {
  clearGameSessionCredentialsByKey,
  hydrateGameSessionCredentials,
  listGameSessionCredentials,
} from '@/features/game/store/game-session-credentials';
import { GameResumeSessionStatus } from '@/features/game/types';
import { refreshStartupAppData } from '@/features/menu/services/menu-startup-data';
import {
  hydrateAndSyncMenuProfileOnAppEntry,
  scheduleStoredMenuProfileSync,
} from '@/features/menu/services/menu-profile-api';
import {
  getMenuSessionProfile,
  hydrateMenuSessionProfile,
  subscribeMenuProfileState,
} from '@/features/menu/store/menu-profile-session';
import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuProfile } from '@/features/menu/types';

const UI_TEXT = {
  joinByCode: 'Войти в игру только по коду',
  joinRoom: 'Войти в комнату',
  asHost: 'как ведущий',
  asPlayer: 'как игрок',
  thisGame: 'эту игру',
  roomPrefix: 'комнату',
  createQuiz: 'Создать новый квиз',
  organizer: 'Я организатор',
  player: 'Я игрок',
  footer: 'Сделано для крутых вечеринок',
  resumeSubtitlePrefix: 'Можно вернуться в',
  continueGame: 'Продолжить игру?',
  returnToGame: 'Вернуться в игру',
  notNow: 'Не сейчас',
};

const PAINT_EMOJI = String.fromCodePoint(0x1f3a8);
const GAMEPAD_EMOJI = String.fromCodePoint(0x1f3ae);
const HOURGLASS_EMOJI = String.fromCodePoint(0x23f3);
const SPARKLES = String.fromCodePoint(0x2728);

export function NativeMenuScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const initialProfile = getMenuSessionProfile();
  const startupRefreshRef = useRef({
    at: 0,
    profileId: initialProfile?.id ?? null,
  });

  const [profile, setProfile] = useState<MenuProfile | null>(initialProfile);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [gameInfoVisible, setGameInfoVisible] = useState(false);
  const [resumeSession, setResumeSession] = useState<GameResumeSessionStatus | null>(null);

  const hasProfile = Boolean(profile);
  const joinDescription = hasProfile ? UI_TEXT.joinByCode : UI_TEXT.joinRoom;

  const contentStyle = useMemo(
    () => [styles.content, hasProfile ? styles.contentWithProfile : styles.contentCentered],
    [hasProfile],
  );

  function scheduleStartupRefresh(nextProfile: MenuProfile | null) {
    const now = Date.now();
    const nextProfileId = nextProfile?.id ?? null;
    const lastRefresh = startupRefreshRef.current;

    if (lastRefresh.profileId === nextProfileId && now - lastRefresh.at < 30000) {
      return;
    }

    startupRefreshRef.current = {
      at: now,
      profileId: nextProfileId,
    };
    void refreshStartupAppData(nextProfile);
  }

  useEffect(() => {
    const unsubscribe = subscribeMenuProfileState(() => {
      setProfile(getMenuSessionProfile());
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncProfileOnFocus() {
      const localProfile = await hydrateMenuSessionProfile();
      if (!cancelled) {
        setProfile(localProfile);
        scheduleStoredMenuProfileSync('app_entry');
        scheduleStartupRefresh(localProfile);
      }
    }

    if (isFocused) {
      void syncProfileOnFocus();
    }

    return () => {
      cancelled = true;
    };
  }, [isFocused]);

  useEffect(() => {
    let mounted = true;

    async function hydrateProfile() {
      const localProfile = await hydrateMenuSessionProfile();
      if (!mounted) {
        return;
      }

      setProfile(localProfile);

      const syncProfilePromise = hydrateAndSyncMenuProfileOnAppEntry();
      const hydrateCredentialsPromise = hydrateGameSessionCredentials();
      const hydratedProfile = await syncProfilePromise;
      await hydrateCredentialsPromise;
      if (!mounted) {
        return;
      }

      const resolvedProfile = hydratedProfile ?? localProfile;
      setProfile(resolvedProfile);
      scheduleStartupRefresh(resolvedProfile);

      const installationPublicId =
        resolvedProfile?.installationPublicId ??
        getMenuSessionProfile()?.installationPublicId ??
        null;

      const storedSessions = listGameSessionCredentials().filter((session) => {
        if (!session?.roomCode || !session?.role) {
          return false;
        }

        if (session.role === 'player' && !resolvedProfile) {
          return false;
        }

        return true;
      });

      let nextResumeSession: GameResumeSessionStatus | null = null;

      if (storedSessions.length) {
        try {
          const response = await checkStoredGameResume({
            sessions: storedSessions.map((session) => ({
              roomCode: session.roomCode,
              role: session.role,
              participantId: session.participantId ?? null,
              participantToken: session.participantToken ?? null,
              hostToken: session.hostToken ?? null,
              installationPublicId: session.installationPublicId ?? null,
            })),
            userId: resolvedProfile?.id ?? null,
            installationPublicId,
          });

          if (!mounted) {
            return;
          }

          response.sessions.forEach((sessionResult, index) => {
            const localSession = storedSessions[index];
            if (sessionResult.clear_credentials && localSession?.storageKey) {
              clearGameSessionCredentialsByKey(localSession.storageKey);
            }
          });

          nextResumeSession = response.resume_game?.can_resume ? response.resume_game : null;
        } catch (error) {
          nextResumeSession = null;
        }
      }

      if (!mounted) {
        return;
      }

      setResumeSession(nextResumeSession);

      if (!resolvedProfile && !nextResumeSession) {
        openProfileScreen('create', true);
      }
    }

    void hydrateProfile();

    return () => {
      mounted = false;
    };
  }, []);

  function openProfileScreen(mode: 'create' | 'edit', locked = false) {
    router.push({
      pathname: '/profile' as Href,
      params: {
        mode,
        locked: locked ? '1' : '0',
      },
    } as Href);
  }

  function openCreateProfileScreen() {
    openProfileScreen('create', true);
  }

  function openEditProfileScreen() {
    if (!profile) {
      openCreateProfileScreen();
      return;
    }

    openProfileScreen('edit');
  }

  function handlePlayerPress() {
    if (!profile) {
      openCreateProfileScreen();
      return;
    }

    setJoinModalVisible(true);
  }

  function handleHostPress() {
    if (!profile) {
      openCreateProfileScreen();
      return;
    }

    router.push('/create' as Href);
  }

  function handleGameInfoPress() {
    setGameInfoVisible(true);
  }

  function handleResumeClose() {
    setResumeSession(null);

    if (!profile) {
      openCreateProfileScreen();
    }
  }

  function handleResumeConfirm() {
    if (!resumeSession) {
      return;
    }

    const pathname = resumeSession.role === 'host' ? '/host-game' : '/player-game';
    const roomCode = resumeSession.room_code?.trim().toUpperCase();
    setResumeSession(null);

    router.push({
      pathname: pathname as Href,
      params: { room: roomCode },
    } as Href);
  }

  const resumeRoleLabel = resumeSession?.role === 'host' ? UI_TEXT.asHost : UI_TEXT.asPlayer;
  const resumeTitleLabel = resumeSession?.title
    ? `"${resumeSession.title}"`
    : (resumeSession?.room_code ? `${UI_TEXT.roomPrefix} ${resumeSession.room_code}` : UI_TEXT.thisGame);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <MenuBackground />

        <ScrollView
          bounces={false}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.mainContainer,
              hasProfile ? styles.mainContainerWithProfile : styles.mainContainerCentered,
            ]}>
            <View style={styles.menuContent}>
              <MenuLogo />

              <ProfileBanner align="right" onPress={openEditProfileScreen} profile={profile} />

              <View style={styles.menuGrid}>
                <MenuActionCard
                  description={UI_TEXT.createQuiz}
                  icon={PAINT_EMOJI}
                  onInfoPress={handleGameInfoPress}
                  onPress={handleHostPress}
                  title={UI_TEXT.organizer}
                  tone="create"
                />

                <MenuActionCard
                  description={joinDescription}
                  icon={GAMEPAD_EMOJI}
                  onInfoPress={handleGameInfoPress}
                  onPress={handlePlayerPress}
                  title={UI_TEXT.player}
                  tone="join"
                />
              </View>

              <Text style={styles.footerInfo}>{`${UI_TEXT.footer} ${SPARKLES}`}</Text>
            </View>
          </View>
        </ScrollView>

        {profile ? (
          <JoinModal
            onClose={() => setJoinModalVisible(false)}
            profile={profile}
            visible={joinModalVisible}
          />
        ) : null}

        <MenuInfoModal onClose={() => setGameInfoVisible(false)} visible={gameInfoVisible} />

        <MenuModalShell
          cardOffsetY={-60}
          icon={HOURGLASS_EMOJI}
          iconPosition="left"
          onRequestClose={handleResumeClose}
          subtitle={`${UI_TEXT.resumeSubtitlePrefix} ${resumeTitleLabel} ${resumeRoleLabel}.`}
          title={UI_TEXT.continueGame}
          visible={Boolean(resumeSession)}>
          <View style={styles.resumeActions}>
            <MenuButton label={UI_TEXT.returnToGame} onPress={handleResumeConfirm} />
            <MenuButton label={UI_TEXT.notNow} onPress={handleResumeClose} variant="ghost" />
          </View>
        </MenuModalShell>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: menuTheme.colors.screen,
  },
  screen: {
    flex: 1,
    backgroundColor: menuTheme.colors.screen,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  contentCentered: {
    justifyContent: 'center',
  },
  contentWithProfile: {
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  mainContainer: {
    width: '100%',
    alignItems: 'center',
  },
  mainContainerWithProfile: {
    transform: [{ translateY: -42 }],
  },
  mainContainerCentered: {
    transform: [{ translateY: -104 }],
  },
  menuContent: {
    width: '100%',
    maxWidth: 650,
    paddingHorizontal: 6,
    paddingVertical: 26,
  },
  menuGrid: {
    width: '100%',
    gap: 10,
    marginTop: 10,
  },
  footerInfo: {
    marginTop: 20,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.4,
    color: menuTheme.colors.text,
    textAlign: 'center',
  },
  resumeActions: {
    gap: 10,
    marginTop: 4,
  },
});
