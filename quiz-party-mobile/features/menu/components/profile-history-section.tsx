import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuHistoryEntry, MenuHistorySortMode } from '@/features/menu/types';

type ProfileHistorySectionProps = {
  entries: MenuHistoryEntry[];
  errorMessage?: string | null;
  infoMessage?: string | null;
  loading: boolean;
  visible?: boolean;
  onOpenResults: (entry: MenuHistoryEntry) => void;
};

const UI_TEXT = {
  unknownDate: 'Дата неизвестна',
  gameCancelled: 'Игра отменена',
  gameFinished: 'Игра завершена',
  leftBySelf: 'Вышел сам',
  kicked: 'Исключен',
  win: 'Победа',
  winnerUnknown: 'Победитель не определен',
  winners: 'Победители',
  winner: 'Победитель',
  loading: 'Загружаем историю игр...',
  empty:
    'Пока нет завершенных или отмененных игр. Когда сыграешь, история появится здесь.',
  emptyWins: 'Побед пока нет. Когда выиграешь, карточка появится здесь.',
  emptyHost:
    'Пока нет игр, где ты был ведущим. Когда проведешь игру, она появится здесь.',
  rank: 'Ранг',
  score: 'Счет',
  host: 'Ведущий',
  openResults: 'Открыть итоги игры',
  resultsUnavailable: 'Итоги недоступны для этой записи',
  title: 'История игр',
  sortByTime: 'Все игры',
  sortByWins: 'Мои победы',
  sortByHost: 'Я ведущий',
};

