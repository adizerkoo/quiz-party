import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { gameTheme } from '@/features/game/theme/game-theme';
import { GameLobbyPlayer, GameQuestion, GameStatus } from '@/features/game/types';
import { getHostAnswerCardState, getRankDisplay, getSortedLeaderboard } from '@/features/game/utils/game-view';

type GameHostScreenProps = {
  currentQuestion: number;
  currentQuestionData?: GameQuestion;
  disconnectedNamesSet: Set<string>;
  gameStatus: GameStatus;
  maxReachedQuestion: number;
  players: GameLobbyPlayer[];
  questions: GameQuestion[];
  quizTitle: string;
  realGameQuestion: number;
  roomCode: string;
  onBackToCreate: () => void;
  onChangeScore: (targetName: string, points: 1 | -1) => void;
  onCopyRoom: () => void;
  onJumpToQuestion: (question: number) => void;
  onKickPlayer: (targetName: string) => void;
  onNextQuestion: () => void;
  onShareRoom: () => void;
  onStartGame: () => void;
};

type AnimatedLobbyEmojiProps = {
  delay: number;
  emoji: string;
  isOffline?: boolean;
};

// Плавная layout-анимация даёт рейтингу ту же "живость", что была у веб-версии:
// карточки не перескакивают, а аккуратно меняют позиции при обновлении очков.
const scoreboardCardLayout = LinearTransition.springify()
  .damping(18)
  .stiffness(190);

// Анимация эмодзи в лобби делает экран ожидания живым.
// Для offline-игроков останавливаем движение, чтобы не потерять читаемость их статуса.
function AnimatedLobbyEmoji({ delay, emoji, isOffline = false }: AnimatedLobbyEmojiProps) {
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isOffline) {
      translateY.value = withTiming(0, { duration: 180 });
      rotation.value = withTiming(0, { duration: 180 });
      scale.value = withTiming(1, { duration: 180 });
      return;
    }

    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 650, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    rotation.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(4, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 420, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 520, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, isOffline, rotation, scale, translateY]);

  // Комбинируем лёгкое покачивание, микроповорот и масштаб,
  // чтобы эмодзи выглядело нативно, а не "роботом" по таймеру.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  return <Animated.Text style={[styles.playerEmoji, animatedStyle]}>{emoji}</Animated.Text>;
}

