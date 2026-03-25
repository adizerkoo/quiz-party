import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JoinModal } from '@/features/menu/components/join-modal';
import { MenuActionCard } from '@/features/menu/components/menu-action-card';
import { MenuBackground } from '@/features/menu/components/menu-background';
import { MenuInfoModal } from '@/features/menu/components/menu-info-modal';
import { MenuLogo } from '@/features/menu/components/menu-logo';
import { ProfileBanner } from '@/features/menu/components/profile-banner';
import { ProfileModal } from '@/features/menu/components/profile-modal';
import { MENU_AVATARS } from '@/features/menu/data/avatar-options';
import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuProfile, ProfileModalMode } from '@/features/menu/types';

export function NativeMenuScreen() {
  const [profile, setProfile] = useState<MenuProfile | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(true);
  const [profileModalMode, setProfileModalMode] = useState<ProfileModalMode>('create');
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [gameInfoVisible, setGameInfoVisible] = useState(false);

  const hasProfile = Boolean(profile);
  const joinDescription = hasProfile ? 'Войти в игру только по коду' : 'Войти в комнату';

  const contentStyle = useMemo(
    () => [styles.content, hasProfile ? styles.contentWithProfile : styles.contentCentered],
    [hasProfile],
  );

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
    setProfile(nextProfile);
    setProfileModalVisible(false);
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

    setGameInfoVisible(true);
  }

  function handleGameInfoPress() {
    setGameInfoVisible(true);
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <MenuBackground />

        <ScrollView
          bounces={false}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}>
          <View style={[styles.mainContainer, !hasProfile && styles.mainContainerCentered]}>
            <ProfileBanner onPress={openEditProfileModal} profile={profile} />

            <View style={styles.menuContent}>
              <MenuLogo />

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
    paddingTop: 10,
  },
  mainContainer: {
    width: '100%',
    alignItems: 'center',
  },
  mainContainerCentered: {
    // Главная настройка вертикального положения стартового меню.
    // Если хочешь поднять весь блок выше, делай число более отрицательным:
    // -80, -90 и т.д.
    // Если хочешь опустить ниже, приближай к нулю: -50, -40 и т.д.
    transform: [{ translateY: -92 }],
  },
  // Главный контейнер меню без лишних промежуточных обёрток.
  // paddingHorizontal отвечает за близость карточек к краям экрана.
  menuContent: {
    width: '100%',
    maxWidth: 650,
    paddingHorizontal: 6,
    paddingVertical: 44,
  },
  menuGrid: {
    width: '100%',
    gap: 10,
  },
  footerInfo: {
    marginTop: 20,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.4,
    color: menuTheme.colors.text,
    textAlign: 'center',
  },
});
