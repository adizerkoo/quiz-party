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

// Универсальная кнопка для экрана создания:
// обычная розовая для "Добавить вопрос" и крупная сияющая для запуска игры.
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
      {isLaunch ? <View pointerEvents="none" style={styles.glowBand} /> : null}

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

  // Обычная розовая кнопка добавления вопроса.
  primaryButton: {
    width: '100%',
    minHeight: 54,
    // Небольшой верхний отступ не даёт кнопке прилипать к полю ответа
    // в текстовом режиме и визуально делает форму аккуратнее.
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: createTheme.colors.pink,
  },

  // Крупная нижняя кнопка запуска игры.
  launchButton: {
    width: '100%',
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: createTheme.colors.purple,
    shadowColor: createTheme.colors.launchGlow,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  // Состояние нажатия.
  buttonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.96,
  },

  // Полупрозрачность для неактивной кнопки.
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

  // Бегущий световой блик, как у web-кнопки запуска.
  glowBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -40,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ skewX: '-18deg' }],
  },
});
