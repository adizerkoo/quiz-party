import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'launch';
  icon?: ReactNode;
  disabled?: boolean;
};

// Универсальная кнопка для экрана создания.
// Здесь оставляем обычное поведение без long-press эффектов,
// чтобы CTA был стабильным и не мешал основному сценарию.
export function CreateActionButton({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled = false,
}: CreateActionButtonProps) {
  const isLaunch = tone === 'launch';

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isLaunch ? styles.launchButton : styles.primaryButton,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}>
      <View style={styles.content}>
        {icon}
        <Text style={[styles.label, isLaunch ? styles.launchLabel : styles.primaryLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Базовый контейнер кнопки.
  button: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Розовая кнопка внутри формы создания вопроса.
  primaryButton: {
    width: '100%',
    minHeight: 54,
    // Отступ сверху не даёт кнопке прилипать к полям формы.
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: createTheme.colors.pink,
  },

  // Крупная нижняя CTA-кнопка запуска игры.
  launchButton: {
    width: '100%',
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: createTheme.colors.purple,
    shadowColor: createTheme.colors.launchGlow,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  // Обычное состояние нажатия делает кнопку чуть компактнее.
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.97,
  },

  // Полупрозрачность для неактивного состояния.
  buttonDisabled: {
    opacity: 0.5,
  },

  // Внутренний ряд текста и иконки.
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },

  label: {
    textAlign: 'center',
    fontWeight: '800',
  },

  primaryLabel: {
    color: createTheme.colors.white,
    fontSize: 16,
  },

  launchLabel: {
    color: createTheme.colors.white,
    fontSize: 18,
    letterSpacing: 0.2,
  },
});
