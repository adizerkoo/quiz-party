import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameBackground } from '@/features/game/components/game-background';
import { GameBlockedScreen } from '@/features/game/components/game-blocked-screen';
import { GameDialog } from '@/features/game/components/game-dialog';
import { GameHostScreen } from '@/features/game/components/game-host-screen';
import { GamePlayerScreen } from '@/features/game/components/game-player-screen';
import { GameResultsScreen } from '@/features/game/components/game-results-screen';
import { GameStartIntroOverlay } from '@/features/game/components/game-start-intro-overlay';
import { GameToastStack } from '@/features/game/components/game-toast-stack';
import { GameWinnerIntroOverlay } from '@/features/game/components/game-winner-intro-overlay';
import { useNativeGameController } from '@/features/game/hooks/use-native-game-controller';
import { gameTheme } from '@/features/game/theme/game-theme';
import { GameRole } from '@/features/game/types';

type NativeGameScreenProps = {
  role: GameRole;
  roomCode: string;
  source?: string;
};

export function NativeGameScreen({ role, roomCode, source }: NativeGameScreenProps) {
  const controller = useNativeGameController({ role, roomCode, source });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <GameBackground />
        <GameToastStack items={controller.toasts} />

        {controller.isBootstrapping ? (
          <View style={styles.loadingWrap}>
            <View style={styles.loadingCard}>
              <ActivityIndicator color={gameTheme.colors.purple} size="large" />
              <Text style={styles.loadingTitle}>Открываем комнату...</Text>
              <Text style={styles.loadingSubtitle}>Подключаемся к {controller.roomCode}</Text>
            </View>
          </View>
        ) : controller.blockedState ? (
          <GameBlockedScreen blockedState={controller.blockedState} onBackToMenu={controller.handleBackToMenu} />
        ) : controller.gameStatus === 'finished' ? (
          <GameResultsScreen
            onBackToMenu={controller.handleBackToMenu}
            onToggleReview={() => controller.setReviewExpanded((current) => !current)}
            payload={controller.resultsPayload}
            playerName={controller.playerName}
            reviewExpanded={controller.reviewExpanded}
          />
        ) : role === 'host' ? (
          <GameHostScreen
            currentQuestion={controller.currentQuestion}
            currentQuestionData={controller.currentHostQuestionData}
            disconnectedNamesSet={controller.disconnectedNamesSet}
            gameStatus={controller.gameStatus}
            maxReachedQuestion={controller.maxReachedQuestion}
            onBackToCreate={controller.handleBackToCreate}
            onChangeScore={controller.handleChangeScore}
            onCopyRoom={controller.handleCopyRoom}
            onJumpToQuestion={controller.handleJumpToQuestion}
            onKickPlayer={controller.handleKickPlayer}
            onNextQuestion={controller.handleNextQuestion}
            onShareRoom={controller.handleShareRoom}
            onStartGame={controller.handleStartGame}
            players={controller.players}
            questions={controller.questions}
            quizTitle={controller.quizTitle}
            realGameQuestion={controller.realGameQuestion}
            roomCode={controller.roomCode}
          />
        ) : (
          <GamePlayerScreen
            answerDraft={controller.answerDraft}
            answerInputError={controller.answerInputError}
            currentQuestionData={controller.currentPlayerQuestionData}
            gameStatus={controller.gameStatus}
            isHostOffline={controller.isHostOffline}
            leaveDisabled={controller.leavePending}
            myAnswersHistory={controller.myAnswersHistory}
            myEmoji={controller.myEmoji}
            onAnswerDraftChange={controller.handleAnswerDraftChange}
            onGoToCurrentQuestion={controller.handleGoToCurrentQuestion}
            onLeaveGame={controller.handleLeaveGame}
            onPlayerNavBack={controller.handlePlayerNavBack}
            onPlayerNavForward={controller.handlePlayerNavForward}
            onSendOptionAnswer={controller.handleSendOptionAnswer}
            onSendTextAnswer={controller.handleSendTextAnswer}
            playerName={controller.playerName}
            playerViewQuestion={controller.playerViewQuestion}
            players={controller.players}
            questions={controller.questions}
            quizTitle={controller.quizTitle}
            realGameQuestion={controller.realGameQuestion}
          />
        )}

        <GameDialog
          cancelLabel="Нет"
          confirmLabel="Да, дальше"
          description="Некоторые игроки ещё думают. Всё равно переключаем вопрос?"
          onCancel={controller.handleCancelProceed}
          onConfirm={controller.handleConfirmProceed}
          title="Стоп-стоп ✋"
          visible={controller.confirmVisible}
        />

        <GameDialog
          confirmLabel="Понятно 👌"
          description="Отправь код комнаты друзьям, вместе веселее."
          onConfirm={() => controller.setHostNoPlayersWarningVisible(false)}
          title="Тут пока пусто!"
          visible={controller.hostNoPlayersWarningVisible}
        />

        <GameDialog
          cancelLabel="Остаться"
          confirmLabel="Выйти"
          description="Если вы выйдете, вернуться в эту игру уже не получится."
          onCancel={controller.handleCancelLeaveGame}
          onConfirm={controller.handleConfirmLeaveGame}
          title="Выйти из игры?"
          visible={controller.leaveConfirmVisible}
        />

        <GameStartIntroOverlay onFinish={() => controller.setStartIntroPlayers(null)} players={controller.startIntroPlayers} />
        <GameWinnerIntroOverlay onFinish={() => controller.setWinnerIntroPlayers(null)} winners={controller.winnerIntroPlayers} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: gameTheme.colors.screenTop,
  },
  screen: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  loadingCard: {
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: gameTheme.colors.panel,
  },
  loadingTitle: {
    marginTop: 14,
    color: gameTheme.colors.purpleDark,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: 8,
    color: gameTheme.colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
