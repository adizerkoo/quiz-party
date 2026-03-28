import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Href, useRouter } from 'expo-router';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Share } from 'react-native';
import { io, Socket } from 'socket.io-client';

import { saveCreateDraft } from '@/features/create/services/create-storage';
import { createEmptyQuestionDraft } from '@/features/create/utils/create-validation';
import {
  clearGameSessionCredentials,
  getGameSessionCredentials,
  hydrateGameSessionCredentials,
  saveGameSessionCredentials,
} from '@/features/game/store/game-session-credentials';
import {
  getMenuSessionProfile,
  getOrCreateMenuInstallationPublicId,
  hydrateMenuSessionProfile,
  mergeMenuSessionProfileIdentity,
} from '@/features/menu/store/menu-profile-session';
import { buildGameShareUrl, checkStoredGameResume, fetchGameQuiz } from '@/features/game/services/game-api';
import {
  GameBlockedState,
  GameLobbyPlayer,
  GameQuestion,
  GameResultsPayload,
  GameRole,
  GameStatus,
  GameToastItem,
} from '@/features/game/types';
import {
  buildBlockedState,
  buildBlockedStateFromCancelReason,
  buildBlockedStateFromResumeReason,
  getResultWinners,
} from '@/features/game/utils/game-view';
import { WEB_APP_ORIGIN } from '@/features/web/config/web-app';

type UseNativeGameControllerParams = {
  role: GameRole;
  roomCode: string;
};

function makeToastId() {
  return `${Date.now()}-${Math.random()}`;
}

