import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GameLobbyPlayerTile } from '@/features/game/components/game-lobby-player-tile';
import { GameLobbyRosterHeader } from '@/features/game/components/game-lobby-roster-card';
import { LobbyPlayerEmoji } from '@/features/game/components/lobby-player-emoji';
import { gameTheme } from '@/features/game/theme/game-theme';
import { GameLobbyPlayer, GameQuestion, GameStatus } from '@/features/game/types';

type GamePlayerScreenProps = {
  answerDraft: string;
  answerInputError: boolean;
  currentQuestionData?: GameQuestion;
  gameStatus: GameStatus;
  isHostOffline: boolean;
  leaveDisabled: boolean;
  myAnswersHistory: Record<string, string>;
  myEmoji: string;
  playerName: string;
  playerViewQuestion: number;
  players: GameLobbyPlayer[];
  questions: GameQuestion[];
  quizTitle: string;
  realGameQuestion: number;
  onAnswerDraftChange: (value: string) => void;
  onGoToCurrentQuestion: () => void;
  onLeaveGame: () => void;
  onPlayerNavBack: () => void;
  onPlayerNavForward: () => void;
  onSendOptionAnswer: (option: string) => void;
  onSendTextAnswer: () => void;
};

// Для вариантов ответа задаём циклическую палитру, чтобы карточки не сливались с белым фоном
// и визуально считывались как отдельные интерактивные элементы.
function getOptionToneStyle(index: number) {
  if (index % 4 === 0) {
    return styles.optionButtonPurple;
  }

  if (index % 4 === 1) {
    return styles.optionButtonPink;
  }

  if (index % 4 === 2) {
    return styles.optionButtonCyan;
  }

  return styles.optionButtonGold;
}

