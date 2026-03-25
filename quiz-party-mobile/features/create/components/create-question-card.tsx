import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CreateSwipeDelete } from '@/features/create/components/create-swipe-delete';
import { CreateQuizQuestion } from '@/features/create/types';
import { createTheme } from '@/features/create/theme/create-theme';

type CreateQuestionCardProps = {
  question: CreateQuizQuestion;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
};

// Карточка превью уже добавленного вопроса.
// Удаление теперь тоже работает свайпом влево с haptic-откликом.
export function CreateQuestionCard({
  question,
  index,
  onEdit,
  onDelete,
}: CreateQuestionCardProps) {
  return (
    <CreateSwipeDelete label="Удалить вопрос" onDelete={onDelete}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{index + 1}</Text>
          </View>

          <Text style={styles.questionText}>{question.text}</Text>

          <View style={styles.actions}>
            <Pressable hitSlop={10} onPress={onEdit} style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}>
              <FontAwesome6 color={createTheme.colors.purple} iconStyle="solid" name="pen" size={14} />
            </Pressable>
          </View>
        </View>

        {question.type === 'options' && question.options ? (
          <View style={styles.optionsGrid}>
            {question.options.map((option) => {
              const isCorrect = option === question.correct;

              return (
                <View key={`${question.text}-${option}`} style={[
                  styles.optionPreview,
                  isCorrect && styles.optionPreviewCorrect,
                ]}>
                  <Text style={[styles.optionPreviewText, isCorrect && styles.optionPreviewTextCorrect]}>
                    {option}
                  </Text>
                  {isCorrect ? (
                    <FontAwesome6 color={createTheme.colors.success} iconStyle="solid" name="check" size={12} />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.correctTextBadge}>
            <Text style={styles.correctTextLabel}>Ответ: {question.correct}</Text>
          </View>
        )}
      </View>
    </CreateSwipeDelete>
  );
}

const styles = StyleSheet.create({
  // Основная карточка вопроса в списке.
  card: {
    marginBottom: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d65aff',
    borderRadius: 14,
    backgroundColor: 'rgba(252, 233, 248, 0.50)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Верхняя строка: номер, текст вопроса и действие редактирования.
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },

  numberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: createTheme.colors.purple,
  },

  numberText: {
    color: createTheme.colors.white,
    fontSize: 11,
    fontWeight: '700',
  },

  questionText: {
    flex: 1,
    minWidth: 0,
    color: createTheme.colors.purple,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },

  actions: {
    flexDirection: 'row',
    gap: 4,
  },

  actionButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionButtonPressed: {
    transform: [{ scale: 0.94 }],
  },

  // Сетка вариантов ответа для вопросов с выбором.
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },

  optionPreview: {
    minWidth: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dcdde1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  optionPreviewCorrect: {
    borderColor: '#2ecc71',
    backgroundColor: '#e8fff3',
  },

  optionPreviewText: {
    flex: 1,
    color: createTheme.colors.text,
    fontSize: 12,
    lineHeight: 15,
  },

  optionPreviewTextCorrect: {
    color: '#27ae60',
    fontWeight: '700',
  },

  // Зелёная плашка для текстового правильного ответа.
  correctTextBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2ecc71',
    borderRadius: 8,
    backgroundColor: '#e8fff3',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  correctTextLabel: {
    color: '#27ae60',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
});
