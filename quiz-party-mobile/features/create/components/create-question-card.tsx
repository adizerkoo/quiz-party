import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { createTheme } from '@/features/create/theme/create-theme';
import { CreateQuizQuestion } from '@/features/create/types';

type CreateQuestionCardProps = {
  question: CreateQuizQuestion;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
};

// Карточка превью добавленного вопроса.
// Здесь оставляем только swipe-управление:
// вправо — редактирование с возвратом карточки назад,
// влево — удаление вопроса.
export function CreateQuestionCard({
  question,
  index,
  onEdit,
  onDelete,
}: CreateQuestionCardProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const hapticDirectionRef = useRef<'left' | 'right' | null>(null);
  const editQueuedRef = useRef(false);

  function handleWillOpen(direction: 'left' | 'right') {
    // Haptic даём один раз в момент, когда пользователь дотянул свайп до порога действия.
    if (hapticDirectionRef.current !== direction) {
      hapticDirectionRef.current = direction;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Для редактирования карточка не должна улетать за экран:
    // сначала закрываем свайп обратно, затем открываем режим редактирования.
    if (direction === 'left' && !editQueuedRef.current) {
      editQueuedRef.current = true;

      requestAnimationFrame(() => {
        swipeableRef.current?.close();
        setTimeout(() => {
          onEdit();
        }, 120);
      });
    }
  }

  function handleOpen(direction: 'left' | 'right') {
    // Редактирование уже запустили на стадии willOpen, поэтому здесь просто закрываем свайп.
    if (direction === 'left') {
      swipeableRef.current?.close();
      return;
    }

    // Для удаления подтверждаем свайп и удаляем вопрос.
    swipeableRef.current?.close();
    onDelete();
  }

  function handleClose() {
    hapticDirectionRef.current = null;
    editQueuedRef.current = false;
  }

  function renderEditAction(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    const translateX = dragX.interpolate({
      inputRange: [0, 96],
      outputRange: [-18, 0],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [0, 24, 96],
      outputRange: [0, 0.7, 1],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.swipeRail, styles.swipeRailLeft]}>
        <Animated.View
          style={[
            styles.swipeIconBubble,
            styles.swipeIconBubbleEdit,
            { opacity, transform: [{ translateX }] },
          ]}>
          <FontAwesome6 color={createTheme.colors.white} iconStyle="solid" name="pen" size={16} />
        </Animated.View>
      </View>
    );
  }

  function renderDeleteAction(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    const translateX = dragX.interpolate({
      inputRange: [-96, 0],
      outputRange: [0, 18],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [-96, -24, 0],
      outputRange: [1, 0.7, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.swipeRail, styles.swipeRailRight]}>
        <Animated.View
          style={[
            styles.swipeIconBubble,
            styles.swipeIconBubbleDelete,
            { opacity, transform: [{ translateX }] },
          ]}>
          <FontAwesome6 color={createTheme.colors.white} iconStyle="solid" name="trash" size={16} />
        </Animated.View>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      containerStyle={styles.swipeContainer}
      dragOffsetFromLeftEdge={18}
      dragOffsetFromRightEdge={18}
      friction={1.8}
      leftThreshold={92}
      onSwipeableClose={handleClose}
      onSwipeableOpen={handleOpen}
      onSwipeableWillOpen={handleWillOpen}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderEditAction}
      renderRightActions={renderDeleteAction}
      rightThreshold={92}>
      <View style={styles.cardFrame}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>

            <Text style={styles.questionText}>{question.text}</Text>
          </View>

          {question.type === 'options' && question.options ? (
            <View style={styles.optionsGrid}>
              {question.options.map((option) => {
                const isCorrect = option === question.correct;

                return (
                  <View
                    key={`${question.text}-${option}`}
                    style={[
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
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // Внешний контейнер свайпа задаёт ритм списка вопросов.
  swipeContainer: {
    marginBottom: 8,
  },

  // Рама нужна, чтобы иконки свайпа появлялись прямо за карточкой.
  cardFrame: {
    position: 'relative',
    borderRadius: 14,
  },

  // Основная визуальная карточка вопроса.
  card: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d65aff',
    borderRadius: 14,
    backgroundColor: 'rgba(252, 233, 248, 0.50)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },

  // Полоса действия за карточкой во время свайпа.
  swipeRail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Левая полоса используется для действия редактирования.
  swipeRailLeft: {
    alignItems: 'flex-start',
    paddingLeft: 16,
  },

  // Правая полоса используется для действия удаления.
  swipeRailRight: {
    alignItems: 'flex-end',
    paddingRight: 16,
  },

  // Базовый круглый контейнер иконки в стиле Telegram.
  swipeIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Фиолетовая иконка редактирования.
  swipeIconBubbleEdit: {
    backgroundColor: createTheme.colors.purple,
  },

  // Красная иконка удаления.
  swipeIconBubbleDelete: {
    backgroundColor: createTheme.colors.danger,
  },

  // Верхняя строка карточки: номер вопроса и его текст.
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },

  // Круглый бейдж с порядковым номером вопроса.
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

  // Текст вопроса занимает всё свободное место по ширине карточки.
  questionText: {
    flex: 1,
    minWidth: 0,
    color: createTheme.colors.purple,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
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
