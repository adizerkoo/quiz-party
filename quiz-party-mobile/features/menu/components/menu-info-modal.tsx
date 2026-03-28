import { StyleSheet, Text, View } from 'react-native';

import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuModalShell } from '@/features/menu/components/menu-modal-shell';
import { menuTheme } from '@/features/menu/theme/menu-theme';

type MenuInfoModalProps = {
  visible: boolean;
  onClose: () => void;
};

const UI_TEXT = {
  title: 'Об игре',
  subtitle:
    'Коротко объясняет, как работает Quiz Party для организатора и игрока.',
  body:
    'Организатор создает квиз и запускает комнату, а игроки входят по коду комнаты. Сначала каждый выбирает имя и смайлик, после чего может возвращаться в игру уже только по коду.',
  ok: 'Понятно',
};

export function MenuInfoModal({ visible, onClose }: MenuInfoModalProps) {
  return (
    <MenuModalShell
      icon="!"
      iconPosition="left"
      onRequestClose={onClose}
      subtitle={UI_TEXT.subtitle}
      title={UI_TEXT.title}
      visible={visible}>
      <View style={styles.box}>
        <Text style={styles.text}>{UI_TEXT.body}</Text>
      </View>

      <MenuButton label={UI_TEXT.ok} onPress={onClose} />
    </MenuModalShell>
  );
}

const styles = StyleSheet.create({
  box: {
    paddingVertical: 4,
  },
  text: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: menuTheme.colors.subtitle,
  },
});
