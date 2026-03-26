import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';
import { GameLobbyPlayer, GameQuestion, GameStatus } from '@/features/game/types';

type GamePlayerScreenProps = {
  answerDraft: string;
  answerInputError: boolean;
  currentQuestionData?: GameQuestion;
  gameStatus: GameStatus;
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
  onPlayerNavBack: () => void;
  onPlayerNavForward: () => void;
  onSendOptionAnswer: (option: string) => void;
  onSendTextAnswer: () => void;
};

export function GamePlayerScreen({
  answerDraft,
  answerInputError,
  currentQuestionData,
  gameStatus,
  myAnswersHistory,
  myEmoji,
  onAnswerDraftChange,
  onGoToCurrentQuestion,
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
  const actualPlayers = players.filter((player) => !player.is_host);
  const isPastQuestion = playerViewQuestion < realGameQuestion;
  const myAnswer = myAnswersHistory[String(playerViewQuestion)];
  const canGoBack = playerViewQuestion > 1;
  const canGoForward = playerViewQuestion < realGameQuestion;
  const showNav = realGameQuestion > 1;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView bounces={false} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.quizHeader}>
          <Text style={styles.quizSub}>QUIZ PARTY</Text>
          <Text style={styles.quizTitle}>{quizTitle}</Text>
        </View>

        {gameStatus === 'waiting' ? (
          <View style={styles.sectionCard}>
            <Text style={styles.waitTitle}>ТЫ В ИГРЕ!</Text>
            <Text style={styles.waitSubtitle}>Ждём, пока организатор начнёт раунд...</Text>

            <Text style={styles.miniLabel}>В КОМНАТЕ</Text>
            <View style={styles.playerGrid}>
              {actualPlayers.map((player) => {
                const isMe = player.name === playerName;
                return (
                  <View key={player.name} style={[styles.playerCard, isMe && styles.playerCardMe, player.connected === false && styles.playerCardOffline]}>
                    {isMe ? <Text style={styles.meBadge}>ВЫ</Text> : null}
                    <Text style={styles.playerEmoji}>{player.emoji ?? '👤'}</Text>
                    <Text style={styles.playerNameLabel}>{player.name}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.waitHint}>Приготовься, скоро начнётся! 🔥</Text>
          </View>
        ) : (
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

            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{currentQuestionData?.text ?? 'Готовим вопрос...'}</Text>
              <View style={styles.questionLine} />
            </View>

            {isPastQuestion ? (
              <View style={styles.answerPreviewCard}>
                <Text style={styles.answerPreviewLabel}>Твой ответ:</Text>
                <Text style={styles.answerPreviewValue}>{myAnswer ?? '—'}</Text>

                <Pressable onPress={onGoToCurrentQuestion} style={({ pressed }) => [styles.returnButton, pressed && styles.returnButtonPressed]}>
                  <Text style={styles.returnButtonText}>Вернуться к текущему вопросу →</Text>
                </Pressable>
              </View>
            ) : myAnswer ? (
              <View style={styles.answerPreviewCard}>
                <Text style={styles.sentBadge}>Отправлено 🚀</Text>
                <Text style={styles.answerPreviewLabel}>Твой ответ:</Text>
                <Text style={styles.answerPreviewValue}>{myAnswer}</Text>
                <Text style={styles.waitingLabel}>Ждём остальных игроков...</Text>
              </View>
            ) : currentQuestionData?.type === 'options' ? (
              <View style={styles.optionsGrid}>
                {(currentQuestionData.options ?? []).map((option) => (
                  <Pressable key={option} onPress={() => onSendOptionAnswer(option)} style={({ pressed }) => [styles.optionButton, pressed && styles.optionButtonPressed]}>
                    <Text style={styles.optionButtonText}>{option}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.inputSection}>
                <View style={[styles.inputWrap, answerInputError && styles.inputWrapError]}>
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
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 10, paddingTop: 18, paddingBottom: 30 },
  quizHeader: { alignItems: 'center', marginBottom: 14 },
  quizSub: { color: gameTheme.colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  quizTitle: { marginTop: 4, color: gameTheme.colors.purpleDark, fontSize: 28, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  sectionCard: { borderRadius: gameTheme.radius.card, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: gameTheme.colors.panel, borderWidth: 1, borderColor: gameTheme.colors.panelBorder },
  waitTitle: { color: gameTheme.colors.purpleDark, fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center' },
  waitSubtitle: { marginTop: 10, color: gameTheme.colors.textSoft, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  miniLabel: { marginTop: 18, marginBottom: 10, color: gameTheme.colors.textMuted, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  playerCard: { width: '48%', borderRadius: gameTheme.radius.section, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: gameTheme.colors.panelStrong, alignItems: 'center' },
  playerCardMe: { borderWidth: 1.5, borderColor: gameTheme.colors.pink },
  playerCardOffline: { opacity: 0.72 },
  meBadge: { marginBottom: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: gameTheme.radius.pill, overflow: 'hidden', color: gameTheme.colors.white, fontSize: 11, fontWeight: '900', backgroundColor: gameTheme.colors.pink },
  playerEmoji: { fontSize: 34 },
  playerNameLabel: { marginTop: 8, color: gameTheme.colors.text, fontSize: 15, fontWeight: '800' },
  waitHint: { marginTop: 18, color: gameTheme.colors.textSoft, fontSize: 15, fontWeight: '700', textAlign: 'center' },
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
  questionCard: { marginTop: 16, borderRadius: gameTheme.radius.section, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: gameTheme.colors.panelStrong },
  questionText: { color: gameTheme.colors.text, fontSize: 26, lineHeight: 33, fontWeight: '900' },
  questionLine: { width: 72, height: 4, marginTop: 14, borderRadius: 2, backgroundColor: gameTheme.colors.pink },
  answerPreviewCard: { marginTop: 18, borderRadius: gameTheme.radius.section, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: gameTheme.colors.panelStrong },
  answerPreviewLabel: { color: gameTheme.colors.textSoft, fontSize: 13, fontWeight: '800' },
  answerPreviewValue: { marginTop: 8, color: gameTheme.colors.text, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  returnButton: { minHeight: 48, marginTop: 16, borderRadius: gameTheme.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.chip },
  returnButtonPressed: { opacity: 0.92 },
  returnButtonText: { color: gameTheme.colors.purpleDark, fontSize: 14, fontWeight: '800' },
  sentBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: gameTheme.radius.pill, overflow: 'hidden', color: gameTheme.colors.white, fontSize: 11, fontWeight: '900', backgroundColor: gameTheme.colors.success },
  waitingLabel: { marginTop: 14, color: gameTheme.colors.textSoft, fontSize: 14, fontWeight: '700' },
  optionsGrid: { gap: 10, marginTop: 18 },
  optionButton: { minHeight: 56, borderRadius: gameTheme.radius.section, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.panelStrong },
  optionButtonPressed: { transform: [{ scale: 0.985 }], backgroundColor: gameTheme.colors.pinkSoft },
  optionButtonText: { color: gameTheme.colors.text, fontSize: 16, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  inputSection: { marginTop: 18 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: gameTheme.radius.section, paddingLeft: 16, paddingRight: 10, backgroundColor: gameTheme.colors.panelStrong },
  inputWrapError: { borderWidth: 1.5, borderColor: gameTheme.colors.danger },
  input: { flex: 1, minHeight: 58, color: gameTheme.colors.text, fontSize: 16, fontWeight: '700' },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.purple },
  sendButtonPressed: { opacity: 0.92 },
  sendButtonText: { color: gameTheme.colors.white, fontSize: 22, fontWeight: '900', lineHeight: 24 },
});
