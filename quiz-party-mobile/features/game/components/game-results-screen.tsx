import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { GameIntroParticleBurst } from '@/features/game/components/game-intro-effects';
import { gameTheme } from '@/features/game/theme/game-theme';
import { GameResultsPayload } from '@/features/game/types';
import { getRankDisplay, getResultOthers, getResultWinners, isAnswerCorrect } from '@/features/game/utils/game-view';

type GameResultsScreenProps = {
  payload: GameResultsPayload | null;
  playerName: string;
  reviewExpanded: boolean;
  onBackToMenu: () => void;
  onToggleReview: () => void;
};

type AnimatedWinnerMedalProps = {
  medal: string;
};

type WinnerConfettiOverlayProps = {
  burstKey: number;
};

// Эта функция возвращает номер строки рейтинга так, как он воспринимается в веб-версии.
// Победители вынесены в отдельный highlighted-блок, поэтому следующий обычный игрок начинает со 2 места.
function getScoreboardRank(index: number, hasFeaturedPlayers: boolean) {
  if (hasFeaturedPlayers) {
    return index + 2;
  }

  return index + 1;
}

// Эта функция подбирает визуальный акцент строки рейтинга по месту игрока.
// Так мы сохраняем читаемую иерархию мест без тяжёлых декоративных фонов.
function getScoreboardRowTone(rank: number) {
  if (rank === 2) {
    return {
      rowStyle: styles.scoreboardRowSilver,
      rankBadgeStyle: styles.rankBadgeSilver,
      scoreBadgeStyle: styles.scoreBadgeSilver,
    };
  }

  if (rank === 3) {
    return {
      rowStyle: styles.scoreboardRowBronze,
      rankBadgeStyle: styles.rankBadgeBronze,
      scoreBadgeStyle: styles.scoreBadgeBronze,
    };
  }

  return {
    rowStyle: null,
    rankBadgeStyle: null,
    scoreBadgeStyle: null,
  };
}

