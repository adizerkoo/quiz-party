import { StyleSheet, Text, View } from 'react-native';

import { MenuButton } from '@/features/menu/components/menu-button';
import { MenuModalShell } from '@/features/menu/components/menu-modal-shell';
import { menuTheme } from '@/features/menu/theme/menu-theme';

type MenuInfoModalProps = {
  visible: boolean;
  onClose: () => void;
};

// Общая информационная модалка о том, как устроена игра.
export function MenuInfoModal({ visible, onClose }: MenuInfoModalProps) {
  return (
    <MenuModalShell
      icon="!"
      iconPosition="left"
      onRequestClose={onClose}
      subtitle="Коротко объясняет, как работает Quiz Party для организатора и игрока."
      title="О игре"
      visible={visible}>
      <View style={styles.box}>
        <Text style={styles.text}>
          Организатор создаёт квиз и запускает комнату, а игроки входят по коду
          комнаты. Сначала каждый выбирает имя и смайлик, после чего может
          возвращаться в игру уже только по коду.
        </Text>
      </View>

      <MenuButton label="Понятно" onPress={onClose} />
    </MenuModalShell>
  );
}

const styles = StyleSheet.create({
  // Небольшая внутренняя обёртка текста.
  box: {
    paddingVertical: 4,
  },

  // Основной текст модалки.
  text: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: menuTheme.colors.subtitle,
  },
});