function getHistoryTimestamp(entry: MenuHistoryEntry) {
  const rawValue = entry.finished_at ?? entry.started_at;
  if (!rawValue) {
    return 0;
  }

  const timestamp = new Date(rawValue).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatHistoryDate(entry: MenuHistoryEntry) {
  const timestamp = getHistoryTimestamp(entry);
  if (!timestamp) {
    return UI_TEXT.unknownDate;
  }

  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildStatusPills(entry: MenuHistoryEntry) {
  const pills: Array<{ label: string; tone: 'finished' | 'cancelled' | 'left' | 'kicked' }> = [];

  if (entry.game_status === 'cancelled') {
    pills.push({ label: UI_TEXT.gameCancelled, tone: 'cancelled' });
  } else if (entry.game_status === 'finished') {
    pills.push({ label: UI_TEXT.gameFinished, tone: 'finished' });
  }

  if (entry.participant_status === 'left') {
    pills.push({ label: UI_TEXT.leftBySelf, tone: 'left' });
  } else if (entry.participant_status === 'kicked') {
    pills.push({ label: UI_TEXT.kicked, tone: 'kicked' });
  }

  return pills;
}

function isHostHistoryEntry(entry: MenuHistoryEntry) {
  return (
    entry.game_status === 'finished' &&
    entry.participant_status === 'finished' &&
    typeof entry.final_rank !== 'number' &&
    !entry.is_winner &&
    (entry.score == null || entry.score === 0)
  );
}

function formatRank(entry: MenuHistoryEntry) {
  return typeof entry.final_rank === 'number' ? `#${entry.final_rank}` : '-';
}

function formatScore(entry: MenuHistoryEntry) {
  return typeof entry.score === 'number' ? String(entry.score) : '-';
}

function formatWinners(entry: MenuHistoryEntry) {
  if (!entry.winner_names?.length) {
    return UI_TEXT.winnerUnknown;
  }

  const label = entry.winner_names.length > 1 ? UI_TEXT.winners : UI_TEXT.winner;
  return `${label}: ${entry.winner_names.join(', ')}`;
}

function compareByTime(left: MenuHistoryEntry, right: MenuHistoryEntry) {
  return getHistoryTimestamp(right) - getHistoryTimestamp(left);
}

function compareByWins(left: MenuHistoryEntry, right: MenuHistoryEntry) {
  if (left.is_winner !== right.is_winner) {
    return Number(right.is_winner) - Number(left.is_winner);
  }

  const leftRank = typeof left.final_rank === 'number' ? left.final_rank : Number.MAX_SAFE_INTEGER;
  const rightRank = typeof right.final_rank === 'number' ? right.final_rank : Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftScore = typeof left.score === 'number' ? left.score : -1;
  const rightScore = typeof right.score === 'number' ? right.score : -1;

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return compareByTime(left, right);
}

function StateCard({ message }: { message: string }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function SortButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sortButton,
        active && styles.sortButtonActive,
        pressed && styles.sortButtonPressed,
      ]}>
      <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ProfileHistorySection({
  entries,
  errorMessage,
  infoMessage,
  loading,
  onOpenResults,
  visible = true,
}: ProfileHistorySectionProps) {
  const [sortMode, setSortMode] = useState<MenuHistorySortMode>('time');

  const filteredEntries = useMemo(() => {
    if (sortMode === 'wins') {
      return entries.filter((entry) => entry.is_winner);
    }

    if (sortMode === 'host') {
      return entries.filter((entry) => isHostHistoryEntry(entry));
    }

    return entries;
  }, [entries, sortMode]);

  const sortedEntries = useMemo(() => {
    const nextEntries = [...filteredEntries];
    nextEntries.sort(sortMode === 'wins' ? compareByWins : compareByTime);
    return nextEntries;
  }, [filteredEntries, sortMode]);

  if (!visible) {
    return null;
  }

  let content = null;

  if (loading) {
    content = <StateCard message={UI_TEXT.loading} />;
  } else if (errorMessage) {
    content = <StateCard message={errorMessage} />;
  } else if (!sortedEntries.length) {
    content = (
      <StateCard
        message={
          sortMode === 'wins'
            ? UI_TEXT.emptyWins
            : (sortMode === 'host' ? UI_TEXT.emptyHost : UI_TEXT.empty)
        }
      />
    );
  } else {
    content = (
      <View style={styles.list}>
        {sortedEntries.map((entry) => {
          const pills = buildStatusPills(entry);
          const canOpenResults = Boolean(entry.can_open_results);
          const isHostEntry = isHostHistoryEntry(entry);
          const shouldHidePerformance =
            isHostEntry || entry.participant_status === 'left' || entry.game_status === 'cancelled';
          const shouldShowWinners =
            entry.game_status !== 'cancelled' && entry.participant_status !== 'left';

          return (
            <Pressable
              disabled={!canOpenResults}
              key={`${entry.quiz_code}-${entry.started_at ?? entry.finished_at ?? 'history'}`}
              onPress={() => onOpenResults(entry)}
              style={({ pressed }) => [
                styles.card,
                isHostEntry && styles.cardHost,
                entry.is_winner && styles.cardWinner,
                !canOpenResults && styles.cardDisabled,
                canOpenResults && pressed && styles.cardPressed,
              ]}>
              <View style={styles.cardGlow} />

              <View style={styles.cardTopRow}>
                <Text style={styles.cardDate}>{formatHistoryDate(entry)}</Text>

                {entry.is_winner ? <Text style={[styles.headerBadge, styles.winnerBadge]}>{UI_TEXT.win}</Text> : null}
              </View>

              <Text style={styles.cardTitle}>{entry.title}</Text>

              <View style={styles.metaRow}>
                {pills.map((pill) => (
                  <View
                    key={`${entry.quiz_code}-${pill.label}`}
                    style={[
                      styles.pill,
                      pill.tone === 'finished' && styles.pillFinished,
                      pill.tone === 'cancelled' && styles.pillCancelled,
                      pill.tone === 'left' && styles.pillLeft,
                      pill.tone === 'kicked' && styles.pillKicked,
                    ]}>
                    <Text
                      style={[
                        styles.pillText,
                        pill.tone === 'finished' && styles.pillTextFinished,
                        pill.tone === 'cancelled' && styles.pillTextCancelled,
                        pill.tone === 'left' && styles.pillTextLeft,
                        pill.tone === 'kicked' && styles.pillTextKicked,
                      ]}>
                      {pill.label}
                    </Text>
                  </View>
                ))}

                {isHostEntry ? (
                  <View style={[styles.metaChip, styles.hostMetaChip]}>
                    <View style={styles.hostMetaDot} />
                    <Text style={[styles.metaChipText, styles.hostMetaChipText]}>{UI_TEXT.host}</Text>
                  </View>
                ) : !shouldHidePerformance ? (
                  <>
                    <View style={[styles.metaChip, styles.rankMetaChip]}>
                      <Text style={styles.metaChipLabel}>{UI_TEXT.rank}</Text>
                      <Text style={styles.metaChipValue}>{formatRank(entry)}</Text>
                    </View>
                    <View style={[styles.metaChip, styles.scoreMetaChip]}>
                      <Text style={styles.metaChipLabel}>{UI_TEXT.score}</Text>
                      <Text style={styles.metaChipValue}>{formatScore(entry)}</Text>
                    </View>
                  </>
                ) : null}
              </View>

              {shouldShowWinners ? (
                <View
                  style={[
                    styles.winnersCard,
                    entry.is_winner && styles.winnersCardWinner,
                    isHostEntry && styles.winnersCardHost,
                  ]}>
                  <Text style={styles.winnersLine}>{formatWinners(entry)}</Text>
                </View>
              ) : null}
              <Text style={[styles.openLabel, !canOpenResults && styles.openLabelDisabled]}>
                {canOpenResults ? UI_TEXT.openResults : UI_TEXT.resultsUnavailable}
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
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{UI_TEXT.title}</Text>
        </View>

        <View style={styles.sortRow}>
          <SortButton
            active={sortMode === 'time'}
            label={UI_TEXT.sortByTime}
            onPress={() => setSortMode('time')}
          />
          <SortButton
            active={sortMode === 'wins'}
            label={UI_TEXT.sortByWins}
            onPress={() => setSortMode('wins')}
          />
          <SortButton
            active={sortMode === 'host'}
            label={UI_TEXT.sortByHost}
            onPress={() => setSortMode('host')}
          />
        </View>
      </View>

      {infoMessage ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>{infoMessage}</Text>
        </View>
      ) : null}

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
    gap: 10,
  },
  headingCopy: {
    gap: 6,
  },
  title: {
    color: menuTheme.colors.title,
    fontSize: 18,
    fontWeight: '900',
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.16)',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  sortButtonActive: {
    borderColor: menuTheme.colors.primary,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
  },
  sortButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  sortButtonText: {
    color: menuTheme.colors.subtitle,
    fontSize: 12,
    fontWeight: '800',
  },
  sortButtonTextActive: {
    color: menuTheme.colors.primary,
  },
  infoCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  infoText: {
    color: menuTheme.colors.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
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
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  cardWinner: {
    borderColor: 'rgba(255, 193, 7, 0.4)',
    backgroundColor: 'rgba(252, 246, 225, 0.99)',
  },
  cardHost: {
    borderColor: 'rgba(255, 178, 196, 0.24)',
    backgroundColor: 'rgb(249, 242, 250)',
  },
  cardDisabled: {
    opacity: 0.8,
  },
  cardPressed: {
    transform: [{ scale: 0.992 }],
  },
  cardGlow: {
    position: 'absolute',
    top: 8,
    left: 18,
    width: 140,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardDate: {
    color: menuTheme.colors.hint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardTitle: {
    marginTop: 10,
    color: menuTheme.colors.title,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  winnerBadge: {
    color: '#8a5a00',
    backgroundColor: '#ffe08a',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillFinished: {
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(108, 92, 231, 0.1)',
  },
  pillCancelled: {
    borderColor: 'rgba(255, 118, 117, 0.16)',
    backgroundColor: 'rgba(255, 118, 117, 0.14)',
  },
  pillLeft: {
    borderColor: 'rgba(253, 203, 110, 0.24)',
    backgroundColor: 'rgba(253, 203, 110, 0.2)',
  },
  pillKicked: {
    borderColor: 'rgba(255, 118, 117, 0.18)',
    backgroundColor: 'rgba(255, 118, 117, 0.16)',
  },
  pillText: {
    fontSize: 11,
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
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.08)',
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
  },
  metaChipLabel: {
    color: menuTheme.colors.hint,
    fontSize: 11,
    fontWeight: '700',
  },
  metaChipValue: {
    color: menuTheme.colors.title,
    fontSize: 12,
    fontWeight: '900',
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  rankMetaChip: {
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  scoreMetaChip: {
    borderColor: 'rgba(255, 95, 135, 0.14)',
    backgroundColor: 'rgba(255, 95, 135, 0.08)',
  },
  hostMetaChip: {
    borderColor: 'rgba(255, 133, 161, 0.24)',
    backgroundColor: 'rgba(255, 95, 135, 0.1)',
  },
  hostMetaChipText: {
    color: menuTheme.colors.create,
  },
  hostMetaDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: menuTheme.colors.create,
  },
  winnersCard: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.1)',
    backgroundColor: 'rgba(240, 236, 255, 0.52)',
  },
  winnersCardWinner: {
    borderColor: 'rgba(247, 191, 69, 0.28)',
    backgroundColor: 'rgba(255, 246, 210, 0.72)',
  },
  winnersCardHost: {
    borderColor: 'rgba(255, 133, 161, 0.22)',
    backgroundColor: 'rgba(255, 238, 243, 0.72)',
  },
  winnersLine: {
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
