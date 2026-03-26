import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Href, useRouter } from 'expo-router';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Share } from 'react-native';
import { io, Socket } from 'socket.io-client';

import { saveCreateDraft } from '@/features/create/services/create-storage';
import { createEmptyQuestionDraft } from '@/features/create/utils/create-validation';
import { getMenuSessionProfile } from '@/features/menu/store/menu-profile-session';
import { fetchGameQuiz, buildGameShareUrl } from '@/features/game/services/game-api';
import {
  GameBlockedState,
  GameLobbyPlayer,
  GameQuestion,
  GameResultsPayload,
  GameRole,
  GameStatus,
  GameToastItem,
} from '@/features/game/types';
import { buildBlockedState, getResultWinners } from '@/features/game/utils/game-view';
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
  const profile = getMenuSessionProfile();
  const socketRef = useRef<Socket | null>(null);
  const questionShownAtRef = useRef<number | null>(null);
  const playerNameRef = useRef(role === 'host' ? 'HOST' : profile?.name ?? 'Игрок');
  const realGameQuestionRef = useRef(0);
  const currentQuestionRef = useRef(0);
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
  const [myEmoji, setMyEmoji] = useState(profile?.emoji ?? '👤');
  const [resultsPayload, setResultsPayload] = useState<GameResultsPayload | null>(null);
  const [startIntroPlayers, setStartIntroPlayers] = useState<GameLobbyPlayer[] | null>(null);
  const [winnerIntroPlayers, setWinnerIntroPlayers] = useState(resultsPayload?.results ? getResultWinners(resultsPayload.results) : null);
  const [nextLocked, setNextLocked] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [toasts, setToasts] = useState<GameToastItem[]>([]);
  const [hostNoPlayersWarningVisible, setHostNoPlayersWarningVisible] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');
  const [answerInputError, setAnswerInputError] = useState(false);
  const [disconnectedNames, setDisconnectedNames] = useState<string[]>([]);

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

  function showBlocked(nextState: GameBlockedState) {
    disconnectSocket();
    setIsConnected(false);
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
    router.replace('/' as Href);
  }

  function emitGetUpdate() {
    socketRef.current?.emit('get_update', roomCode);
  }

  function proceedToNextQuestion() {
    setConfirmVisible(false);

    if (currentQuestionRef.current < questions.length) {
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

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!roomCode) {
        showBlocked(buildBlockedState('missing_room'));
        return;
      }

      if (role === 'player' && !profile) {
        showBlocked(buildBlockedState('missing_profile'));
        return;
      }

      setIsBootstrapping(true);
      setBlockedState(null);

      try {
        const quiz = await fetchGameQuiz(roomCode, role);

        if (cancelled) {
          return;
        }

        setQuizTitle(quiz.title);
        setQuestions(quiz.questions_data);
        setGameStatus(quiz.status);

        const socket = io(WEB_APP_ORIGIN, {
          transports: ['websocket'],
          forceNew: true,
          autoConnect: true,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          setIsConnected(true);

          socket.emit('join_room', {
            room: roomCode,
            name: role === 'host' ? 'HOST' : playerNameRef.current,
            role,
            emoji: role === 'player' ? profile?.emoji : undefined,
            user_id: profile?.id ?? undefined,
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

        socket.on('sync_state', (data: {
          currentQuestion: number;
          maxReachedQuestion?: number;
          status: GameStatus;
          playerAnswer?: string | null;
          answersHistory?: Record<string, string>;
          emoji?: string;
          questions?: GameQuestion[] | null;
        }) => {
          setGameStatus(data.status);
          setCurrentQuestion(data.currentQuestion);
          setRealGameQuestion(data.currentQuestion);
          setPlayerViewQuestion(data.currentQuestion);
          setMaxReachedQuestion(data.maxReachedQuestion ?? data.currentQuestion);

          if (data.emoji) {
            setMyEmoji(data.emoji);
          }

          if (data.answersHistory) {
            setMyAnswersHistory(data.answersHistory);
          }

          if (data.questions?.length) {
            setQuestions(data.questions);
          }

          if (data.status === 'playing') {
            questionShownAtRef.current = Date.now();
          }
        });

        socket.on('show_results', (data: GameResultsPayload) => {
          startTransition(() => {
            setResultsPayload(data);
            setQuestions(data.questions);
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
        socket.on('player_kicked', () => showBlocked(buildBlockedState('player_kicked')));

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
  }, [profile, role, roomCode]);

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
    handleChangeScore,
    handleConfirmProceed,
    handleCopyRoom,
    handleGoToCurrentQuestion,
    handleJumpToQuestion,
    handleKickPlayer,
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
