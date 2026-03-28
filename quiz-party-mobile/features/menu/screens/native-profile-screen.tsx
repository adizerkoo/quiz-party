import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarPicker } from '@/features/menu/components/avatar-picker';
import { MenuBackground } from '@/features/menu/components/menu-background';
import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuTextField } from '@/features/menu/components/menu-text-field';
import { ProfileHistorySection } from '@/features/menu/components/profile-history-section';
import { MENU_AVATARS } from '@/features/menu/data/avatar-options';
import { fetchMenuHistory } from '@/features/menu/services/menu-history-api';
import { saveMenuProfileAndSync } from '@/features/menu/services/menu-profile-api';
import {
  getCachedMenuHistory,
  hydrateMenuHistoryCache,
} from '@/features/menu/store/menu-history-cache';
import {
  getMenuSessionProfile,
  hydrateMenuSessionProfile,
} from '@/features/menu/store/menu-profile-session';
import { menuTheme } from '@/features/menu/theme/menu-theme';
import {
  MenuHistoryEntry,
  MenuProfile,
  ProfileModalMode,
  ProfileScreenTab,
} from '@/features/menu/types';

const UI_TEXT = {
  historyError:
    'Не удалось загрузить историю игр. Попробуй открыть вкладку еще раз.',
  nameRequired: 'Пожалуйста, представься',
  saveError:
    'Не удалось сохранить профиль. Попробуй еще раз.',
  historyTitle: 'История игр',
  editProfile: 'Редактировать профиль',
  introTitle: 'Сначала познакомимся',
  historySubtitle:
    'Тут живут твои последние игры, итоги и победы.',
  profileSubtitle:
    'Имя и аватар останутся такими же и в главном меню.',
  back: 'Назад',
  myProfile: 'Мой профиль',
  profileTab: 'Профиль',
  historyTab: 'История игр',
  yourName: 'Твое имя',
  saving: 'Сохраняем...',
  updateProfile: 'Обновить профиль',
  saveProfile: 'Сохранить профиль',
  backToMenu: 'Вернуться в меню',
};

const SPARKLES = String.fromCodePoint(0x2728);
const SMILE_EMOJI = String.fromCodePoint(0x1f642);

function readSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readCachedHistoryEntries(userId: number) {
  const cachedRecord = getCachedMenuHistory(userId);

  if (!cachedRecord) {
    return null;
  }

  return Array.isArray(cachedRecord.entries) ? cachedRecord.entries : [];
}

