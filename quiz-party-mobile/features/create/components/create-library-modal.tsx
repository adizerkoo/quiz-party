import { FontAwesome6 } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CREATE_LIBRARY_CATEGORIES } from '@/features/create/data/create-library-categories';
import {
  CreateLibraryCategoryId,
  CreateLibraryQuestion,
} from '@/features/create/types';
import { createTheme } from '@/features/create/theme/create-theme';

type CreateLibraryModalProps = {
  visible: boolean;
  activeCategory: CreateLibraryCategoryId;
  questions: CreateLibraryQuestion[];
  onClose: () => void;
  onChangeCategory: (category: CreateLibraryCategoryId) => void;
  onImportQuestion: (question: CreateLibraryQuestion) => void;
  onToggleFavorite: (question: CreateLibraryQuestion) => void;
};

// Модалка библиотеки готовых вопросов.
export function CreateLibraryModal({
  visible,
  activeCategory,
  questions,
  onClose,
  onChangeCategory,
  onImportQuestion,
  onToggleFavorite,
}: CreateLibraryModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Готовые вопросы</Text>

            <Pressable onPress={onClose} style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}>
              <FontAwesome6 color="#888888" iconStyle="solid" name="xmark" size={18} />
            </Pressable>
          </View>

          <View style={styles.filters}>
            {CREATE_LIBRARY_CATEGORIES.map((category) => {
              const active = category.id === activeCategory;

              return (
                <Pressable
                  key={category.id}
                  onPress={() => onChangeCategory(category.id)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    active && styles.filterChipActive,
                    pressed && styles.filterChipPressed,
                  ]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}>
            {questions.length ? questions.map((question, index) => (
              <Pressable
                key={`${question.public_id ?? question.text}-${index}`}
                onPress={() => onImportQuestion(question)}
                style={({ pressed }) => [
                  styles.itemCard,
                  pressed && styles.itemCardPressed,
                ]}>
                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <FontAwesome6
                      color={createTheme.colors.purple}
                      iconStyle="solid"
                      name={question.type === 'text' ? 'pen' : 'circle-dot'}
                      size={12}
                    />
                    <Text style={styles.tagText}>
                      {question.type === 'text' ? 'Текст' : 'Выбор'}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onToggleFavorite(question)}
                    style={({ pressed }) => [
                      styles.favoriteButton,
                      question.is_favorite && styles.favoriteButtonActive,
                      pressed && styles.favoriteButtonPressed,
                    ]}>
                    <FontAwesome6
                      color={question.is_favorite ? createTheme.colors.white : createTheme.colors.pink}
                      iconStyle={question.is_favorite ? 'solid' : 'regular'}
                      name="heart"
                      size={13}
                    />
                  </Pressable>
                </View>

                <Text style={styles.itemTitle}>{question.text}</Text>

                <View style={styles.answerBadge}>
                  <FontAwesome6 color={createTheme.colors.success} iconStyle="solid" name="check-double" size={12} />
                  <Text style={styles.answerBadgeText}>Ответ: {question.correct}</Text>
                </View>
              </Pressable>
            )) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  В этой вкладке пока пусто. Добавь вопрос в избранное, и он появится здесь.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Затемнённый фон под модалкой библиотеки.
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.80)',
  },

  // Основной контейнер модалки.
  card: {
    flex: 1,
    maxHeight: '90%',
    borderRadius: 25,
    backgroundColor: createTheme.colors.white,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },

  // Верхняя строка: заголовок и крестик закрытия.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  title: {
    color: createTheme.colors.purple,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f2f6',
  },

  closeButtonPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: '#ffe0e6',
  },

  // Ряд фильтров-категорий.
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },

  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#f1f2f6',
  },

  filterChipActive: {
    borderColor: createTheme.colors.purple,
    backgroundColor: createTheme.colors.purple,
  },

  filterChipPressed: {
    transform: [{ scale: 0.97 }],
  },

  filterChipText: {
    color: createTheme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },

  filterChipTextActive: {
    color: createTheme.colors.white,
  },

  // Отступы скролльного списка вопросов.
  listContent: {
    paddingTop: 14,
    paddingBottom: 10,
  },

  // Карточка одного вопроса из библиотеки.
  itemCard: {
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#f1f2f6',
    borderRadius: 18,
    backgroundColor: '#f8f7ff',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  itemCardPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: createTheme.colors.pink,
    backgroundColor: '#ffffff',
  },

  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  tagText: {
    color: createTheme.colors.purple,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  itemTitle: {
    color: createTheme.colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },

  // Зелёная плашка с правильным ответом.
  answerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2ecc71',
    borderRadius: 8,
    backgroundColor: '#e8fff3',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  answerBadgeText: {
    color: '#27ae60',
    fontSize: 13,
    fontWeight: '700',
  },
  favoriteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 95, 135, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  favoriteButtonActive: {
    borderColor: createTheme.colors.pink,
    backgroundColor: createTheme.colors.pink,
  },
  favoriteButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  emptyState: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f1f2f6',
    backgroundColor: '#faf9ff',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyStateText: {
    color: createTheme.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
