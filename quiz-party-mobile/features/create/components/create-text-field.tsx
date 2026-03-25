import { FontAwesome6 } from '@expo/vector-icons';
import { forwardRef } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateTextFieldProps = {
  label?: string;
  value: string;
  onChangeText: (nextValue: string) => void;
  placeholder?: string;
  centered?: boolean;
  variant?: 'default' | 'title';
  showClear?: boolean;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
} & Omit<TextInputProps, 'style' | 'value' | 'onChangeText' | 'placeholder'>;

// Универсальное текстовое поле для native create-экрана.
// Используется и для названия квиза, и для текста вопроса, и для ответа.
export const CreateTextField = forwardRef<TextInput, CreateTextFieldProps>(function CreateTextField(
  {
    label,
    value,
    onChangeText,
    placeholder,
    centered = false,
    variant = 'default',
    showClear = false,
    onClear,
    containerStyle,
    ...inputProps
  },
  ref,
) {
  const isTitle = variant === 'title';

  return (
    <View style={[styles.fieldRoot, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.inputWrap, isTitle && styles.titleWrap]}>
        <TextInput
          ref={ref}
          placeholder={placeholder}
          placeholderTextColor={isTitle ? 'rgba(255,133,161,0.6)' : createTheme.colors.muted}
          selectionColor={createTheme.colors.purple}
          style={[
            styles.input,
            isTitle ? styles.titleInput : styles.defaultInput,
            centered && styles.centeredInput,
          ]}
          value={value}
          onChangeText={onChangeText}
          {...inputProps}
        />

        {showClear && value ? (
          <Pressable hitSlop={10} onPress={onClear} style={({ pressed }) => [
            styles.clearButton,
            pressed && styles.clearButtonPressed,
          ]}>
            <FontAwesome6 color="#888888" iconStyle="solid" name="xmark" size={14} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // Корневая обёртка поля всегда занимает всю ширину секции.
  fieldRoot: {
    width: '100%',
  },

  // Подпись над полем.
  label: {
    marginBottom: 10,
    color: createTheme.colors.purple,
    fontSize: 14,
    fontWeight: '700',
  },

  // Внешняя обёртка input, нужна для крестика очистки.
  inputWrap: {
    position: 'relative',
    width: '100%',
  },

  // Дополнительная подсветка для блока с названием вечеринки.
  titleWrap: {
    borderRadius: 12,
    shadowColor: createTheme.colors.pink,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  // Базовый стиль всех текстовых полей.
  input: {
    width: '100%',
    paddingLeft: 14,
    paddingRight: 38,
    borderRadius: 12,
    backgroundColor: createTheme.colors.white,
  },

  // Стандартный input внутри секции создания вопроса.
  defaultInput: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 92, 231, 0.78)',
    color: createTheme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  // Крупный розовый input для названия квиза.
  titleInput: {
    minHeight: 56,
    borderWidth: 3,
    borderColor: createTheme.colors.pink,
    color: createTheme.colors.pink,
    fontSize: 20,
    fontWeight: '800',
  },

  // Центровка текста нужна именно для поля названия.
  centeredInput: {
    textAlign: 'center',
  },

  // Кнопка-крестик справа внутри поля.
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
});
