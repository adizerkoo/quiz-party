import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';

type MenuButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
};

// Универсальная кнопка для модалок.
// primary — основная яркая кнопка,
// ghost — вторичная текстовая кнопка.
export function MenuButton({
  label,
  onPress,
  variant = 'primary',
}: MenuButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        pressed && isPrimary && styles.primaryPressed,
        pressed && !isPrimary && styles.ghostPressed,
      ]}>
      {isPrimary ? (
        <>
          {/* Верхнее свечение, чтобы кнопка не выглядела плоской. */}
          <View style={styles.primaryTopGlow} />

          {/* Диагональный блик поверх кнопки. */}
          <View style={styles.primaryGloss} />
        </>
      ) : null}

      <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.ghostLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Базовая геометрия кнопки.
  // minHeight задаёт удобную высоту для пальца.
  // paddingHorizontal регулирует ширину внутреннего содержимого.
  base: {
    minHeight: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    overflow: 'hidden',
  },

  // Яркая основная кнопка.
  primary: {
    backgroundColor: menuTheme.colors.primary,
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },

  // Нажатое состояние основной кнопки.
  primaryPressed: {
    backgroundColor: menuTheme.colors.primaryPressed,
    transform: [{ scale: 0.98 }],
  },

  // Прозрачная вторичная кнопка.
  ghost: {
    backgroundColor: 'transparent',
  },

  // Нажатое состояние ghost-кнопки.
  ghostPressed: {
    opacity: 0.7,
  },

  // Светлая верхняя часть кнопки для объёма.
  primaryTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: '#8b7aff',
    opacity: 0.3,
  },

  // Диагональный блик.
  primaryGloss: {
    position: 'absolute',
    top: 0,
    left: -90,
    width: 110,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ skewX: '-20deg' }],
  },

  // Базовый текст кнопки.
  label: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Белый текст основной кнопки.
  primaryLabel: {
    color: '#ffffff',
  },

  // Более спокойный текст вторичной кнопки.
  ghostLabel: {
    color: '#b2bec3',
    fontSize: 14,
    fontWeight: '600',
  },
});
