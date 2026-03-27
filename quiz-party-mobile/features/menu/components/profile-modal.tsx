import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AvatarPicker } from '@/features/menu/components/avatar-picker';
import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuModalShell } from '@/features/menu/components/menu-modal-shell';
import { MenuTextField } from '@/features/menu/components/menu-text-field';
import { MenuProfile, ProfileModalMode } from '@/features/menu/types';

type ProfileModalProps = {
  avatars: string[];
  initialProfile: MenuProfile | null;
  locked?: boolean;
  mode: ProfileModalMode;
  visible: boolean;
  onClose: () => void;
  onSubmit: (profile: MenuProfile) => void;
};

export function ProfileModal({
  avatars,
  initialProfile,
  locked = false,
  mode,
  visible,
  onClose,
  onSubmit,
}: ProfileModalProps) {
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(avatars[0] ?? '🙂');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName(initialProfile?.name ?? '');
    setSelectedEmoji(initialProfile?.emoji ?? avatars[0] ?? '🙂');
    setNameError(null);
  }, [avatars, initialProfile, visible]);

  function handleSubmit() {
    const normalizedName = name.trim();

    if (!normalizedName) {
      setNameError('Пожалуйста, представься');
      return;
    }

    setNameError(null);
    onSubmit({
      id: initialProfile?.id ?? null,
      publicId: initialProfile?.publicId ?? null,
      installationPublicId: initialProfile?.installationPublicId ?? null,
      name: normalizedName,
      emoji: selectedEmoji,
    });
  }

  return (
    <MenuModalShell
      icon=""
      locked={locked}
      onRequestClose={onClose}
      title={mode === 'edit' ? 'Редактировать профиль' : 'Сначала познакомимся'}
      visible={visible}>
      <MenuTextField
        autoCapitalize="words"
        error={nameError}
        icon={selectedEmoji}
        label="Твоё имя"
        maxLength={15}
        onChangeText={setName}
        value={name}
      />

      <AvatarPicker
        avatars={avatars}
        onSelect={setSelectedEmoji}
        selectedAvatar={selectedEmoji}
      />

      <View style={styles.actions}>
        <MenuButton
          label={mode === 'edit' ? 'Обновить профиль ✨' : 'Сохранить профиль ✨'}
          onPress={handleSubmit}
        />

        {!locked ? <MenuButton label="Отмена" onPress={onClose} variant="ghost" /> : null}
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