// Эта функция анимирует медаль победителя, чтобы блок победителей ощущался "живым", как на вебе.
// Анимация мягкая и цикличная, чтобы не спорить с контентом и не мешать чтению имён.
function AnimatedWinnerMedal({ medal }: AnimatedWinnerMedalProps) {
  const phase = useSharedValue(0);

  useEffect(() => {
    // Для плавной бесконечной анимации держим один общий phase-цикл.
    // Так поворот, подъём и масштаб всегда синхронны и не дают прерывистого движения.
    phase.value = withRepeat(
      withTiming(Math.PI * 2, {
        duration: 2600,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(phase);
      phase.value = 0;
    };
  }, [phase]);

  // Собираем покачивание, лёгкий подъём и масштаб в одну анимацию,
  // чтобы медаль выглядела празднично, но не "дёргано".
  const animatedStyle = useAnimatedStyle(() => {
    const floatWave = Math.sin(phase.value);
    const scaleWave = (Math.sin(phase.value - Math.PI / 2) + 1) / 2;

    return {
      transform: [
        { rotate: `${floatWave * 7}deg` },
        { translateY: floatWave * -3.4 },
        { scale: 1 + scaleWave * 0.08 },
      ],
    };
  });

  return <Animated.Text style={[styles.winnerMedal, animatedStyle]}>{medal}</Animated.Text>;
}

// Этот overlay запускает лёгкий confetti-салют прямо поверх блока победителей.
// Компонент специально монтируется заново по ключу, чтобы каждый tap гарантированно перезапускал burst-анимацию.
function WinnerConfettiOverlay({ burstKey }: WinnerConfettiOverlayProps) {
  return (
    <View key={`winner-confetti-${burstKey}`} pointerEvents="none" style={styles.winnerConfettiLayer}>
      <GameIntroParticleBurst
        centerStyle={styles.winnerConfettiBurstTopLeft}
        count={16}
        maxDistance={82}
        palette={['#ffd86b', '#ff85a1', '#43fff2', '#6c5ce7', '#ffffff']}
      />
      <GameIntroParticleBurst
        centerStyle={styles.winnerConfettiBurstTopRight}
        count={16}
        delay={50}
        maxDistance={82}
        palette={['#ffd86b', '#ffb347', '#ff85a1', '#43fff2', '#ffffff']}
      />
      <GameIntroParticleBurst
        centerStyle={styles.winnerConfettiBurstBottomLeft}
        count={14}
        delay={90}
        maxDistance={72}
        palette={['#ffd86b', '#6c5ce7', '#43fff2', '#ffffff']}
      />
      <GameIntroParticleBurst
        centerStyle={styles.winnerConfettiBurstBottomRight}
        count={14}
        delay={120}
        maxDistance={72}
        palette={['#ffd86b', '#ff85a1', '#43fff2', '#ffffff']}
      />
    </View>
  );
}

// Экран итогов повторяет веб-структуру: отдельно highlighted-победители, отдельно обычный рейтинг и отдельно review.
// При этом внешние контейнеры оставляем прозрачными, чтобы экран дышал как веб-версия.
export function GameResultsScreen({
  onBackToMenu,
  onToggleReview,
  payload,
  playerName,
  reviewExpanded,
}: GameResultsScreenProps) {
  const [winnerCelebrationKey, setWinnerCelebrationKey] = useState(0);
  const winnerHapticTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // При размонтировании чистим отложенные вибро-импульсы, чтобы экран не оставлял "хвосты" после ухода.
    return () => {
      winnerHapticTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      winnerHapticTimeoutsRef.current = [];
    };
  }, []);

  if (!payload) {
    return (
      <View style={styles.loadingWrap}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingTitle}>Подводим итоги...</Text>
          <Text style={styles.loadingSubtitle}>
            Сейчас появится финальный экран со всеми результатами и рейтингом игроков.
          </Text>
        </View>
      </View>
    );
  }

  // На всякий случай пересортировываем результаты по очкам, чтобы финальный рейтинг всегда совпадал с серверными данными.
  const sortedResults = [...payload.results].sort((left, right) => (right.score || 0) - (left.score || 0));
  const winners = getResultWinners(sortedResults);
  const others = getResultOthers(sortedResults);
  const myData = sortedResults.find((player) => player.name === playerName);
  const featuredPlayers = winners.length ? winners : sortedResults.slice(0, 1);
  const scoreboardPlayers = winners.length ? others : sortedResults.slice(1);

  function handleWinnersPress() {
    // Один tap по блоку победителей запускает и confetti, и плотную победную вибро-цепочку,
    // чтобы экран ощущался празднично и ближе к веб-эффекту.
    setWinnerCelebrationKey((currentValue) => currentValue + 1);
    winnerHapticTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    winnerHapticTimeoutsRef.current = [
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 590),
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 190),
    ];
  }

  return (
    <ScrollView bounces={false} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.scoreboardCard}>
        <Text style={styles.quizTitle}>{payload.title || 'Quiz Party'}</Text>
        <Text style={styles.title}>Итоги викторины</Text>

        {/* Победителей оставляем отдельным блоком, как на вебе, чтобы они не сливались с основным рейтингом. */}
        <View style={styles.winnersSectionWrap}>
          {winnerCelebrationKey > 0 ? <WinnerConfettiOverlay burstKey={winnerCelebrationKey} key={winnerCelebrationKey} /> : null}

          <Pressable onPress={handleWinnersPress} style={({ pressed }) => [styles.winnersSectionPressable, pressed && styles.winnersSectionPressed]}>
            <View style={styles.winnersSection}>
          {featuredPlayers.map((winner, index) => {
            const isMe = winner.name === playerName;

            return (
              <Animated.View
                entering={FadeInDown.duration(420).delay(index * 70)}
                key={`winner-${winner.name}`}
                style={[styles.winnerCard, isMe && styles.winnerCardMe]}>
                {/* Медаль и эмодзи специально держим ближе друг к другу и к левому краю, как на веб-версии. */}
                <View style={styles.winnerLeadingGroup}>
                  <View style={styles.winnerMedalWrap}>
                    <AnimatedWinnerMedal medal="🥇" />
                  </View>
                  <Text style={styles.winnerEmoji}>{winner.emoji ?? '👤'}</Text>
                </View>

                <View style={styles.winnerInfo}>
                  <View style={styles.winnerNameRow}>
                    <Text numberOfLines={1} style={styles.winnerName}>
                      {winner.name}
                    </Text>
                    {isMe ? <Text style={styles.scoreboardMeBadge}>ты</Text> : null}
                  </View>
                  <Text style={styles.winnerLabel}>Победитель</Text>
                </View>

                <View style={styles.winnerScoreBadge}>
                  <Text style={styles.winnerScoreValue}>{winner.score}</Text>
                </View>
              </Animated.View>
            );
          })}
            </View>
          </Pressable>
        </View>

        {scoreboardPlayers.length > 0 ? (
          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>Рейтинг игроков</Text>

            <View style={styles.ratingList}>
              {scoreboardPlayers.map((player, index) => {
                const rank = getScoreboardRank(index, featuredPlayers.length > 0);
                const isMe = player.name === playerName;
                const rowTone = getScoreboardRowTone(rank);

                return (
                  <Animated.View
                    entering={FadeInDown.duration(360).delay(120 + index * 45)}
                    key={`rating-${player.name}`}
                    style={[
                      styles.scoreboardRow,
                      rowTone.rowStyle,
                      isMe && styles.scoreboardRowMe,
                    ]}>
                    <View style={[styles.rankBadge, rowTone.rankBadgeStyle]}>
                      <Text style={styles.rankBadgeText}>{getRankDisplay(rank)}</Text>
                    </View>

                    <View style={styles.scoreboardPlayerBlock}>
                      <Text style={styles.scoreboardEmoji}>{player.emoji ?? '👤'}</Text>

                      <View style={styles.scoreboardInfo}>
                        <View style={styles.scoreboardNameRow}>
                          <Text numberOfLines={1} style={styles.scoreboardName}>
                            {player.name}
                          </Text>
                          {isMe ? <Text style={styles.scoreboardMeBadge}>ты</Text> : null}
                        </View>
                      </View>
                    </View>

                    <View style={[styles.scoreBadge, rowTone.scoreBadgeStyle, isMe && styles.scoreBadgeMe]}>
                      <Text style={styles.scoreBadgeValue}>{player.score}</Text>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.sectionCard, styles.reviewSectionCard]}>
        <Pressable onPress={onToggleReview} style={({ pressed }) => [styles.reviewHeader, pressed && styles.reviewHeaderPressed]}>
          <Text style={styles.sectionTitle}>Разбор вопросов</Text>
          <Text style={styles.reviewArrow}>{reviewExpanded ? '▴' : '▾'}</Text>
        </Pressable>

        {reviewExpanded ? (
          <View style={styles.reviewWrap}>
            {payload.questions.map((question, index) => {
              const myAnswer = (myData?.answers && myData.answers[String(index + 1)]) || '—';
              const myIsCorrect = isAnswerCorrect(myAnswer, question.correct);

              return (
                <View key={`review-${question.text}-${index}`} style={styles.reviewCard}>
                  <Text style={styles.reviewIndex}>Вопрос {index + 1}</Text>
                  <Text style={styles.reviewQuestion}>{question.text}</Text>

                  <View style={styles.answerBoxRow}>
                    <View style={[styles.answerBox, styles.answerBoxCorrect]}>
                      <Text style={styles.answerBoxLabel}>Верно</Text>
                      <Text style={styles.answerBoxValue}>{question.correct ?? '—'}</Text>
                    </View>

                    <View style={[styles.answerBox, myIsCorrect ? styles.answerBoxMeCorrect : styles.answerBoxMeWrong]}>
                      <Text style={styles.answerBoxLabel}>Твой ответ</Text>
                      <Text style={styles.answerBoxValue}>{myAnswer}</Text>
                    </View>
                  </View>

                  <Text style={styles.otherAnswersLabel}>Другие игроки:</Text>

                  {/* Ответы других игроков держим в горизонтальном скролле, как на вебе, чтобы карточки не ломали сетку вопроса. */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.otherAnswersScrollContent}
                    style={styles.otherAnswersScroll}>
                    {sortedResults
                      .filter((player) => player.name !== playerName)
                      .map((player) => {
                        const answer = player.answers?.[String(index + 1)] ?? '—';
                        const correct = isAnswerCorrect(answer, question.correct);

                        return (
                          <View key={`review-player-${player.name}-${index}`} style={styles.otherAnswerCard}>
                            <Text numberOfLines={1} style={styles.otherAnswerName}>
                              {player.emoji ?? '👤'} {player.name}
                            </Text>
                            <Text style={[styles.otherAnswerValue, correct && styles.otherAnswerValueCorrect]}>
                              {answer}
                            </Text>
                          </View>
                        );
                      })}
                  </ScrollView>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <Pressable onPress={onBackToMenu} style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}>
        <Text style={styles.menuButtonText}>В главное меню</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 30,
    gap: 12,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  loadingCard: {
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: gameTheme.colors.panel,
  },
  loadingTitle: {
    color: gameTheme.colors.purpleDark,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: 10,
    color: gameTheme.colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  scoreboardCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
  },
  quizTitle: {
    color: gameTheme.colors.pinkDark,
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  title: {
    marginTop: 6,
    color: gameTheme.colors.textSoft,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  winnersSection: {
    marginTop: 16,
    gap: 10,
  },
  winnersSectionWrap: {
    position: 'relative',
  },
  winnersSectionPressable: {
    borderRadius: 24,
  },
  winnersSectionPressed: {
    opacity: 0.97,
    transform: [{ scale: 0.995 }],
  },
  winnerConfettiLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
    zIndex: 4,
  },
  winnerConfettiBurstTopLeft: {
    left: '18%',
    top: '14%',
  },
  winnerConfettiBurstTopRight: {
    left: '82%',
    top: '16%',
  },
  winnerConfettiBurstBottomLeft: {
    left: '28%',
    top: '78%',
  },
  winnerConfettiBurstBottomRight: {
    left: '72%',
    top: '78%',
  },
  winnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 14,
    backgroundColor: 'rgba(247, 255, 29, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(255, 217, 0, 0.9)',
    shadowColor: 'rgba(255, 215, 0, 0.24)',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  winnerCardMe: {
    borderColor: gameTheme.colors.purpleDark,
  },
  winnerLeadingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: 4,
  },
  winnerMedalWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerMedal: {
    fontSize: 28,
  },
  winnerEmoji: {
    fontSize: 34,
  },
  winnerInfo: {
    flex: 1,
  },
  winnerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  winnerName: {
    flexShrink: 1,
    color: '#9c6a00',
    fontSize: 20,
    fontWeight: '900',
  },
  winnerLabel: {
    marginTop: 4,
    color: '#c99900',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  winnerScoreBadge: {
    minWidth: 56,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.gold,
  },
  winnerScoreValue: {
    color: '#2f2f2f',
    fontSize: 18,
    fontWeight: '900',
  },
  ratingSection: {
    marginTop: 15,
  },
  ratingTitle: {
    marginBottom: 5,
    color: gameTheme.colors.textSoft,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  ratingList: {
    backgroundColor: 'transparent',
  },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108, 92, 231, 0.08)',
    backgroundColor: 'transparent',
  },
  scoreboardRowSilver: {
    backgroundColor: 'rgba(239, 243, 255, 0.32)',
  },
  scoreboardRowBronze: {
    backgroundColor: 'rgba(255, 241, 230, 0.32)',
  },
  scoreboardRowMe: {
    backgroundColor: 'rgba(108, 92, 231, 0.05)',
  },
  rankBadge: {
    width: 35,
    height: 35,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  rankBadgeSilver: {
    backgroundColor: 'rgba(216, 225, 241, 0.9)',
  },
  rankBadgeBronze: {
    backgroundColor: 'rgba(241, 214, 191, 0.86)',
  },
  rankBadgeText: {
    color: gameTheme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  scoreboardPlayerBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreboardEmoji: {
    fontSize: 25,
  },
  scoreboardInfo: {
    flex: 1,
  },
  scoreboardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreboardName: {
    flexShrink: 1,
    color: gameTheme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  scoreboardMeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: gameTheme.radius.pill,
    color: gameTheme.colors.white,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    overflow: 'hidden',
    backgroundColor: gameTheme.colors.purple,
  },
  scoreBadge: {
    minWidth: 34,
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  scoreBadgeSilver: {
    backgroundColor: 'rgba(167, 172, 182, 0.62)',
  },
  scoreBadgeBronze: {
    backgroundColor: 'rgba(242, 200, 163, 0.92)',
  },
  scoreBadgeMe: {
    backgroundColor: 'rgba(108, 92, 231, 0.14)',
  },
  scoreBadgeValue: {
    color: gameTheme.colors.purpleDark,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionCard: {
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  reviewSectionCard: {
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    color: gameTheme.colors.purpleDark,
    fontSize: 15,
    fontWeight: '900',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
  },
  reviewHeaderPressed: {
    opacity: 0.92,
  },
  reviewArrow: {
    color: gameTheme.colors.purpleDark,
    fontSize: 18,
    fontWeight: '900',
  },
  reviewWrap: {
    marginTop: 12,
    gap: 12,
  },
  reviewCard: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  reviewIndex: {
    color: gameTheme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  reviewQuestion: {
    marginTop: 6,
    color: gameTheme.colors.purpleDark,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '900',
  },
  answerBoxRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 14,
  },
  answerBox: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
  },
  answerBoxCorrect: {
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderColor: 'rgba(46, 204, 113, 0.2)',
  },
  answerBoxMeCorrect: {
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderColor: 'rgba(46, 204, 113, 0.22)',
  },
  answerBoxMeWrong: {
    backgroundColor: 'rgba(255, 118, 117, 0.1)',
    borderColor: 'rgba(255, 118, 117, 0.18)',
  },
  answerBoxLabel: {
    color: gameTheme.colors.textSoft,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  answerBoxValue: {
    marginTop: 6,
    color: gameTheme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  otherAnswersLabel: {
    marginTop: 12,
    color: gameTheme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  otherAnswersScroll: {
    marginTop: 8,
  },
  otherAnswersScrollContent: {
    gap: 5,
    paddingRight: 4,
  },
  otherAnswerCard: {
    width: 150,
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(108, 92, 231, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
  },
  otherAnswerName: {
    color: gameTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  otherAnswerValue: {
    marginTop: 6,
    color: gameTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  otherAnswerValueCorrect: {
    color: gameTheme.colors.success,
  },
  menuButton: {
    minHeight: 56,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.purple,
  },
  menuButtonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.95 }],
  },
  menuButtonText: {
    color: gameTheme.colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
});
