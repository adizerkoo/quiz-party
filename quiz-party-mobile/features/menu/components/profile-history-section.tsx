import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuHistoryEntry } from '@/features/menu/types';

type ProfileHistorySectionProps = {
  entries: MenuHistoryEntry[];
  errorMessage?: string | null;
  loading: boolean;
  visible: boolean;
  onOpenResults: (entry: MenuHistoryEntry) => void;
};

function formatHistoryDate(entry: MenuHistoryEntry) {
  const rawValue = entry.finished_at ?? entry.started_at;
  if (!rawValue) {
    return 'Дата неизвестна';
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return 'Дата неизвестна';
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildStatusPills(entry: MenuHistoryEntry) {
  const pills: Array<{ label: string; tone: 'finished' | 'cancelled' | 'left' | 'kicked' | 'winner' }> = [];

  if (entry.game_status === 'cancelled') {
    pills.push({ label: 'Игра отменена', tone: 'cancelled' });
  } else if (entry.game_status === 'finished') {
    pills.push({ label: 'Игра завершена', tone: 'finished' });
  }

  if (entry.participant_status === 'left') {
    pills.push({ label: 'Вышел сам', tone: 'left' });
  } else if (entry.participant_status === 'kicked') {
    pills.push({ label: 'Исключён', tone: 'kicked' });
  }

  if (entry.is_winner) {
    pills.push({ label: 'Победа', tone: 'winner' });
  }

  return pills;
}

function formatRank(entry: MenuHistoryEntry) {
  return typeof entry.final_rank === 'number' ? `#${entry.final_rank}` : '—';
}

function formatScore(entry: MenuHistoryEntry) {
  return typeof entry.score === 'number' ? String(entry.score) : '—';
}

function formatWinners(entry: MenuHistoryEntry) {
  if (!entry.winner_names?.length) {
    return 'Победитель не определён';
  }

  const label = entry.winner_names.length > 1 ? 'Победители' : 'Победитель';
  return `${label}: ${entry.winner_names.join(', ')}`;
}

function StateCard({ message }: { message: string }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

export function ProfileHistorySection({
  entries,
  errorMessage,
  loading,
  onOpenResults,
  visible,
}: ProfileHistorySectionProps) {
  if (!visible) {
    return null;
  }

  let content = null;

  if (loading) {
    content = <StateCard message="Загружаем историю игр..." />;
  } else if (errorMessage) {
    content = <StateCard message={errorMessage} />;
  } else if (!entries.length) {
    content = <StateCard message="Пока нет завершённых или отменённых игр. Когда сыграешь, история появится здесь." />;
  } else {
    content = (
      <View style={styles.list}>
        {entries.map((entry) => {
          const pills = buildStatusPills(entry);
          const canOpenResults = Boolean(entry.can_open_results);

          return (
            <Pressable
              disabled={!canOpenResults}
              key={`${entry.quiz_code}-${entry.started_at ?? entry.finished_at ?? 'history'}`}
              onPress={() => onOpenResults(entry)}
              style={({ pressed }) => [
                styles.card,
                entry.is_winner && styles.cardWinner,
                !canOpenResults && styles.cardDisabled,
                canOpenResults && pressed && styles.cardPressed,
              ]}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadCopy}>
                  <Text style={styles.cardDate}>{formatHistoryDate(entry)}</Text>
                  <Text style={styles.cardTitle}>{entry.title}</Text>
                </View>
                {entry.is_winner ? <Text style={styles.winnerBadge}>Победа</Text> : null}
              </View>

              <View style={styles.pillsRow}>
                {pills.map((pill) => (
                  <View
                    key={`${entry.quiz_code}-${pill.label}`}
                    style={[
                      styles.pill,
                      pill.tone === 'finished' && styles.pillFinished,
                      pill.tone === 'cancelled' && styles.pillCancelled,
                      pill.tone === 'left' && styles.pillLeft,
                      pill.tone === 'kicked' && styles.pillKicked,
                      pill.tone === 'winner' && styles.pillWinner,
                    ]}>
                    <Text
                      style={[
                        styles.pillText,
                        pill.tone === 'finished' && styles.pillTextFinished,
                        pill.tone === 'cancelled' && styles.pillTextCancelled,
                        pill.tone === 'left' && styles.pillTextLeft,
                        pill.tone === 'kicked' && styles.pillTextKicked,
                        pill.tone === 'winner' && styles.pillTextWinner,
                      ]}>
                      {pill.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Мой ранг</Text>
                  <Text style={styles.statValue}>{formatRank(entry)}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Мой счёт</Text>
                  <Text style={styles.statValue}>{formatScore(entry)}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Код игры</Text>
                  <Text style={styles.statValue}>{entry.quiz_code}</Text>
                </View>
              </View>

              <Text style={styles.winnersLine}>{formatWinners(entry)}</Text>
              <Text style={[styles.openLabel, !canOpenResults && styles.openLabelDisabled]}>
                {canOpenResults ? 'Открыть итоги игры' : 'Итоги недоступны для этой записи'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>История игр</Text>
        <Text style={styles.subtitle}>Финалы, отмены и твои личные результаты</Text>
      </View>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 6,
    gap: 12,
  },
  heading: {
    gap: 6,
  },
  title: {
    color: menuTheme.colors.title,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: menuTheme.colors.hint,
    fontSize: 13,
    lineHeight: 18,
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
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardWinner: {
    borderColor: 'rgba(255, 193, 7, 0.45)',
    backgroundColor: 'rgba(255, 248, 220, 0.96)',
  },
  cardDisabled: {
    opacity: 0.74,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeadCopy: {
    flex: 1,
  },
  cardDate: {
    color: menuTheme.colors.hint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardTitle: {
    marginTop: 6,
    color: menuTheme.colors.title,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  winnerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    color: '#8a5a00',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    textTransform: 'uppercase',
    backgroundColor: '#ffe08a',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pillFinished: {
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
  },
  pillCancelled: {
    backgroundColor: 'rgba(255, 118, 117, 0.14)',
  },
  pillLeft: {
    backgroundColor: 'rgba(253, 203, 110, 0.2)',
  },
  pillKicked: {
    backgroundColor: 'rgba(255, 118, 117, 0.16)',
  },
  pillWinner: {
    backgroundColor: 'rgba(255, 193, 7, 0.18)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pillTextFinished: {
    color: menuTheme.colors.primary,
  },
  pillTextCancelled: {
    color: '#d63031',
  },
  pillTextLeft: {
    color: '#b7791f',
  },
  pillTextKicked: {
    color: '#c0392b',
  },
  pillTextWinner: {
    color: '#8a5a00',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(108, 92, 231, 0.07)',
  },
  statLabel: {
    color: menuTheme.colors.hint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 6,
    color: menuTheme.colors.title,
    fontSize: 15,
    fontWeight: '900',
  },
  winnersLine: {
    marginTop: 14,
    color: menuTheme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  openLabel: {
    marginTop: 12,
    color: menuTheme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  openLabelDisabled: {
    color: menuTheme.colors.hint,
  },
});
