import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateHeaderProps = {
  onBackPress: () => void;
};

// Верхняя панель с нативной кнопкой "Назад" и логотипом QUIZ PARTY.
export function CreateHeader({ onBackPress }: CreateHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBackPress} style={({ pressed }) => [
        styles.backButton,
        pressed && styles.backButtonPressed,
      ]}>
        <FontAwesome6 color={createTheme.colors.purple} iconStyle="solid" name="chevron-left" size={18} />
        <Text style={styles.backButtonText}>Назад</Text>
      </Pressable>

      <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.title}>
        QUIZ PARTY
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Контейнер шапки. Заголовок центрируется, а кнопка живёт поверх слева.
  header: {
    position: 'relative',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: 20,
  },

  // Нативная кнопка "Назад": лёгкая, без тяжелой плашки.
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 10,
  },

  backButtonPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.97 }],
  },

  backButtonText: {
    color: createTheme.colors.purple,
    fontSize: 17,
    fontWeight: '600',
  },

  // У заголовка есть боковой запас, чтобы текст не упирался в кнопку "Назад".
  title: {
    paddingHorizontal: 92,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '900',
    color: createTheme.colors.purpleDark,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
});
