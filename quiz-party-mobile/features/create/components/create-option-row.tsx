import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CreateSwipeDelete } from '@/features/create/components/create-swipe-delete';
import { createTheme } from '@/features/create/theme/create-theme';

type CreateOptionRowProps = {
  value: string;
  index: number;
  isCorrect: boolean;
  removable: boolean;
  onChangeText: (nextValue: string) => void;
  onSelectCorrect: () => void;
  onRemove: () => void;
  onClear: () => void;
};

// Одна строка варианта ответа.
// Удаление теперь работает свайпом влево, а не через кнопку-корзину.
export function CreateOptionRow({
  value,
  index,
  isCorrect,
  removable,
  onChangeText,
  onSelectCorrect,
  onRemove,
  onClear,
}: CreateOptionRowProps) {
  return (
    <CreateSwipeDelete
      disabled={!removable}
      label="Удалить"
      onDelete={onRemove}>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <TextInput
            placeholder={`Вариант ${index + 1}`}
            placeholderTextColor={createTheme.colors.muted}
            selectionColor={createTheme.colors.purple}
            style={[styles.input, isCorrect && styles.inputCorrect]}
            value={value}
            onChangeText={onChangeText}
          />

          {value ? (
            <Pressable hitSlop={10} onPress={onClear} style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.clearButtonPressed,
            ]}>
              <FontAwesome6 color="#888888" iconStyle="solid" name="xmark" size={14} />
            </Pressable>
          ) : null}
        </View>

        <Pressable hitSlop={10} onPress={onSelectCorrect} style={[
          styles.radio,
          isCorrect && styles.radioChecked,
        ]}>
          {isCorrect ? <View style={styles.radioDot} /> : null}
        </Pressable>
      </View>
    </CreateSwipeDelete>
  );
}

const styles = StyleSheet.create({
  // Горизонтальная строка варианта ответа.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    borderRadius: 14,
  },

  // Обёртка input, чтобы положить внутрь крестик очистки.
  inputWrap: {
    flex: 1,
    position: 'relative',
  },

  input: {
    minHeight: 48,
    paddingLeft: 15,
    paddingRight: 36,
    borderWidth: 2,
    borderColor: 'rgba(108, 92, 231, 0.20)',
    borderRadius: 12,
    backgroundColor: createTheme.colors.white,
    color: createTheme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  // Подсветка правильного ответа ложится именно на сам input,
  // а не на всю строку вокруг него. Так поле не сжимается визуально.
  inputCorrect: {
    borderColor: createTheme.colors.success,
    backgroundColor: createTheme.colors.successSoft,
  },

  clearButton: {
    position: 'absolute',
    top: '50%',
    right: 10,
    marginTop: -12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },

  // Кастомная круглая радиокнопка выбора правильного ответа.
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#bdc3c7',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: createTheme.colors.white,
  },

  radioChecked: {
    borderColor: '#2d3436',
    backgroundColor: '#2d3436',
  },

  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2ecc71',
  },
});