export function useNativeGameController({ role, roomCode }: UseNativeGameControllerParams) {
  const router = useRouter();
  const initialProfile = getMenuSessionProfile();
  const socketRef = useRef<Socket | null>(null);
  const questionShownAtRef = useRef<number | null>(null);
  const playerNameRef = useRef(initialProfile?.name ?? (role === 'host' ? 'Ведущий' : 'Игрок'));
  const realGameQuestionRef = useRef(0);
  const currentQuestionRef = useRef(0);
  const questionsCountRef = useRef(0);
  const toastTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [players, setPlayers] = useState<GameLobbyPlayer[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>('waiting');
  const [blockedState, setBlockedState] = useState<GameBlockedState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [realGameQuestion, setRealGameQuestion] = useState(0);
  const [maxReachedQuestion, setMaxReachedQuestion] = useState(0);
  const [playerViewQuestion, setPlayerViewQuestion] = useState(0);
  const [myAnswersHistory, setMyAnswersHistory] = useState<Record<string, string>>({});
  const [playerName, setPlayerName] = useState(playerNameRef.current);
  const [myEmoji, setMyEmoji] = useState(initialProfile?.emoji ?? '👤');
  const [resultsPayload, setResultsPayload] = useState<GameResultsPayload | null>(null);
  const [startIntroPlayers, setStartIntroPlayers] = useState<GameLobbyPlayer[] | null>(null);
  const [winnerIntroPlayers, setWinnerIntroPlayers] = useState(resultsPayload?.results ? getResultWinners(resultsPayload.results) : null);
  const [nextLocked, setNextLocked] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [toasts, setToasts] = useState<GameToastItem[]>([]);
  const [hostNoPlayersWarningVisible, setHostNoPlayersWarningVisible] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');
  const [answerInputError, setAnswerInputError] = useState(false);
  const [disconnectedNames, setDisconnectedNames] = useState<string[]>([]);
  const [isHostOffline, setIsHostOffline] = useState(false);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  useEffect(() => {
    realGameQuestionRef.current = realGameQuestion;
  }, [realGameQuestion]);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    // Количество вопросов храним в ref, чтобы socket-обработчики с длинным жизненным циклом
    // всегда читали актуальное значение, а не старое значение из замыкания.
    questionsCountRef.current = questions.length;
  }, [questions]);

  useEffect(() => {
    return () => {
      Object.values(toastTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
      socketRef.current?.disconnect();
    };
  }, []);

  function pushToast(message: string, duration = 4000) {
    const id = makeToastId();
    const nextToast = { id, message };

    setToasts((current) => {
      const limited = [...current, nextToast];
      return limited.slice(Math.max(0, limited.length - 3));
    });

    toastTimeoutsRef.current[id] = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      delete toastTimeoutsRef.current[id];
    }, duration);
  }

  function disconnectSocket() {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
  }

  function clearCurrentSessionCredentials() {
    clearGameSessionCredentials(roomCode, role);
  }

  // Собирает маршрут нужного игрового режима, чтобы безопасно переключать player <-> host экран.
  function buildRoleRoute(targetRole: GameRole) {
    return `/${targetRole === 'host' ? 'host-game' : 'player-game'}?room=${encodeURIComponent(roomCode)}` as Href;
  }

  function showBlocked(nextState: GameBlockedState) {
    disconnectSocket();
    setIsConnected(false);
    setIsHostOffline(false);
    setConfirmVisible(false);
    setLeaveConfirmVisible(false);
    setLeavePending(false);
    setBlockedState(nextState);
    setIsBootstrapping(false);
  }

  async function handleCopyRoom() {
    const shareUrl = buildGameShareUrl(roomCode);
    await Clipboard.setStringAsync(shareUrl);
    pushToast('Ссылка на комнату скопирована ✨', 2200);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleShareRoom() {
    const shareUrl = buildGameShareUrl(roomCode);
    try {
      await Share.share({
        title: 'Quiz Party',
        message: `Заходи в мою игру! Код комнаты: ${roomCode}\n${shareUrl}`,
        url: shareUrl,
      });
    } catch (error) {
      await handleCopyRoom();
    }
  }

  async function handleBackToCreate() {
    await saveCreateDraft({
      title: quizTitle,
      questions: questions.map((question) => ({
        text: question.text,
        type: question.type,
        correct: question.correct ?? '',
        options: question.options ?? null,
      })),
      questionDraft: {
        ...createEmptyQuestionDraft(),
        questionType: 'text',
      },
    });

    disconnectSocket();
    router.replace('/create');
  }

  function handleBackToMenu() {
    disconnectSocket();
    setLeaveConfirmVisible(false);
    setLeavePending(false);
    router.replace('/' as Href);
  }

  function emitGetUpdate() {
    socketRef.current?.emit('get_update', roomCode);
  }

  function syncQuestions(nextQuestions: GameQuestion[]) {
    // Держим state и ref синхронными через одну функцию, чтобы и UI, и socket-логика
    // опирались на один и тот же актуальный список вопросов.
    questionsCountRef.current = nextQuestions.length;
    setQuestions(nextQuestions);
  }

  function proceedToNextQuestion() {
    // Это защитный слой от преждевременного завершения игры:
    // здесь нельзя опираться на questions.length из старого замыкания socket-обработчика.
    const totalQuestions = questionsCountRef.current;
    setConfirmVisible(false);

    if (totalQuestions <= 0) {
      emitGetUpdate();
      return;
    }

    if (currentQuestionRef.current < totalQuestions) {
      socketRef.current?.emit('next_question_signal', {
        room: roomCode,
        expectedQuestion: currentQuestionRef.current,
      });
      return;
    }

    socketRef.current?.emit('finish_game_signal', { room: roomCode });
  }

  function handleStartGame() {
    const actualPlayers = players.filter((player) => !player.is_host);
    if (!actualPlayers.length) {
      setHostNoPlayersWarningVisible(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setCurrentQuestion(1);
    socketRef.current?.emit('start_game_signal', { room: roomCode });
  }

  function handleNextQuestion() {
    if (currentQuestion !== realGameQuestion) {
      setCurrentQuestion(realGameQuestion);
      emitGetUpdate();
      return;
    }

    if (nextLocked) {
      return;
    }

    setNextLocked(true);
    socketRef.current?.emit('check_answers_before_next', {
      room: roomCode,
      question: currentQuestion,
    });
  }

  function handleConfirmProceed() {
    proceedToNextQuestion();
  }

  function handleCancelProceed() {
    setConfirmVisible(false);
  }

  function handleKickPlayer(targetName: string) {
    socketRef.current?.emit('kick_player', {
      room: roomCode,
      playerName: targetName,
    });
  }

  function handleChangeScore(targetName: string, points: 1 | -1) {
    socketRef.current?.emit('override_score', {
      room: roomCode,
      playerName: targetName,
      points,
      questionIndex: currentQuestion,
    });
  }

  function handleJumpToQuestion(nextQuestion: number) {
    setCurrentQuestion(nextQuestion);
    socketRef.current?.emit('move_to_step', {
      room: roomCode,
      question: nextQuestion,
    });
    emitGetUpdate();
  }

  function handlePlayerNavBack() {
    setPlayerViewQuestion((current) => Math.max(1, current - 1));
  }

  function handlePlayerNavForward() {
    setPlayerViewQuestion((current) => Math.min(realGameQuestion, current + 1));
  }

  function handleGoToCurrentQuestion() {
    setPlayerViewQuestion(realGameQuestion);
  }

  function handleAnswerDraftChange(value: string) {
    setAnswerDraft(value);
    if (answerInputError) {
      setAnswerInputError(false);
    }
  }

  function handleLeaveGame() {
    if (leavePending) {
      return;
    }

    setLeaveConfirmVisible(true);
  }

  function handleCancelLeaveGame() {
    if (leavePending) {
      return;
    }

    setLeaveConfirmVisible(false);
  }

  function handleConfirmLeaveGame() {
    if (leavePending) {
      return;
    }

    setLeavePending(true);
    setLeaveConfirmVisible(false);
    socketRef.current?.emit('leave_game', { room: roomCode });
  }

  function sendAnswer(answerValue: string) {
    setMyAnswersHistory((current) => ({
      ...current,
      [String(realGameQuestionRef.current)]: answerValue,
    }));

    const answerTime = questionShownAtRef.current
      ? Math.round((Date.now() - questionShownAtRef.current) / 100) / 10
      : null;

    socketRef.current?.emit('send_answer', {
      room: roomCode,
      name: playerNameRef.current,
      answer: answerValue,
      questionIndex: realGameQuestionRef.current,
      answerTime,
    });

    setAnswerDraft('');
    void Haptics.selectionAsync();
  }

  function handleSendTextAnswer() {
    const trimmed = answerDraft.trim();
    if (!trimmed) {
      setAnswerInputError(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    sendAnswer(trimmed);
  }

  function handleSendOptionAnswer(option: string) {
    if (myAnswersHistory[String(realGameQuestion)]) {
      return;
    }

    sendAnswer(option);
  }

  // Проверяет сохранённые credentials на сервере для указанной роли
  // и при необходимости очищает именно их, а не только текущий экран.
  async function validateResumeEligibilityForRole(
    targetRole: GameRole,
    params: {
    participantId?: string | null;
    participantToken?: string | null;
    hostToken?: string | null;
    installationPublicId?: string | null;
    userId?: number | null;
  }) {
    if (!params.participantId && !params.participantToken && !params.hostToken) {
      return { canProceed: true, verified: false };
    }

    try {
      const response = await checkStoredGameResume({
        sessions: [
          {
            roomCode,
            role: targetRole,
            participantId: params.participantId ?? null,
            participantToken: params.participantToken ?? null,
            hostToken: params.hostToken ?? null,
            installationPublicId: params.installationPublicId ?? null,
          },
        ],
        userId: params.userId ?? null,
        installationPublicId: params.installationPublicId ?? null,
      });

      const session = Array.isArray(response.sessions) ? response.sessions[0] : null;
      if (!session) {
        return { canProceed: true, verified: false };
      }

      if (session.clear_credentials) {
        clearGameSessionCredentials(roomCode, targetRole);
      }

      if (session.can_resume) {
        return { canProceed: true, verified: true };
      }

      return {
        canProceed: false,
        verified: true,
        reason: session.reason ?? null,
        cancelReason: session.cancel_reason ?? null,
      };
    } catch (error) {
      return { canProceed: true, verified: false };
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!roomCode) {
        showBlocked(buildBlockedState('missing_room'));
        return;
      }

      const [activeProfile] = await Promise.all([
        hydrateMenuSessionProfile(),
        hydrateGameSessionCredentials(),
      ]);
      const installationPublicId =
        activeProfile?.installationPublicId ??
        getOrCreateMenuInstallationPublicId();
      const currentCredentials = getGameSessionCredentials(roomCode, role);
      const fallbackHostCredentials =
        role === 'player'
          ? getGameSessionCredentials(roomCode, 'host')
          : null;

      if (role === 'player' && !activeProfile) {
        showBlocked(buildBlockedState('missing_profile'));
        return;
      }

      // После холодного старта профиль восстанавливается асинхронно из локального файла.
      // Сразу синхронизируем ref/state, чтобы join_room ушёл с корректным именем и emoji.
      // Имя хоста в БД должно быть реальным nickname, а не техническим placeholder.
      const resolvedPlayerName = activeProfile?.name ?? (role === 'host' ? 'Ведущий' : 'Игрок');
      playerNameRef.current = resolvedPlayerName;
      setPlayerName(resolvedPlayerName);
      setMyEmoji(activeProfile?.emoji ?? '👤');

      setIsBootstrapping(true);
      setBlockedState(null);
      setIsHostOffline(false);

      try {
        if (role === 'player' && fallbackHostCredentials?.hostToken) {
          // Если player-экран открывает сам хост со своими сохранёнными токенами,
          // заранее переводим его в host-режим и не даём создать лишнего игрока.
          const hostResumeAccess = await validateResumeEligibilityForRole('host', {
            participantId: fallbackHostCredentials.participantId ?? null,
            participantToken: fallbackHostCredentials.participantToken ?? null,
            hostToken: fallbackHostCredentials.hostToken ?? null,
            installationPublicId:
              fallbackHostCredentials.installationPublicId ??
              activeProfile?.installationPublicId ??
              installationPublicId,
            userId: activeProfile?.id ?? null,
          });

          if (cancelled) {
            return;
          }

          if (hostResumeAccess.canProceed && hostResumeAccess.verified !== false) {
            clearGameSessionCredentials(roomCode, 'player');
            router.replace(buildRoleRoute('host'));
            return;
          }
        }

        const quiz = await fetchGameQuiz(roomCode, role);

        if (cancelled) {
          return;
        }

        if (quiz.status === 'cancelled') {
          clearCurrentSessionCredentials();
          showBlocked(buildBlockedStateFromCancelReason(quiz.cancel_reason));
          return;
        }

        const resumeAccess = await validateResumeEligibilityForRole(role, {
          participantId: currentCredentials?.participantId ?? null,
          participantToken: currentCredentials?.participantToken ?? null,
          hostToken: currentCredentials?.hostToken ?? null,
          installationPublicId:
            currentCredentials?.installationPublicId ??
            activeProfile?.installationPublicId ??
            installationPublicId,
          userId: activeProfile?.id ?? null,
        });

        if (cancelled) {
          return;
        }

        if (!resumeAccess.canProceed) {
          if (resumeAccess.cancelReason) {
            showBlocked(buildBlockedStateFromCancelReason(resumeAccess.cancelReason));
            return;
          }

          showBlocked(buildBlockedStateFromResumeReason(resumeAccess.reason));
          return;
        }

        setQuizTitle(quiz.title);
        syncQuestions(quiz.questions_data);
        setGameStatus(quiz.status);

        const socket = io(WEB_APP_ORIGIN, {
          transports: ['websocket'],
          forceNew: true,
          autoConnect: true,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          setIsConnected(true);
          const latestProfile = getMenuSessionProfile();
          const latestCredentials = getGameSessionCredentials(roomCode, role);
          const latestInstallationPublicId =
            latestProfile?.installationPublicId ??
            latestCredentials?.installationPublicId ??
            getOrCreateMenuInstallationPublicId();
          const latestFallbackHostCredentials =
            role === 'player'
              ? getGameSessionCredentials(roomCode, 'host')
              : null;

          socket.emit('join_room', {
            room: roomCode,
            name: playerNameRef.current,
            role,
            emoji: role === 'player' ? latestProfile?.emoji : undefined,
            user_id: latestProfile?.id ?? undefined,
            installation_public_id: latestInstallationPublicId,
            host_token:
              role === 'host'
                ? latestCredentials?.hostToken ?? undefined
                : latestFallbackHostCredentials?.hostToken ?? undefined,
            participant_token: role === 'player' ? latestCredentials?.participantToken ?? undefined : undefined,
            device: Platform.OS,
            browser: 'expo-native',
            browser_version: '1',
            device_model: Platform.OS,
          });

          socket.emit('request_sync', {
            room: roomCode,
            name: playerNameRef.current,
          });
        });

        socket.on('disconnect', () => {
          setIsConnected(false);
        });

        socket.on('session_credentials', (data: {
          role?: GameRole | null;
          participant_id?: string | null;
          participant_token?: string | null;
          host_token?: string | null;
          installation_public_id?: string | null;
        }) => {
          const resolvedRole =
            data.role === 'host' || (role !== 'host' && data.host_token)
              ? 'host'
              : role;
          const latestCredentials = getGameSessionCredentials(roomCode, resolvedRole);
          const resolvedInstallationPublicId =
            data.installation_public_id ??
            latestCredentials?.installationPublicId ??
            activeProfile?.installationPublicId ??
            installationPublicId;

          saveGameSessionCredentials({
            roomCode,
            role: resolvedRole,
            participantId: data.participant_id ?? null,
            participantToken: data.participant_token ?? null,
            hostToken: data.host_token ?? null,
            installationPublicId: resolvedInstallationPublicId,
          });

          if (resolvedRole !== role) {
            clearGameSessionCredentials(roomCode, role);
            disconnectSocket();
            router.replace(buildRoleRoute(resolvedRole));
            return;
          }

          void mergeMenuSessionProfileIdentity({
            id: activeProfile?.id ?? null,
            publicId: activeProfile?.publicId ?? null,
            installationPublicId: resolvedInstallationPublicId,
          });
        });

        socket.on('name_assigned', (data: { name?: string }) => {
          if (!data.name) {
            return;
          }

          setPlayerName(data.name);
          pushToast(`Твоё имя в комнате: ${data.name}`);
        });

        socket.on('update_players', (nextPlayers: GameLobbyPlayer[]) => {
          setPlayers(nextPlayers);
        });

        socket.on('game_started', (nextPlayers: GameLobbyPlayer[]) => {
          const me = nextPlayers.find((player) => player.name === playerNameRef.current);
          if (me?.emoji) {
            setMyEmoji(me.emoji);
          }

          questionShownAtRef.current = Date.now();
          setPlayers(nextPlayers);
          setGameStatus('playing');
          setCurrentQuestion(1);
          setRealGameQuestion(1);
          setMaxReachedQuestion(1);
          setPlayerViewQuestion(1);
          setMyAnswersHistory({});
          setStartIntroPlayers(nextPlayers.filter((player) => !player.is_host));
          emitGetUpdate();
        });

        socket.on('move_to_next', (data: { question: number }) => {
          const nextQuestion = data.question;
          questionShownAtRef.current = Date.now();
          setNextLocked(false);
          setCurrentQuestion(nextQuestion);
          setRealGameQuestion(nextQuestion);
          setPlayerViewQuestion(nextQuestion);
          setMaxReachedQuestion((current) => Math.max(current, nextQuestion));
        });

        socket.on('update_answers', (nextPlayers: GameLobbyPlayer[]) => {
          setPlayers(nextPlayers);
          setDisconnectedNames((current) => current.filter((name) => {
            const player = nextPlayers.find((item) => item.name === name);
            return player?.connected === false;
          }));
        });

        socket.on('answers_check_result', (data: { allAnswered?: boolean }) => {
          setNextLocked(false);
          if (data.allAnswered) {
            proceedToNextQuestion();
            return;
          }

          setConfirmVisible(true);
        });

        socket.on('init_disconnected', (data: { players?: string[] }) => {
          setDisconnectedNames(data.players ?? []);
        });

        socket.on('player_disconnected', (data: { name?: string; emoji?: string }) => {
          if (!data.name) {
            return;
          }

          setDisconnectedNames((current) => Array.from(new Set([...current, data.name ?? ''])));
          pushToast(`${data.emoji ?? '👤'} ${data.name} отключился`);
          emitGetUpdate();
        });

        socket.on('player_reconnected', (data: { name?: string; emoji?: string }) => {
          if (!data.name) {
            return;
          }

          setDisconnectedNames((current) => current.filter((item) => item !== data.name));
          pushToast(`${data.emoji ?? '👤'} ${data.name} вернулся`);
          emitGetUpdate();
        });

        socket.on('host_connection_state', (data: { hostOffline?: boolean }) => {
          if (role === 'host') {
            return;
          }

          setIsHostOffline(Boolean(data?.hostOffline));
        });

        socket.on('sync_state', (data: {
          currentQuestion: number;
          maxReachedQuestion?: number;
          status: GameStatus;
          playerAnswer?: string | null;
          answersHistory?: Record<string, string>;
          emoji?: string;
          questions?: GameQuestion[] | null;
          hostOffline?: boolean;
        }) => {
          setGameStatus(data.status);
          setCurrentQuestion(data.currentQuestion);
          setRealGameQuestion(data.currentQuestion);
          setPlayerViewQuestion(data.currentQuestion);
          setMaxReachedQuestion(data.maxReachedQuestion ?? data.currentQuestion);
          setIsHostOffline(role === 'host' ? false : Boolean(data.hostOffline));

          if (data.emoji) {
            setMyEmoji(data.emoji);
          }

          if (data.answersHistory) {
            setMyAnswersHistory(data.answersHistory);
          }

          if (data.questions?.length) {
            syncQuestions(data.questions);
          }

          if (data.status === 'playing') {
            questionShownAtRef.current = Date.now();
          }
        });

        socket.on('show_results', (data: GameResultsPayload) => {
          clearCurrentSessionCredentials();

          startTransition(() => {
            setResultsPayload(data);
            syncQuestions(data.questions);
            setGameStatus('finished');
            setReviewExpanded(false);

            const winners = getResultWinners(data.results);
            setWinnerIntroPlayers(winners.length ? winners : null);
          });

          disconnectSocket();
        });

        socket.on('room_full', () => showBlocked(buildBlockedState('room_full')));
        socket.on('game_already_started', () => showBlocked(buildBlockedState('game_started')));
        socket.on('host_already_connected', () => showBlocked(buildBlockedState('host_connected')));
        socket.on('player_kicked', () => {
          clearGameSessionCredentials(roomCode, 'player');
          showBlocked(buildBlockedState('player_kicked'));
        });
        socket.on('host_auth_failed', () => {
          clearGameSessionCredentials(roomCode, 'host');
          showBlocked(buildBlockedState('host_auth_failed'));
        });
        socket.on('resume_unavailable', (data: { reason?: string | null }) => {
          if (data?.reason !== 'already_connected') {
            clearCurrentSessionCredentials();
          }

          showBlocked(buildBlockedStateFromResumeReason(data?.reason));
        });
        socket.on('game_cancelled', (data: { reason?: string | null }) => {
          clearCurrentSessionCredentials();
          showBlocked(buildBlockedStateFromCancelReason(data?.reason));
        });
        socket.on('leave_confirmed', () => {
          clearCurrentSessionCredentials();
          disconnectSocket();
          setLeavePending(false);
          router.replace('/' as Href);
        });

        setIsBootstrapping(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const typedError = error instanceof Error ? error.message : '';
        if (typedError.includes('HTTP 404')) {
          showBlocked(buildBlockedState('not_found'));
          return;
        }

        showBlocked(buildBlockedState('network'));
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      disconnectSocket();
    };
  }, [role, roomCode]);

  const disconnectedNamesSet = useMemo(() => new Set(disconnectedNames), [disconnectedNames]);
  const currentPlayerQuestionData = questions[playerViewQuestion - 1];
  const currentHostQuestionData = questions[currentQuestion - 1];
  const hasAnsweredCurrentQuestion = Boolean(myAnswersHistory[String(playerViewQuestion)]);
  const hasAnsweredRealQuestion = Boolean(myAnswersHistory[String(realGameQuestion)]);

  return {
    answerDraft,
    answerInputError,
    blockedState,
    confirmVisible,
    currentHostQuestionData,
    currentPlayerQuestionData,
    currentQuestion,
    disconnectedNamesSet,
    gameStatus,
    handleAnswerDraftChange,
    handleBackToCreate,
    handleBackToMenu,
    handleCancelProceed,
    handleCancelLeaveGame,
    handleChangeScore,
    handleConfirmProceed,
    handleConfirmLeaveGame,
    handleCopyRoom,
    handleGoToCurrentQuestion,
    handleJumpToQuestion,
    handleKickPlayer,
    handleLeaveGame,
    handleNextQuestion,
    handlePlayerNavBack,
    handlePlayerNavForward,
    handleSendOptionAnswer,
    handleSendTextAnswer,
    handleShareRoom,
    handleStartGame,
    hasAnsweredCurrentQuestion,
    hasAnsweredRealQuestion,
    hostNoPlayersWarningVisible,
    isBootstrapping,
    isConnected,
    isHostOffline,
    leaveConfirmVisible,
    leavePending,
    maxReachedQuestion,
    myAnswersHistory,
    myEmoji,
    nextLocked,
    playerName,
    playerViewQuestion,
    players,
    questions,
    quizTitle,
    realGameQuestion,
    resultsPayload,
    reviewExpanded,
    roomCode,
    role,
    setConfirmVisible,
    setHostNoPlayersWarningVisible,
    setReviewExpanded,
    setStartIntroPlayers,
    setWinnerIntroPlayers,
    startIntroPlayers,
    toasts,
    winnerIntroPlayers,
  };
}
