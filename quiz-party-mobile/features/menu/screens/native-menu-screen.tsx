import { StatusBar } from 'expo-status-bar';
import { Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { ProfileModal } from '@/features/menu/components/profile-modal';
import { checkStoredGameResume } from '@/features/game/services/game-api';
import {
  clearGameSessionCredentialsByKey,
  hydrateGameSessionCredentials,
  listGameSessionCredentials,
} from '@/features/game/store/game-session-credentials';
import { GameResumeSessionStatus } from '@/features/game/types';
import { MENU_AVATARS } from '@/features/menu/data/avatar-options';
import {
  hydrateAndSyncMenuProfileOnAppEntry,
  saveMenuProfileAndSync,
} from '@/features/menu/services/menu-profile-api';
import {
  getMenuSessionProfile,
  hydrateMenuSessionProfile,
} from '@/features/menu/store/menu-profile-session';
import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuProfile, ProfileModalMode } from '@/features/menu/types';

export function NativeMenuScreen() {
  const router = useRouter();
  const initialProfile = getMenuSessionProfile();

  const [profile, setProfile] = useState<MenuProfile | null>(initialProfile);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileModalMode, setProfileModalMode] = useState<ProfileModalMode>('create');
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [gameInfoVisible, setGameInfoVisible] = useState(false);
  const [resumeSession, setResumeSession] = useState<GameResumeSessionStatus | null>(null);

  const hasProfile = Boolean(profile);
  const joinDescription = hasProfile ? 'Войти в игру только по коду' : 'Войти в комнату';

  const contentStyle = useMemo(
    () => [styles.content, hasProfile ? styles.contentWithProfile : styles.contentCentered],
    [hasProfile],
  );

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

      const installationPublicId =
        resolvedProfile?.installationPublicId ??
        getMenuSessionProfile()?.installationPublicId ??
        null;

      const storedSessions = listGameSessionCredentials()
        .filter((session) => {
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
      setProfileModalVisible(!resolvedProfile && !nextResumeSession);
    }

    void hydrateProfile();

    return () => {
      mounted = false;
    };
  }, []);

  function openCreateProfileModal() {
    setProfileModalMode('create');
    setProfileModalVisible(true);
  }

  function openEditProfileModal() {
    if (!profile) {
      openCreateProfileModal();
      return;
    }

    setProfileModalMode('edit');
    setProfileModalVisible(true);
  }

  function handleProfileSubmit(nextProfile: MenuProfile) {
    const mergedProfile: MenuProfile = {
      id: nextProfile.id ?? profile?.id ?? null,
      publicId: nextProfile.publicId ?? profile?.publicId ?? null,
      installationPublicId: nextProfile.installationPublicId ?? profile?.installationPublicId ?? null,
      name: nextProfile.name,
      emoji: nextProfile.emoji,
    };

    setProfile(mergedProfile);
    setProfileModalVisible(false);

    void saveMenuProfileAndSync(mergedProfile)
      .then((savedProfile) => {
        setProfile(savedProfile);
      })
      .catch(() => {
      // Даже если сервер сейчас недоступен, локальный профиль уже сохранён
      // и будет досинхронизирован при следующем онлайн-действии.
        setProfile(getMenuSessionProfile() ?? mergedProfile);
      });
  }

  function handlePlayerPress() {
    if (!profile) {
      openCreateProfileModal();
      return;
    }

    setJoinModalVisible(true);
  }

  function handleHostPress() {
    if (!profile) {
      openCreateProfileModal();
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
      setProfileModalVisible(true);
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

  const resumeRoleLabel = resumeSession?.role === 'host' ? 'как ведущий' : 'как игрок';
  const resumeTitleLabel = resumeSession?.title
    ? `«${resumeSession.title}»`
    : (resumeSession?.room_code ? `комнату ${resumeSession.room_code}` : 'эту игру');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <MenuBackground />

        <ScrollView
          bounces={false}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}>
          <View style={[styles.mainContainer, hasProfile ? styles.mainContainerWithProfile : styles.mainContainerCentered]}>
            <View style={styles.menuContent}>
              <MenuLogo />

              <ProfileBanner
                align="right"
                onPress={openEditProfileModal}
                profile={profile}
              />

              <View style={styles.menuGrid}>
                <MenuActionCard
                  description="Создать новый квиз"
                  icon="🎨"
                  onInfoPress={handleGameInfoPress}
                  onPress={handleHostPress}
                  title="Я организатор"
                  tone="create"
                />

                <MenuActionCard
                  description={joinDescription}
                  icon="🎮"
                  onInfoPress={handleGameInfoPress}
                  onPress={handlePlayerPress}
                  title="Я игрок"
                  tone="join"
                />
              </View>

              <Text style={styles.footerInfo}>Сделано для крутых вечеринок ✨</Text>
            </View>
          </View>
        </ScrollView>

        <ProfileModal
          avatars={MENU_AVATARS}
          initialProfile={profile}
          locked={!profile}
          mode={profileModalMode}
          onClose={() => {
            if (!profile) {
              return;
            }

            setProfileModalVisible(false);
          }}
          onSubmit={handleProfileSubmit}
          visible={profileModalVisible}
        />

        {profile ? (
          <JoinModal
            onClose={() => setJoinModalVisible(false)}
            profile={profile}
            visible={joinModalVisible}
          />
        ) : null}

        <MenuInfoModal
          onClose={() => setGameInfoVisible(false)}
          visible={gameInfoVisible}
        />

        <MenuModalShell
          cardOffsetY={-60}
          icon="⏳"
          iconPosition="left"
          onRequestClose={handleResumeClose}
          subtitle={`Можно вернуться в ${resumeTitleLabel} ${resumeRoleLabel}.`}
          title="Продолжить игру?"
          visible={Boolean(resumeSession)}>
          <View style={styles.resumeActions}>
            <MenuButton label="Вернуться в игру" onPress={handleResumeConfirm} />
            <MenuButton label="Не сейчас" onPress={handleResumeClose} variant="ghost" />
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
    // Чем меньше значение, тем выше весь экран поднимается к верхней safe-area.
    paddingTop: 0,
  },
  mainContainer: {
    width: '100%',
    alignItems: 'center',
  },
  mainContainerWithProfile: {
    // Отдельная вертикальная посадка экрана, когда профиль уже есть.
    // Так баннер и карточки поднимаются ближе к "чёлке", но не вылезают из safe-area.
    transform: [{ translateY: -42 }],
  },
  mainContainerCentered: {
    // Главная настройка вертикального положения стартового меню.
    // Если хочешь поднять весь блок выше, делай число более отрицательным:
    // -80, -90 и т.д.
    // Если хочешь опустить ниже, приближай к нулю: -50, -40 и т.д.
    transform: [{ translateY: -104 }],
  },
  // Главный контейнер меню без лишних промежуточных обёрток.
  // paddingHorizontal отвечает за близость карточек к краям экрана.
  menuContent: {
    width: '100%',
    maxWidth: 650,
    paddingHorizontal: 6,
    // Уменьшаем вертикальный воздух, чтобы логотип, баннер и карточки жили плотнее.
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