// Экран игрока собирает lobby ожидания, активный вопрос и просмотр уже отправленного ответа.
// Вся игровая логика приходит извне через props, а этот компонент отвечает только за native-подачу.
export function GamePlayerScreen({
  answerDraft,
  answerInputError,
  currentQuestionData,
  gameStatus,
  isHostOffline,
  leaveDisabled,
  myAnswersHistory,
  myEmoji,
  onAnswerDraftChange,
  onGoToCurrentQuestion,
  onLeaveGame,
  onPlayerNavBack,
  onPlayerNavForward,
  onSendOptionAnswer,
  onSendTextAnswer,
  playerName,
  playerViewQuestion,
  players,
  questions,
  quizTitle,
  realGameQuestion,
}: GamePlayerScreenProps) {
  // Из общего списка игроков исключаем хоста, чтобы в лобби показывать только участников комнаты.
  const actualPlayers = players.filter((player) => !player.is_host);
  const isPastQuestion = playerViewQuestion < realGameQuestion;
  const myAnswer = myAnswersHistory[String(playerViewQuestion)];
  const canGoBack = playerViewQuestion > 1;
  const canGoForward = playerViewQuestion < realGameQuestion;
  const normalizedQuizTitle = quizTitle.trim() || 'Вечеринка без названия';
  const showNav = realGameQuestion > 1;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView bounces={false} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isHostOffline ? (
          <View style={styles.hostOfflineBanner}>
            <Text style={styles.hostOfflineTitle}>Хост оффлайн</Text>
            <Text style={styles.hostOfflineText}>Ждём, пока ведущий вернётся в игру.</Text>
          </View>
        ) : null}

        {gameStatus === 'waiting' ? (
          <View style={styles.sectionCard}>
            <View style={styles.playerLobbyIntro}>
              <View style={styles.playerLobbyChip}>
                <View style={styles.playerLobbyChipDot} />
                <Text style={styles.playerLobbyChipText}>Комната ожидания</Text>
              </View>

              <Text style={styles.playerLobbyTitle}>
                {normalizedQuizTitle}
              </Text>

              <View style={styles.playerLobbyReadyPill}>
                <Text style={styles.playerLobbyReadyEmoji}>{myEmoji}</Text>
                <Text style={styles.playerLobbyReadyText}>Ты в игре</Text>
              </View>

              <Text style={styles.playerLobbySubtitle}>Ждём, пока организатор начнёт раунд...</Text>
            </View>

            <GameLobbyRosterHeader count={actualPlayers.length} label="Участники" />

            {!actualPlayers.length ? (
              <View style={styles.emptyState}>
                <LobbyPlayerEmoji
                  emoji="✨"
                  idleDelay={0}
                  isInteractive={false}
                  style={styles.emptyEmoji}
                />
                <Text style={styles.emptyTitle}>Комната собирается</Text>
                <Text style={styles.emptyHint}>Как только кто-то подключится, карточки появятся здесь.</Text>
              </View>
            ) : (
              <View style={styles.playerGrid}>
                {actualPlayers.map((player, index) => {
                  const isMe = player.name === playerName;

                  return (
                    <GameLobbyPlayerTile
                      key={player.name}
                      emoji={player.emoji ?? '👤'}
                      idleDelay={(index % 4) * 180}
                      isMe={isMe}
                      isOffline={player.connected === false}
                      name={player.name}
                    />
                  );
                })}
              </View>
            )}

            <View style={styles.waitHintCard}>
              <Text style={styles.waitHint}>Приготовься, скоро начнётся! 🔥</Text>
            </View>
          </View>
        ) : (
          <View style={styles.activeScreenWrap}>
            <View style={styles.sectionCard}>
            <View style={styles.headerRow}>
              <View style={styles.playerBadge}>
                <Text style={styles.playerBadgeEmoji}>{myEmoji}</Text>
                <Text style={styles.playerBadgeName}>{playerName}</Text>
              </View>

              <View style={styles.counterWrap}>
                {showNav ? (
                  <Pressable
                    disabled={!canGoBack}
                    onPress={onPlayerNavBack}
                    style={({ pressed }) => [
                      styles.navButton,
                      !canGoBack && styles.navButtonDisabled,
                      pressed && canGoBack && styles.navButtonPressed,
                    ]}>
                    <Text style={styles.navButtonText}>‹</Text>
                  </Pressable>
                ) : null}

                <Text style={styles.counterText}>
                  {playerViewQuestion} <Text style={styles.counterTextMuted}>/ {questions.length}</Text>
                </Text>

                {showNav ? (
                  <Pressable
                    disabled={!canGoForward}
                    onPress={onPlayerNavForward}
                    style={({ pressed }) => [
                      styles.navButton,
                      !canGoForward && styles.navButtonDisabled,
                      pressed && canGoForward && styles.navButtonPressed,
                    ]}>
                    <Text style={styles.navButtonText}>›</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.questionStage}>
            <View style={styles.questionCard}>
              {/* Вопрос центрируем, чтобы экран ответа воспринимался собранно и спокойно. */}
              <Text style={styles.questionText}>{currentQuestionData?.text ?? 'Готовим вопрос...'}</Text>
              <View style={styles.questionLine} />
            </View>

            {isPastQuestion ? (
              <View style={[styles.answerPreviewCard, styles.answerPreviewCardPast]}>
                <View style={styles.answerPreviewBubble}>
                  <Text style={[styles.answerPreviewLabel, styles.answerPreviewLabelCentered]}>Твой ответ</Text>
                  <Text style={[styles.answerPreviewValue, styles.answerPreviewValueCentered]}>{myAnswer ?? '—'}</Text>
                </View>

                <Pressable onPress={onGoToCurrentQuestion} style={({ pressed }) => [styles.returnButton, pressed && styles.returnButtonPressed]}>
                  <Text style={styles.returnButtonText}>Вернуться к текущему вопросу →</Text>
                </Pressable>
              </View>
            ) : myAnswer ? (
              <View style={[styles.answerPreviewCard, styles.answerPreviewCardSubmitted]}>
                {/* Статус отправки специально центрируем, чтобы игрок сразу видел,
                    что ответ принят и больше ничего нажимать не нужно. */}
                <Text style={styles.sentBadge}>Отправлено 🚀</Text>
                <View style={styles.answerPreviewBubble}>
                  <Text style={[styles.answerPreviewLabel, styles.answerPreviewLabelCentered]}>Твой ответ</Text>
                  <Text style={[styles.answerPreviewValue, styles.answerPreviewValueCentered]}>{myAnswer}</Text>
                </View>
                <Text style={styles.waitingLabel}>Ждём остальных игроков...</Text>
              </View>
            ) : currentQuestionData?.type === 'options' ? (
              <View style={styles.optionsGrid}>
                {(currentQuestionData.options ?? []).map((option, index) => (
                  <Pressable
                    key={option}
                    onPress={() => onSendOptionAnswer(option)}
                    style={({ pressed }) => [styles.optionButton, getOptionToneStyle(index), pressed && styles.optionButtonPressed]}>
                    <Text style={styles.optionButtonText}>{option}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.inputSection}>
                <View style={[styles.inputWrap, answerInputError && styles.inputWrapError]}>
                  {/* Поле ввода отделяем по фону и рамке от внешнего контейнера,
                      чтобы оно не терялось на белом экране. */}
                  <TextInput
                    autoCapitalize="sentences"
                    maxLength={50}
                    onChangeText={onAnswerDraftChange}
                    placeholder="Ответ..."
                    placeholderTextColor={gameTheme.colors.textMuted}
                    style={styles.input}
                    value={answerDraft}
                  />

                  <Pressable onPress={onSendTextAnswer} style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
                    <Text style={styles.sendButtonText}>→</Text>
                  </Pressable>
                </View>
              </View>
            )}

            </View>

            <Pressable
              onPress={onLeaveGame}
              style={({ pressed }) => ({
                alignSelf: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={styles.leaveButtonText}>Выйти</Text>
            </Pressable>
          </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 10, paddingTop: 18, paddingBottom: 30 },
  hostOfflineBanner: {
    marginBottom: 14,
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(253, 160, 133, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(253, 160, 133, 0.28)',
  },
  hostOfflineTitle: { color: '#b05a32', fontSize: 15, fontWeight: '900' },
  hostOfflineText: { marginTop: 6, color: '#7f624f', fontSize: 14, lineHeight: 20, fontWeight: '700' },
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
  activeScreenWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  questionStage: {
    width: '100%',
  },
  playerLobbyIntro: {
    alignItems: 'center',
    marginBottom: 18,
  },
  playerLobbyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: gameTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.08)',
  },
  playerLobbyChipDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: gameTheme.colors.pinkDark,
  },
  playerLobbyChipText: {
    color: gameTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  playerLobbyTitle: {
    marginTop: 14,
    color: gameTheme.colors.purpleDark,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  playerLobbyReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    borderRadius: gameTheme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255, 133, 161, 0.14)',
  },
  playerLobbyReadyEmoji: {
    fontSize: 16,
  },
  playerLobbyReadyText: {
    color: gameTheme.colors.pinkDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  playerLobbySubtitle: {
    marginTop: 12,
    color: gameTheme.colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyState: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(108, 92, 231, 0.18)',
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
  },
  emptyEmoji: { fontSize: 34 },
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
    gap: 10,
  },
  waitHintCard: {
    marginTop: 18,
    borderRadius: gameTheme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(233, 251, 253, 0.68)',

  },
  waitHint: { color: gameTheme.colors.textSoft, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  playerBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '52%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: gameTheme.radius.pill, backgroundColor: gameTheme.colors.chip },
  playerBadgeEmoji: { fontSize: 20 },
  playerBadgeName: { color: gameTheme.colors.text, fontSize: 14, fontWeight: '800' },
  counterWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.chip },
  navButtonDisabled: { opacity: 0.4 },
  navButtonPressed: { transform: [{ scale: 0.97 }] },
  navButtonText: { color: gameTheme.colors.purpleDark, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  counterText: { color: gameTheme.colors.text, fontSize: 14, fontWeight: '800' },
  counterTextMuted: { color: gameTheme.colors.textMuted },
  questionCard: {
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: gameTheme.colors.panelStrong,
  },
  questionText: { color: gameTheme.colors.text, fontSize: 26, lineHeight: 33, fontWeight: '900', textAlign: 'center' },
  questionLine: { width: 72, height: 4, marginTop: 12, borderRadius: 2, alignSelf: 'center', backgroundColor: gameTheme.colors.pink },
  answerPreviewCard: { marginTop: 18 },
  answerPreviewCardPast: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
  },
  answerPreviewCardSubmitted: {
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  answerPreviewBubble: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(108, 92, 231, 0.1)',
    
    // Добавляем контур:
    borderWidth: 2, // Толщина линии (обычно 1 или 2)
    borderColor: '#a298ed', // Цвет линии (можно использовать переменную из темы)
    borderStyle: 'dashed', // Тип линии: 'solid', 'dotted', 'dashed' (по умолчанию solid)
  },
  answerPreviewLabel: { color: gameTheme.colors.purpleDark, fontSize: 13, fontWeight: '800' },
  answerPreviewLabelCentered: { textAlign: 'center' },
  answerPreviewValue: { marginTop: 8, color: gameTheme.colors.text, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  answerPreviewValueCentered: { textAlign: 'center' },
  returnButton: { minHeight: 48, marginTop: 16, borderRadius: gameTheme.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(138, 126, 230, 0)' },
  returnButtonPressed: { opacity: 0.92 },
  returnButtonText: { color: '#757575', fontSize: 14, fontWeight: '800' },
  sentBadge: {
    alignSelf: 'center',
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: gameTheme.radius.pill,
    overflow: 'hidden',
    color: gameTheme.colors.white,
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: gameTheme.colors.success,
  },
  waitingLabel: { marginTop: 14, color: gameTheme.colors.textSoft, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  optionsGrid: { gap: 10, marginTop: 18 },
  optionButton: {
    minHeight: 58,
    borderRadius: gameTheme.radius.section,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  optionButtonPurple: { backgroundColor: gameTheme.colors.purpleSoft, borderColor: 'rgba(108, 92, 231, 0.22)' },
  optionButtonPink: { backgroundColor: gameTheme.colors.pinkSoft, borderColor: 'rgba(255, 133, 161, 0.24)' },
  optionButtonCyan: { backgroundColor: 'rgba(67, 255, 242, 0.16)', borderColor: 'rgba(67, 255, 242, 0.28)' },
  optionButtonGold: { backgroundColor: 'rgba(246, 211, 101, 0.22)', borderColor: 'rgba(246, 211, 101, 0.34)' },
  optionButtonPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  optionButtonText: { color: gameTheme.colors.text, fontSize: 16, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  inputSection: { marginTop: 18 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: gameTheme.radius.section,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 8,
    backgroundColor: gameTheme.colors.chip,
    borderWidth: 1,
    borderColor: gameTheme.colors.chipBorder,
  },
  inputWrapError: { borderWidth: 1.5, borderColor: gameTheme.colors.danger },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: gameTheme.radius.control,
    backgroundColor: 'rgba(255,255,255,0.96)',
    color: gameTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sendButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.purple },
  sendButtonPressed: { opacity: 0.92 },
  sendButtonText: { color: gameTheme.colors.white, fontSize: 22, fontWeight: '900', lineHeight: 24 },

  leaveButtonText: {
    color: 'rgba(117, 117, 117, 0.58)',
    fontSize: 15,
    marginTop: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
});