function ProfileTabButton({
  active,
  disabled,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  icon: 'user' | 'clock';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        disabled && styles.tabButtonDisabled,
        pressed && !disabled && styles.tabButtonPressed,
      ]}>
      <FontAwesome6
        color={active ? '#ffffff' : (disabled ? menuTheme.colors.muted : menuTheme.colors.primary)}
        iconStyle="solid"
        name={icon}
        size={14}
      />
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function NativeProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    locked?: string | string[];
    tab?: string | string[];
  }>();

  const initialProfile = getMenuSessionProfile();
  const requestedTab = readSingleParam(params.tab);

  const [profile, setProfile] = useState<MenuProfile | null>(initialProfile);
  const [name, setName] = useState(initialProfile?.name ?? '');
  const [selectedEmoji, setSelectedEmoji] = useState(initialProfile?.emoji ?? MENU_AVATARS[0] ?? SMILE_EMOJI);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileScreenTab>(
    requestedTab === 'history' && initialProfile ? 'history' : 'profile',
  );
  const [historyEntries, setHistoryEntries] = useState<MenuHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestedMode = readSingleParam(params.mode);
  const requestedLocked = readSingleParam(params.locked);
  const hasProfile = Boolean(profile);
  const isLocked = requestedLocked === '1' && !hasProfile;
  const screenMode: ProfileModalMode =
    requestedMode === 'create' || !hasProfile ? 'create' : 'edit';

  useEffect(() => {
    let mounted = true;

    async function hydrateProfile() {
      const hydratedProfile = await hydrateMenuSessionProfile();
      if (!mounted) {
        return;
      }

      setProfile(hydratedProfile);
      setName(hydratedProfile?.name ?? '');
      setSelectedEmoji(hydratedProfile?.emoji ?? MENU_AVATARS[0] ?? SMILE_EMOJI);

      if (!hydratedProfile) {
        setActiveTab('profile');
      }
    }

    void hydrateProfile();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLocked) {
      return undefined;
    }

    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
    });
  }, [isLocked, navigation]);

  useEffect(() => {
    if (!profile?.id && activeTab === 'history') {
      setActiveTab('profile');
    }
  }, [activeTab, profile?.id]);

  useEffect(() => {
    let cancelled = false;

    async function warmUpHistoryCache() {
      if (activeTab === 'history') {
        return;
      }

      if (!profile?.id) {
        setHistoryEntries([]);
        return;
      }

      const inMemoryEntries = readCachedHistoryEntries(profile.id);
      if (inMemoryEntries) {
        setHistoryEntries(inMemoryEntries);
      } else {
        setHistoryEntries([]);
      }

      await hydrateMenuHistoryCache();
      if (cancelled) {
        return;
      }

      const hydratedEntries = readCachedHistoryEntries(profile.id);
      if (hydratedEntries) {
        setHistoryEntries(hydratedEntries);
        setHistoryLoading(false);
      }
    }

    void warmUpHistoryCache();

    return () => {
      cancelled = true;
    };
  }, [activeTab, profile?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (activeTab !== 'history') {
        return;
      }

      if (!profile?.id) {
        setHistoryEntries([]);
        setHistoryErrorMessage(null);
        setHistoryLoading(false);
        return;
      }

      const cachedEntries = readCachedHistoryEntries(profile.id);

      if (cachedEntries) {
        setHistoryEntries(cachedEntries);
      }

      setHistoryLoading(!cachedEntries);
      setHistoryErrorMessage(null);

      try {
        const result = await fetchMenuHistory(profile.id);
        if (cancelled) {
          return;
        }

        setHistoryEntries(Array.isArray(result.entries) ? result.entries : []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (!cachedEntries) {
          setHistoryEntries([]);
          setHistoryErrorMessage(UI_TEXT.historyError);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [activeTab, profile?.id]);

  function handleBack() {
    if (isLocked) {
      return;
    }

    if (navigation.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/' as Href);
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      setNameError(UI_TEXT.nameRequired);
      return;
    }

    setIsSubmitting(true);
    setNameError(null);
    setSubmitErrorMessage(null);

    const draftProfile: MenuProfile = {
      id: profile?.id ?? null,
      publicId: profile?.publicId ?? null,
      installationPublicId: profile?.installationPublicId ?? null,
      name: normalizedName,
      emoji: selectedEmoji,
    };

    try {
      const savedProfile = await saveMenuProfileAndSync(draftProfile);
      setProfile(savedProfile);

      if (navigation.canGoBack()) {
        router.back();
      } else {
        router.replace('/' as Href);
      }
    } catch (error) {
      setProfile(getMenuSessionProfile() ?? draftProfile);
      setSubmitErrorMessage(UI_TEXT.saveError);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenHistoryResults(entry: MenuHistoryEntry) {
    if (!entry.can_open_results) {
      return;
    }

    router.push({
      pathname: '/player-game' as Href,
      params: { room: entry.quiz_code, source: 'history' },
    } as Href);
  }

  const cardTitle =
    activeTab === 'history'
      ? UI_TEXT.historyTitle
      : (screenMode === 'edit' ? UI_TEXT.editProfile : UI_TEXT.introTitle);
  const cardSubtitle =
    activeTab === 'history' ? UI_TEXT.historySubtitle : UI_TEXT.profileSubtitle;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <MenuBackground />

        <ScrollView
          bounces={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.container}>
            <View style={styles.header}>
              {!isLocked ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleBack}
                  style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
                  <FontAwesome6
                    color={menuTheme.colors.primary}
                    iconStyle="solid"
                    name="chevron-left"
                    size={18}
                  />
                  <Text style={styles.backButtonText}>{UI_TEXT.back}</Text>
                </Pressable>
              ) : null}

              <Text numberOfLines={1} style={styles.headerTitle}>
                {UI_TEXT.myProfile}
              </Text>
            </View>

            <View style={styles.surface}>
              <View style={styles.tabsRow}>
                <ProfileTabButton
                  active={activeTab === 'profile'}
                  icon="user"
                  label={UI_TEXT.profileTab}
                  onPress={() => setActiveTab('profile')}
                />
                <ProfileTabButton
                  active={activeTab === 'history'}
                  disabled={!profile?.id}
                  icon="clock"
                  label={UI_TEXT.historyTab}
                  onPress={() => setActiveTab('history')}
                />
              </View>

              {activeTab === 'profile' ? (
                <View style={[styles.panel, styles.profilePanel]}>
                  <View style={styles.profileForm}>
                    <MenuTextField
                      autoCapitalize="words"
                      error={nameError}
                      icon={selectedEmoji}
                      label={UI_TEXT.yourName}
                      maxLength={15}
                      onChangeText={setName}
                      value={name}
                    />

                    <AvatarPicker
                      avatars={MENU_AVATARS}
                      onSelect={setSelectedEmoji}
                      selectedAvatar={selectedEmoji}
                    />

                    {submitErrorMessage ? (
                      <View style={styles.errorCard}>
                        <Text style={styles.errorCardText}>{submitErrorMessage}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.actions, styles.profileActions]}>
                    <MenuButton
                      label={
                        isSubmitting
                          ? UI_TEXT.saving
                          : `${screenMode === 'edit' ? UI_TEXT.updateProfile : UI_TEXT.saveProfile} ${SPARKLES}`
                      }
                      onPress={handleSubmit}
                    />

                    {!isLocked ? (
                      <MenuButton
                        label={UI_TEXT.backToMenu}
                        onPress={handleBack}
                        variant="ghost"
                      />
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.panel}>
                  <ProfileHistorySection
                    entries={historyEntries}
                    errorMessage={historyErrorMessage}
                    loading={historyLoading}
                    onOpenResults={handleOpenHistoryResults}
                  />
                </View>
              )}
            </View>
          </View>
        </ScrollView>
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
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 24,
  },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
  },
  header: {
    position: 'relative',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: 18,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 12,
  },
  backButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  backButtonText: {
    color: menuTheme.colors.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  headerTitle: {
    paddingHorizontal: 92,
    color: menuTheme.colors.title,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  surface: {
    flexGrow: 1,
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: menuTheme.colors.card,
    paddingHorizontal: 5,
    paddingTop: 18,
    paddingBottom: 30,
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.74)',
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    borderColor: menuTheme.colors.primary,
    backgroundColor: menuTheme.colors.primary,
  },
  tabButtonDisabled: {
    opacity: 0.5,
  },
  tabButtonPressed: {
    transform: [{ scale: 0.985 }],
  },
  tabButtonText: {
    color: menuTheme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  panel: {
    marginTop: 18,
    gap: 16,
  },
  profilePanel: {
    flexGrow: 1,
  },
  profileForm: {
    gap: 16,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  profileActions: {
    marginTop: 'auto',
    paddingTop: 18,
  },
  errorCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.18)',
    backgroundColor: 'rgba(255, 245, 245, 0.92)',
  },
  errorCardText: {
    color: menuTheme.colors.dangerText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
