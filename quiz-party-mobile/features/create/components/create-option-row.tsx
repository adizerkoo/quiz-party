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
  onFocus?: () => void;
  inputRef?: (input: TextInput | null) => void;
};

// Одна строка варианта ответа.
// Удаление работает тем же жестом, что и у карточки вопроса:
// свайп влево показывает корзину за строкой и после порога удаляет вариант.
export function CreateOptionRow({
  value,
  index,
  isCorrect,
  removable,
  onChangeText,
  onSelectCorrect,
  onRemove,
  onClear,
  onFocus,
  inputRef,
}: CreateOptionRowProps) {
  return (
    <CreateSwipeDelete
      disabled={!removable}
      onDelete={onRemove}>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            placeholder={`Вариант ${index + 1}`}
            placeholderTextColor={createTheme.colors.muted}
            selectionColor={createTheme.colors.purple}
            style={[styles.input, isCorrect && styles.inputCorrect]}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
          />

          {value ? (
            <Pressable
              hitSlop={10}
              onPress={onClear}
              style={({ pressed }) => [
                styles.clearButton,
                pressed && styles.clearButtonPressed,
              ]}>
              <FontAwesome6 color="#888888" iconStyle="solid" name="xmark" size={14} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          hitSlop={10}
          onPress={onSelectCorrect}
          style={[
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

  // Обёртка input нужна, чтобы разместить крестик очистки прямо внутри поля.
  inputWrap: {
    flex: 1,
    position: 'relative',
  },

  // Основное поле варианта ответа.
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

  // Подсветка правильного ответа ложится именно на input, а не на всю строку.
  inputCorrect: {
    borderColor: createTheme.colors.success,
    backgroundColor: createTheme.colors.successSoft,
  },

  // Крестик очищает текст в поле, не затрагивая сам вариант.
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

  // Радиокнопка выбирает правильный вариант ответа.
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
