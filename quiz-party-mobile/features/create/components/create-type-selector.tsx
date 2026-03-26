import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CreateQuestionType } from '@/features/create/types';
import { createTheme } from '@/features/create/theme/create-theme';

type CreateTypeSelectorProps = {
  value: CreateQuestionType;
  onChange: (nextType: CreateQuestionType) => void;
};

// Переключатель между текстовым ответом и ответом с вариантами.
export function CreateTypeSelector({ value, onChange }: CreateTypeSelectorProps) {
  return (
    <View style={styles.row}>
      <TypeChip
        active={value === 'text'}
        icon="pen"
        label="Текст"
        onPress={() => onChange('text')}
      />
      <TypeChip
        active={value === 'options'}
        icon="circle-dot"
        label="Выбор"
        onPress={() => onChange('options')}
      />
    </View>
  );
}

type TypeChipProps = {
  active: boolean;
  label: string;
  icon: 'pen' | 'circle-dot';
  onPress: () => void;
};

function TypeChip({ active, label, icon, onPress }: TypeChipProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.chip,
      active && styles.chipActive,
      pressed && styles.chipPressed,
    ]}>
      <FontAwesome6
        color={active ? createTheme.colors.purple : createTheme.colors.textSoft}
        iconStyle="solid"
        name={icon}
        size={15}
      />
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Горизонтальный ряд двух переключателей типа вопроса.
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },

  // Базовый вид одной плашки типа.
  chip: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#eeeeee',
    backgroundColor: createTheme.colors.white,
  },

  // Активный тип повторяет фиолетовую подсветку web-версии.
  chipActive: {
    borderColor: createTheme.colors.purple,
    backgroundColor: '#f8f7ff',
    shadowColor: createTheme.colors.purple,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  chipPressed: {
    transform: [{ scale: 0.98 }],
  },

  chipLabel: {
    color: createTheme.colors.textSoft,
    fontSize: 15,
    fontWeight: '700',
  },

  chipLabelActive: {
    color: createTheme.colors.purple,
  },
});