// Пульсирующая точка показывает текущий "живой" шаг игры и повторяет веб-референс.
function LivePulseDot() {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.72);
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0.28);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(0.72, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.9, { duration: 1400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
      false,
    );

    haloOpacity.value = withRepeat(
      withSequence(
        withTiming(0.02, { duration: 1400, easing: Easing.out(Easing.ease) }),
        withTiming(0.28, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [haloOpacity, haloScale, pulseOpacity, pulseScale]);

  // Внешний ореол создаёт мягкую пульсацию, а не просто мигание точки.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));

  // Центральную точку тоже немного "дышим", чтобы анимация выглядела объёмно.
  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={styles.liveDotWrap}>
      <Animated.View pointerEvents="none" style={[styles.liveDotHalo, haloStyle]} />
      <Animated.View style={[styles.liveDot, dotStyle]} />
    </View>
  );
}

// Экран хоста собирает все ключевые состояния игры:
// lobby ожидания, активную игру, рейтинг и управление ответами игроков.
export function GameHostScreen({
  currentQuestion,
  currentQuestionData,
  disconnectedNamesSet,
  gameStatus,
  maxReachedQuestion,
  onBackToCreate,
  onChangeScore,
  onCopyRoom,
  onJumpToQuestion,
  onKickPlayer,
  onNextQuestion,
  onShareRoom,
  onStartGame,
  players,
  questions,
  quizTitle,
  realGameQuestion,
  roomCode,
}: GameHostScreenProps) {
  // Из общего списка игроков сразу убираем хоста, чтобы дальше работать только с участниками комнаты.
  const actualPlayers = players.filter((player) => !player.is_host);
  // Рейтинг пересчитываем на каждом рендере из живого состояния, не дублируя логику в UI.
  const leaderboard = getSortedLeaderboard(players);

  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBackToCreate} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Text style={styles.backButtonText}>Назад</Text>
        </Pressable>
      </View>

      <View style={styles.quizHeader}>
        <Text style={styles.quizSub}>QUIZ PARTY</Text>
        <Text style={styles.quizTitle}>{quizTitle}</Text>
      </View>

      {gameStatus === 'waiting' ? (
        <View style={styles.sectionCard}>
          <View style={styles.roomCard}>
            <Text style={styles.roomLabel}>Код комнаты</Text>
            <Text style={styles.roomCode}>{roomCode}</Text>

            <View style={styles.roomActions}>
              <Pressable onPress={onShareRoom} style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}>
                <Text style={styles.secondaryActionText}>Поделиться</Text>
              </Pressable>

              <Pressable onPress={onCopyRoom} style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}>
                <Text style={styles.secondaryActionText}>Скопировать</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.miniLabel}>УЧАСТНИКИ</Text>

          {!actualPlayers.length ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎭</Text>
              <Text style={styles.emptyTitle}>Пока тут пусто...</Text>
              <Text style={styles.emptyHint}>Отправь код комнаты друзьям, чтобы они присоединились.</Text>
            </View>
          ) : (
            <View style={styles.playerGrid}>
              {actualPlayers.map((player, index) => (
                <View key={player.name} style={[styles.playerCard, player.connected === false && styles.playerCardOffline]}>
                  {/* Крестик держим строго внутри карточки, чтобы он не выглядел "оторванным" от игрока. */}
                  <Pressable onPress={() => onKickPlayer(player.name)} style={({ pressed }) => [styles.kickButton, pressed && styles.kickButtonPressed]}>
                    <Text style={styles.kickButtonText}>×</Text>
                  </Pressable>

                  {/* Эмодзи слегка покачивается, как в веб-версии lobby, и остаётся статичным в offline-состоянии. */}
                  <AnimatedLobbyEmoji
                    delay={(index % 4) * 180}
                    emoji={player.emoji ?? '👤'}
                    isOffline={player.connected === false}
                  />

                  <Text style={styles.playerName}>{player.name}</Text>
                  {player.connected === false ? <Text style={styles.offlineBadge}>offline</Text> : null}
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={onStartGame} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <Text style={styles.primaryButtonText}>ПОГНАЛИ 🚀</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.sectionCard}>
          <ScrollView
            horizontal
            contentContainerStyle={styles.progressRow}
            showsHorizontalScrollIndicator={false}
            style={styles.progressScroll}>
            {/* Блок переключения вопросов прижимаем вправо и делаем ближе к веб-дизайну: скруглённые квадраты вместо кругов. */}
            <View style={styles.progressInlineRow}>
              {questions.map((_, index) => {
                const step = index + 1;
                const isDone = step < maxReachedQuestion;
                const isActive = step === currentQuestion;
                const isLiveStep = step === maxReachedQuestion;

                return (
                  <Pressable
                    key={`step-${step}`}
                    onPress={() => onJumpToQuestion(step)}
                    style={({ pressed }) => [
                      styles.progressWrap,
                      pressed && styles.progressWrapPressed,
                    ]}>
                    <View style={[
                      styles.progressStep,
                      isActive && styles.progressStepActive,
                      !isActive && isDone && styles.progressStepDone,
                    ]}>
                      <Text style={[
                        styles.progressStepText,
                        isActive && styles.progressStepTextActive,
                      ]}>
                        {step}
                      </Text>
                    </View>
                    {isLiveStep ? <LivePulseDot /> : <View style={styles.liveDotSpacer} />}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.questionCard}>
            <Text style={styles.questionTitle}>
              {currentQuestion}. {currentQuestionData?.text ?? 'Готовим вопрос...'}
            </Text>
            <View style={styles.correctAnswerChip}>
              <Text style={styles.correctAnswerText}>
                Правильный ответ: {currentQuestionData?.correct ?? '—'}
              </Text>
            </View>
          </View>

          <Text style={styles.miniLabel}>РЕЙТИНГ</Text>
          <View style={styles.scoreboardWrap}>
            {leaderboard.length ? leaderboard.map((player, index) => (
              <Animated.View
                entering={FadeInDown.duration(320).delay(index * 45)}
                key={`score-${player.name}`}
                layout={scoreboardCardLayout}
                style={[styles.scoreCard, index === 0 && styles.scoreCardLeader]}>
                <Text style={styles.scoreRank}>{getRankDisplay(index + 1)}</Text>
                <Text style={styles.scoreEmoji}>{player.emoji ?? '👤'}</Text>
                <View style={styles.scoreInfo}>
                  <Text style={styles.scoreName}>{player.name}</Text>
                  <Text style={styles.scoreValue}>{player.score ?? 0}🏆</Text>
                </View>
                {index === 0 ? <Text style={styles.scoreCrown}>👑</Text> : null}
              </Animated.View>
            )) : (
              <View style={styles.emptyScoreboard}>
                <Text style={styles.emptyScoreboardText}>Ожидаем первых ответов...</Text>
              </View>
            )}
          </View>

          <Text style={styles.miniLabel}>ОТВЕТЫ ИГРОКОВ</Text>
          <View style={styles.answersWrap}>
            {actualPlayers.map((player) => {
              const cardState = getHostAnswerCardState({
                player,
                question: currentQuestionData,
                currentQuestion,
                realGameQuestion,
                disconnectedPlayerNames: disconnectedNamesSet,
              });

              return (
                <View key={`answer-${player.name}`} style={[
                  styles.answerCard,
                  cardState.tone === 'correct' && styles.answerCardCorrect,
                  cardState.tone === 'wrong' && styles.answerCardWrong,
                  cardState.tone === 'skipped' && styles.answerCardSkipped,
                  cardState.tone === 'disconnected' && styles.answerCardOffline,
                ]}>
                  <View style={styles.answerHeader}>
                    <View style={styles.answerPlayerInfo}>
                      <Text style={styles.answerPlayerEmoji}>{player.emoji ?? '👤'}</Text>
                      <Text style={styles.answerPlayerName}>{player.name}</Text>
                      {cardState.showDisconnectedBadge ? <Text style={styles.answerOfflineBadge}>оффлайн</Text> : null}
                    </View>

                    <View style={styles.answerControls}>
                      {cardState.actionLabel ? <Text style={styles.answerStateLabel}>{cardState.actionLabel}</Text> : null}
                      {cardState.canAddPoint ? (
                        <Pressable onPress={() => onChangeScore(player.name, 1)} style={({ pressed }) => [styles.scoreActionPositive, pressed && styles.scoreActionPressed]}>
                          <Text style={styles.scoreActionText}>+</Text>
                        </Pressable>
                      ) : null}
                      {cardState.canRemovePoint ? (
                        <Pressable onPress={() => onChangeScore(player.name, -1)} style={({ pressed }) => [styles.scoreActionNegative, pressed && styles.scoreActionPressed]}>
                          <Text style={styles.scoreActionText}>−</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  {/* Усиливаем контейнер ответа границей и фоновым пузырём, чтобы карточка не сливалась с общим фоном. */}
                  <View style={[
                    styles.answerBubble,
                    cardState.tone === 'correct' && styles.answerBubbleCorrect,
                    cardState.tone === 'wrong' && styles.answerBubbleWrong,
                    cardState.tone === 'skipped' && styles.answerBubbleSkipped,
                    cardState.tone === 'disconnected' && styles.answerBubbleOffline,
                  ]}>
                    <Text style={styles.answerBubbleText}>{cardState.answerText}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable onPress={onNextQuestion} style={({ pressed }) => [styles.primaryButton, styles.nextButton, pressed && styles.primaryButtonPressed]}>
            <Text style={styles.primaryButtonText}>
              {currentQuestion !== realGameQuestion
                ? 'Вернуться к текущему вопросу'
                : currentQuestion === questions.length
                  ? '🏆 ПОДВЕСТИ ИТОГИ'
                  : 'СЛЕДУЮЩИЙ ВОПРОС'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  backButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.panel,
  },
  backButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  backButtonText: {
    color: gameTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  quizHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  quizSub: {
    color: gameTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  quizTitle: {
    marginTop: 4,
    color: gameTheme.colors.purpleDark,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: gameTheme.colors.panel,
    borderWidth: 1,
    borderColor: gameTheme.colors.panelBorder,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  roomCard: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: gameTheme.colors.chip,
  },
  roomLabel: {
    color: gameTheme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  roomCode: {
    marginTop: 6,
    color: gameTheme.colors.purpleDark,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  roomActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.panelStrong,
  },
  secondaryActionPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  secondaryActionText: {
    color: gameTheme.colors.purple,
    fontSize: 14,
    fontWeight: '800',
  },
  miniLabel: {
    marginTop: 18,
    marginBottom: 10,
    color: gameTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  emptyState: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    backgroundColor: gameTheme.colors.chip,
  },
  emptyEmoji: {
    fontSize: 34,
  },
  emptyTitle: {
    marginTop: 10,
    color: gameTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 8,
    color: gameTheme.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  playerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  playerCard: {
    width: '48%',
    minHeight: 118,
    borderRadius: gameTheme.radius.section,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: gameTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: gameTheme.colors.panelBorder,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  playerCardOffline: {
    opacity: 0.72,
  },
  playerEmoji: {
    fontSize: 34,
  },
  kickButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.danger,
  },
  kickButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.94 }],
  },
  kickButtonText: {
    color: gameTheme.colors.white,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  playerName: {
    marginTop: 8,
    color: gameTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  offlineBadge: {
    marginTop: 8,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: gameTheme.radius.pill,
    overflow: 'hidden',
    color: gameTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: gameTheme.colors.offlineSoft,
  },
  primaryButton: {
    minHeight: 56,
    marginTop: 18,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.purple,
  },
  primaryButtonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: gameTheme.colors.white,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  progressScroll: {
    marginBottom: 14,
  },
  progressRow: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  progressInlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 8,
    paddingLeft: 20,
  },
  progressWrap: {
    alignItems: 'center',
  },
  progressWrapPressed: {
    opacity: 0.9,
  },
  progressStep: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: gameTheme.colors.chipBorder,
  },
  progressStepDone: {
    backgroundColor: 'rgba(46, 204, 113, 0.14)',
    borderColor: 'rgba(46, 204, 113, 0.26)',
  },
  progressStepActive: {
    backgroundColor: gameTheme.colors.purple,
    borderColor: gameTheme.colors.purple,
  },
  progressStepText: {
    color: gameTheme.colors.textSoft,
    fontSize: 14,
    fontWeight: '800',
  },
  progressStepTextActive: {
    color: gameTheme.colors.white,
  },
  liveDotWrap: {
    width: 14,
    height: 14,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotHalo: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 133, 161, 0.38)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: gameTheme.colors.pink,
  },
  liveDotSpacer: {
    width: 14,
    height: 14,
    marginTop: 8,
  },
  questionCard: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: gameTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: gameTheme.colors.panelBorder,
  },
  questionTitle: {
    color: gameTheme.colors.text,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '900',
  },
  correctAnswerChip: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: gameTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: gameTheme.colors.purpleSoft,
  },
  correctAnswerText: {
    color: gameTheme.colors.purpleDark,
    fontSize: 13,
    fontWeight: '800',
  },
  scoreboardWrap: {
    gap: 10,
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: gameTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: gameTheme.colors.panelBorder,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  scoreCardLeader: {
    backgroundColor: 'rgba(255, 216, 107, 0.18)',
    borderColor: 'rgba(255, 216, 107, 0.36)',
  },
  scoreRank: {
    width: 32,
    textAlign: 'center',
    color: gameTheme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  scoreEmoji: {
    fontSize: 28,
  },
  scoreInfo: {
    flex: 1,
  },
  scoreName: {
    color: gameTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  scoreValue: {
    marginTop: 2,
    color: gameTheme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  scoreCrown: {
    fontSize: 20,
  },
  emptyScoreboard: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: gameTheme.colors.panelStrong,
  },
  emptyScoreboardText: {
    color: gameTheme.colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  answersWrap: {
    gap: 10,
  },
  answerCard: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: gameTheme.colors.panelStrong,
    borderWidth: 1,
    borderColor: gameTheme.colors.panelBorder,
    borderLeftWidth: 4,
    borderLeftColor: gameTheme.colors.purple,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  answerCardCorrect: {
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderColor: 'rgba(46, 204, 113, 0.28)',
    borderLeftColor: gameTheme.colors.success,
  },
  answerCardWrong: {
    backgroundColor: 'rgba(255, 118, 117, 0.12)',
    borderColor: 'rgba(255, 118, 117, 0.28)',
    borderLeftColor: gameTheme.colors.danger,
  },
  answerCardSkipped: {
    backgroundColor: 'rgba(246, 211, 101, 0.18)',
    borderColor: 'rgba(246, 211, 101, 0.32)',
    borderLeftColor: '#e0ab18',
  },
  answerCardOffline: {
    backgroundColor: 'rgba(164, 168, 191, 0.14)',
    borderColor: 'rgba(164, 168, 191, 0.28)',
    borderLeftColor: gameTheme.colors.offline,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerPlayerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  answerPlayerEmoji: {
    fontSize: 24,
  },
  answerPlayerName: {
    color: gameTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  answerOfflineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: gameTheme.radius.pill,
    overflow: 'hidden',
    color: gameTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: gameTheme.colors.offlineSoft,
  },
  answerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  answerStateLabel: {
    color: gameTheme.colors.purpleDark,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(108, 92, 231, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
  },
  scoreActionPositive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.success,
  },
  scoreActionNegative: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.danger,
  },
  scoreActionPressed: {
    opacity: 0.9,
  },
  scoreActionText: {
    color: gameTheme.colors.white,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  answerBubble: {
    marginTop: 12,
    borderRadius: gameTheme.radius.control,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(108, 92, 231, 0.22)',
  },
  answerBubbleCorrect: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(46, 204, 113, 0.35)',
  },
  answerBubbleWrong: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255, 118, 117, 0.35)',
  },
  answerBubbleSkipped: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(246, 211, 101, 0.42)',
  },
  answerBubbleOffline: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(164, 168, 191, 0.34)',
  },
  answerBubbleText: {
    color: gameTheme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  nextButton: {
    marginTop: 20,
  },
});
