import { Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuModalShell } from '@/features/menu/components/menu-modal-shell';
import { MenuTextField } from '@/features/menu/components/menu-text-field';
import { MenuProfile } from '@/features/menu/types';

type JoinModalProps = {
  profile: MenuProfile;
  visible: boolean;
  onClose: () => void;
};

export function JoinModal({ profile, visible, onClose }: JoinModalProps) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setRoomCode('');
    setError(null);
    setIsInputFocused(false);
  }, [visible]);

  function handlePreviewJoin() {
    const normalizedCode = roomCode.trim().toUpperCase();

    if (!normalizedCode) {
      setError('Нужен код, чтобы войти 🔑');
      return;
    }

    setError(null);
    onClose();
    router.push({
      pathname: '/player-game' as Href,
      params: { room: normalizedCode },
    } as Href);
  }

  return (
    <MenuModalShell
      cardOffsetY={isInputFocused ? -60 : -60}
      icon="🔑"
      iconPosition="left"
      onRequestClose={onClose}
      subtitle={`У тебя уже есть код комнаты, ${profile.name}? Введи его ниже и присоединяйся к игре!`}
      title="Вход в игру"
      visible={visible}>
      <MenuTextField
        autoCapitalize="characters"
        error={error}
        icon="🚪"
        label="Код комнаты"
        maxLength={11}
        onBlur={() => setIsInputFocused(false)}
        onChangeText={(value) => setRoomCode(value.toUpperCase())}
        onFocus={() => setIsInputFocused(true)}
        value={roomCode}
      />

      <View style={styles.actions}>
        <MenuButton label="Войти в игру 🚀" onPress={handlePreviewJoin} />
        <MenuButton label="Вернуться назад" onPress={onClose} variant="ghost" />
      </View>
    </MenuModalShell>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    marginTop: 4,
  },
});
