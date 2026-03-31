import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'launch';
  icon?: ReactNode;
  disabled?: boolean;
  eyebrow?: string;
  helperText?: string;
  badgeText?: string;
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
  eyebrow,
  helperText,
  badgeText,
}: CreateActionButtonProps) {
  const isLaunch = tone === 'launch';
  const hasDetails = Boolean(eyebrow || helperText || badgeText);

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
      {hasDetails ? (
        <View style={styles.contentDetailed}>
          <View style={styles.leadingCluster}>
            {icon ? <View style={styles.iconWrap}>{icon}</View> : null}

            <View style={styles.textBlock}>
              {eyebrow ? (
                <Text numberOfLines={1} style={[styles.eyebrow, isLaunch ? styles.launchEyebrow : styles.primaryEyebrow]}>
                  {eyebrow}
                </Text>
              ) : null}

              <Text
                numberOfLines={1}
                style={[styles.label, styles.detailLabel, isLaunch ? styles.launchLabel : styles.primaryLabel]}>
                {label}
              </Text>

              {helperText ? (
                <Text
                  numberOfLines={2}
                  style={[styles.helperText, isLaunch ? styles.launchHelperText : styles.primaryHelperText]}>
                  {helperText}
                </Text>
              ) : null}
            </View>
          </View>

          {badgeText ? (
            <View style={[styles.badge, isLaunch ? styles.launchBadge : styles.primaryBadge]}>
              <Text style={[styles.badgeText, isLaunch ? styles.launchBadgeText : styles.primaryBadgeText]}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, isLaunch ? styles.launchLabel : styles.primaryLabel]}>{label}</Text>
        </View>
      )}
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

  contentDetailed: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },

  leadingCluster: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  textBlock: {
    flex: 1,
    minWidth: 0,
  },

  label: {
    textAlign: 'center',
    fontWeight: '800',
  },

  detailLabel: {
    textAlign: 'left',
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

  eyebrow: {
    marginBottom: 2,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  primaryEyebrow: {
    color: 'rgba(255, 255, 255, 0.78)',
  },

  launchEyebrow: {
    color: 'rgba(255, 255, 255, 0.78)',
  },

  helperText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },

  primaryHelperText: {
    color: 'rgba(255, 255, 255, 0.88)',
  },

  launchHelperText: {
    color: 'rgba(255, 255, 255, 0.84)',
  },

  badge: {
    minWidth: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  launchBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },

  primaryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },

  badgeText: {
    fontSize: 16,
    fontWeight: '900',
  },

  launchBadgeText: {
    color: createTheme.colors.white,
  },

  primaryBadgeText: {
    color: createTheme.colors.white,
  },
});
