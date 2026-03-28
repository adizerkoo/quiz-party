import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuFavoriteQuestion } from '@/features/menu/types';

type ProfileFavoritesSectionProps = {
  entries: MenuFavoriteQuestion[];
  loading: boolean;
  errorMessage?: string | null;
  onAddNew: () => void;
  onReuse: (question: MenuFavoriteQuestion) => void;
  onRemove: (question: MenuFavoriteQuestion) => void;
};

const UI_TEXT = {
  title: 'Избранные вопросы',
  subtitle: 'Тут живут твои сохранённые идеи и заготовки для новых игр.',
  loading: 'Загружаем избранные вопросы...',
  empty: 'Пока здесь пусто. Сохрани вопрос в избранное, и он появится в этой вкладке.',
  addNew: 'Добавить вопрос',
  reuse: 'В create',
  remove: 'Убрать',
  answer: 'Ответ',
  options: 'Выбор',
  text: 'Текст',
};

function StateCard({ message }: { message: string }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

export function ProfileFavoritesSection({
  entries,
  loading,
  errorMessage,
  onAddNew,
  onReuse,
  onRemove,
}: ProfileFavoritesSectionProps) {
  let content = null;

  if (loading) {
    content = <StateCard message={UI_TEXT.loading} />;
  } else if (errorMessage) {
    content = <StateCard message={errorMessage} />;
  } else if (!entries.length) {
    content = <StateCard message={UI_TEXT.empty} />;
  } else {
    content = (
      <View style={styles.list}>
        {entries.map((entry, index) => (
          <View
            key={`${entry.public_id ?? entry.text}-${index}`}
            style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>
                  {entry.type === 'text' ? UI_TEXT.text : UI_TEXT.options}
                </Text>
              </View>
              {entry.source === 'user' ? (
                <View style={[styles.typePill, styles.privatePill]}>
                  <Text style={[styles.typePillText, styles.privatePillText]}>Личное</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.questionText}>{entry.text}</Text>
            <Text style={styles.answerText}>{UI_TEXT.answer}: {entry.correct}</Text>

            <View style={styles.actionsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onReuse(entry)}
                style={({ pressed }) => [
                  styles.primaryAction,
                  pressed && styles.primaryActionPressed,
                ]}>
                <Text style={styles.primaryActionText}>{UI_TEXT.reuse}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => onRemove(entry)}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed && styles.secondaryActionPressed,
                ]}>
                <Text style={styles.secondaryActionText}>{UI_TEXT.remove}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{UI_TEXT.title}</Text>
          <Text style={styles.subtitle}>{UI_TEXT.subtitle}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onAddNew}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}>
          <Text style={styles.addButtonText}>{UI_TEXT.addNew}</Text>
        </Pressable>
      </View>

      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  header: {
    gap: 12,
  },
  headerCopy: {
    gap: 6,
  },
  title: {
    color: menuTheme.colors.title,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: menuTheme.colors.subtitle,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  addButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(95, 255, 98, 0.18)',
    backgroundColor: 'rgba(95, 255, 106, 0.16)',
  },
  addButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  addButtonText: {
    color: '#487246c1',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  list: {
    gap: 10,
  },
  stateCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  stateText: {
    color: menuTheme.colors.hint,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(108, 92, 231, 0.1)',
  },
  typePillText: {
    color: menuTheme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  privatePill: {
    backgroundColor: 'rgba(255, 95, 135, 0.1)',
  },
  privatePillText: {
    color: menuTheme.colors.create,
  },
  questionText: {
    marginTop: 10,
    color: menuTheme.colors.title,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
  },
  answerText: {
    marginTop: 10,
    color: menuTheme.colors.subtitle,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  primaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: menuTheme.colors.primary,
  },
  primaryActionPressed: {
    transform: [{ scale: 0.98 }],
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  secondaryAction: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 95, 135, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  secondaryActionPressed: {
    transform: [{ scale: 0.98 }],
  },
  secondaryActionText: {
    color: menuTheme.colors.create,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
