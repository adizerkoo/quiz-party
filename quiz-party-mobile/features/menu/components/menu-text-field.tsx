import { StyleSheet, Text, TextInput, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';

type MenuTextFieldProps = {
  label: string;
  icon: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
};

// Универсальное поле ввода для модалок меню.
// Сделано максимально прямолинейно и без "магии",
// чтобы его было проще менять и отлаживать.
export function MenuTextField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  error,
  autoFocus,
  autoCapitalize = 'sentences',
  maxLength,
  onFocus,
  onBlur,
}: MenuTextFieldProps) {
  return (
    <View style={styles.wrap}>
      {/* Подпись над полем. */}
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.field, error ? styles.fieldError : null]}>
        {/* Иконка не должна перехватывать касания, поэтому pointerEvents="none". */}
        <View pointerEvents="none" style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>

        <TextInput
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onBlur={onBlur}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={menuTheme.colors.muted}
          style={styles.input}
          value={value}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Общая колонка: подпись, поле и текст ошибки.
  wrap: {
    gap: 6,
  },

  // Подпись над полем.
  label: {
    marginLeft: 2,
    fontSize: 12,
    lineHeight: 16,
    color: menuTheme.colors.joinBorder,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Внешняя обводка поля ввода.
  // minHeight управляет общей высотой поля.
  // paddingLeft / paddingRight отвечают за внутренние боковые отступы.
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: menuTheme.colors.input,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingLeft: 10,
    paddingRight: 12,
  },

  // Ошибочное состояние поля.
  fieldError: {
    borderColor: menuTheme.colors.dangerText,
    backgroundColor: menuTheme.colors.dangerSoft,
  },

  // Зона иконки слева.
  // width определяет, сколько места зарезервировано под эмодзи.
  iconWrap: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  // Размер самой иконки.
  icon: {
    fontSize: 18,
    opacity: 0.9,
  },

  // Сам TextInput.
  // flex: 1 даёт полю занять всё доступное место справа от иконки.
  // minHeight полезен, чтобы поле оставалось удобным для тапа.
  input: {
    flex: 1,
    minHeight: 56,
    fontSize: 16,
    color: menuTheme.colors.text,
    fontWeight: '600',
    paddingVertical: 0,
  },

  // Подпись ошибки под полем.
  error: {
    marginLeft: 2,
    fontSize: 12,
    lineHeight: 16,
    color: menuTheme.colors.dangerText,
    fontWeight: '700',
  },
});
