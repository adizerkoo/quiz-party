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

const UI_TEXT = {
  missingCode: 'Нужен код, чтобы войти',
  title: 'Вход в игру',
  subtitlePrefix:
    'У тебя уже есть код комнаты,',
  subtitleSuffix:
    'Введи его ниже и присоединяйся к игре!',
  roomCode: 'Код комнаты',
  join: 'Войти в игру',
  back: 'Вернуться назад',
};

const KEY_EMOJI = String.fromCodePoint(0x1f511);
const DOOR_EMOJI = String.fromCodePoint(0x1f6aa);
const ROCKET_EMOJI = String.fromCodePoint(0x1f680);

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
      setError(`${UI_TEXT.missingCode} ${KEY_EMOJI}`);
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
      icon={KEY_EMOJI}
      iconPosition="left"
      onRequestClose={onClose}
      subtitle={`${UI_TEXT.subtitlePrefix} ${profile.name}? ${UI_TEXT.subtitleSuffix}`}
      title={UI_TEXT.title}
      visible={visible}>
      <MenuTextField
        autoCapitalize="characters"
        error={error}
        icon={DOOR_EMOJI}
        label={UI_TEXT.roomCode}
        maxLength={11}
        onBlur={() => setIsInputFocused(false)}
        onChangeText={(value) => setRoomCode(value.toUpperCase())}
        onFocus={() => setIsInputFocused(true)}
        value={roomCode}
      />

      <View style={styles.actions}>
        <MenuButton label={`${UI_TEXT.join} ${ROCKET_EMOJI}`} onPress={handlePreviewJoin} />
        <MenuButton label={UI_TEXT.back} onPress={onClose} variant="ghost" />
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
