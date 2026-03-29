import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AvatarPicker } from '@/features/menu/components/avatar-picker';
import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuModalShell } from '@/features/menu/components/menu-modal-shell';
import { MenuTextField } from '@/features/menu/components/menu-text-field';
import { ProfileHistorySection } from '@/features/menu/components/profile-history-section';
import { MenuHistoryEntry, MenuProfile, ProfileModalMode } from '@/features/menu/types';

type ProfileModalProps = {
  avatars: string[];
  historyEntries: MenuHistoryEntry[];
  historyErrorMessage?: string | null;
  historyLoading: boolean;
  initialProfile: MenuProfile | null;
  locked?: boolean;
  mode: ProfileModalMode;
  onHistoryOpen: (entry: MenuHistoryEntry) => void;
  visible: boolean;
  onClose: () => void;
  onSubmit: (profile: MenuProfile) => void;
};

const UI_TEXT = {
  requiredName: 'Пожалуйста, представься',
  editTitle: 'Редактировать профиль',
  createTitle: 'Сначала познакомимся',
  yourName: 'Твое имя',
  updateProfile: 'Обновить профиль',
  saveProfile: 'Сохранить профиль',
  cancel: 'Отмена',
};

const SPARKLES = String.fromCodePoint(0x2728);
const SMILE_EMOJI = String.fromCodePoint(0x1f642);

export function ProfileModal({
  avatars,
  historyEntries,
  historyErrorMessage,
  historyLoading,
  initialProfile,
  locked = false,
  mode,
  onHistoryOpen,
  visible,
  onClose,
  onSubmit,
}: ProfileModalProps) {
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(avatars[0] ?? SMILE_EMOJI);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName(initialProfile?.name ?? '');
    setSelectedEmoji(initialProfile?.emoji ?? avatars[0] ?? SMILE_EMOJI);
    setNameError(null);
  }, [avatars, initialProfile, visible]);

  function handleSubmit() {
    const normalizedName = name.trim();

    if (!normalizedName) {
      setNameError(UI_TEXT.requiredName);
      return;
    }

    setNameError(null);
    onSubmit({
      id: initialProfile?.id ?? null,
      publicId: initialProfile?.publicId ?? null,
      installationPublicId: initialProfile?.installationPublicId ?? null,
      sessionToken: initialProfile?.sessionToken ?? null,
      name: normalizedName,
      emoji: selectedEmoji,
    });
  }

  return (
    <MenuModalShell
      icon=""
      locked={locked}
      onRequestClose={onClose}
      title={mode === 'edit' ? UI_TEXT.editTitle : UI_TEXT.createTitle}
      visible={visible}>
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
        avatars={avatars}
        onSelect={setSelectedEmoji}
        selectedAvatar={selectedEmoji}
      />

      <ProfileHistorySection
        entries={historyEntries}
        errorMessage={historyErrorMessage}
        loading={historyLoading}
        onOpenResults={onHistoryOpen}
        visible={mode === 'edit'}
      />

      <View style={styles.actions}>
        <MenuButton
          label={`${mode === 'edit' ? UI_TEXT.updateProfile : UI_TEXT.saveProfile} ${SPARKLES}`}
          onPress={handleSubmit}
        />

        {!locked ? <MenuButton label={UI_TEXT.cancel} onPress={onClose} variant="ghost" /> : null}
      </View>
    </MenuModalShell>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    marginTop: 2,
  },
});
