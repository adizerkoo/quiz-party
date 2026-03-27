import {
  GameBlockedState,
  GameLobbyPlayer,
  GameQuestion,
  GameResultPlayer,
  HostAnswerCardState,
} from '@/features/game/types';

export function isAnswerCorrect(answer: string | null | undefined, correct: string | null | undefined) {
  if (!answer || !correct) {
    return false;
  }

  return answer.trim().toLowerCase() === correct.trim().toLowerCase();
}

export function getSortedLeaderboard(players: GameLobbyPlayer[]) {
  return [...players]
    .filter((player) => !player.is_host)
    .sort((left, right) => (right.score || 0) - (left.score || 0));
}

export function getResultWinners(results: GameResultPlayer[]) {
  if (!results.length) {
    return [];
  }

  const hasPersistedRanks = results.some((player) => typeof player.final_rank === 'number');
  if (hasPersistedRanks) {
    return results.filter((player) => player.final_rank === 1);
  }

  const maxScore = results[0]?.score ?? 0;
  if (maxScore <= 0) {
    return [];
  }

  return results.filter((player) => player.score === maxScore);
}

export function getResultOthers(results: GameResultPlayer[]) {
  const winners = getResultWinners(results);
  if (!winners.length) {
    return results;
  }

  const winnerNames = new Set(winners.map((player) => player.name));
  return results.filter((player) => !winnerNames.has(player.name));
}

export function pluralizePoints(count: number) {
  const abs = Math.abs(count) % 100;
  const lastDigit = abs % 10;

  if (abs >= 11 && abs <= 19) {
    return 'очков';
  }

  if (lastDigit === 1) {
    return 'очко';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'очка';
  }

  return 'очков';
}

export function getRankDisplay(rank: number) {
  if (rank === 1) {
    return '🥇';
  }

  if (rank === 2) {
    return '🥈';
  }

  if (rank === 3) {
    return '🥉';
  }

  return `#${rank}`;
}

export function buildBlockedState(
  type: 'room_full' | 'game_started' | 'host_connected' | 'host_auth_failed' | 'player_kicked' | 'missing_room' | 'missing_profile' | 'not_found' | 'network',
): GameBlockedState {
  switch (type) {
    case 'room_full':
      return {
        icon: '😱',
        title: 'Комната переполнена',
        subtitle: 'В этой комнате уже максимум игроков. Попробуй подключиться позже или создай свою игру.',
      };
    case 'game_started':
      return {
        icon: '🚫',
        title: 'Игра уже идёт',
        subtitle: 'К этой комнате уже нельзя подключиться. Вернись в меню и выбери другую игру.',
      };
    case 'host_connected':
      return {
        icon: '🧑‍🏫',
        title: 'Хост уже подключён',
        subtitle: 'Другой ведущий уже управляет этой игрой. Если это ты, закрой предыдущий экран и попробуй снова.',
      };
    case 'host_auth_failed':
      return {
        icon: '🔒',
        title: 'Доступ хоста не подтверждён',
        subtitle: 'Токен ведущего устарел или был потерян. Вернись в меню и открой комнату заново.',
      };
    case 'player_kicked':
      return {
        icon: '⛔',
        title: 'Вас исключили из комнаты',
        subtitle: 'Организатор удалил вас из этой игры. Вернитесь в меню и выберите другую комнату.',
      };
    case 'missing_room':
      return {
        icon: '🗝️',
        title: 'Код комнаты не передан',
        subtitle: 'Не удалось открыть игру без кода комнаты. Вернись в меню и зайди в комнату заново.',
      };
    case 'missing_profile':
      return {
        icon: '👤',
        title: 'Нужен профиль игрока',
        subtitle: 'Сначала создай профиль в меню, а потом заходи в комнату.',
      };
    case 'not_found':
      return {
        icon: '🛰️',
        title: 'Комната не найдена',
        subtitle: 'Проверь код комнаты и попробуй снова. Возможно, игру уже закрыли.',
      };
    case 'network':
    default:
      return {
        icon: '📡',
        title: 'Не удалось подключиться',
        subtitle: 'Проверь backend и интернет-соединение, затем попробуй открыть игру ещё раз.',
      };
  }
}

export function buildBlockedStateFromResumeReason(reason: string | null | undefined): GameBlockedState {
  switch (reason) {
    case 'participant_left':
      return {
        icon: '👋',
        title: 'Вы вышли из игры',
        subtitle: 'Вы уже покинули эту игру добровольно, поэтому вернуться в неё больше нельзя.',
      };
    case 'resume_window_expired':
      return {
        icon: '⏳',
        title: 'Вернуться уже нельзя',
        subtitle: 'В этой игре слишком давно не было активности. Для неё больше не показывается возврат.',
      };
    case 'already_connected':
      return {
        icon: '📱',
        title: 'Игра уже открыта',
        subtitle: 'Эта сессия уже активна на другом устройстве или в другом окне.',
      };
    case 'participant_kicked':
      return buildBlockedState('player_kicked');
    case 'host_auth_failed':
      return buildBlockedState('host_auth_failed');
    case 'finished':
      return {
        icon: '🏁',
        title: 'Игра уже завершена',
        subtitle: 'Эта игра больше не участвует в resume flow. Вернитесь в меню и откройте другую комнату.',
      };
    default:
      return {
        icon: '🚫',
        title: 'Вернуться не получилось',
        subtitle: 'Для этой игры сохранённые данные больше не подходят. Откройте другую комнату из меню.',
      };
  }
}

export function buildBlockedStateFromCancelReason(reason: string | null | undefined): GameBlockedState {
  if (reason === 'host_timeout') {
    return {
      icon: '🛑',
      title: 'Игра отменена',
      subtitle: 'Хост не вернулся вовремя, поэтому игра была автоматически отменена.',
    };
  }

  return {
    icon: '🧊',
    title: 'Игра отменена',
    subtitle: 'В игре слишком долго не было активности, поэтому она была автоматически закрыта.',
  };
}

export function getHostAnswerCardState(params: {
  player: GameLobbyPlayer;
  question: GameQuestion | undefined;
  currentQuestion: number;
  realGameQuestion: number;
  disconnectedPlayerNames: Set<string>;
}): HostAnswerCardState {
  const { currentQuestion, disconnectedPlayerNames, player, question, realGameQuestion } = params;
  const answers = player.answers_history ?? {};
  const scores = player.scores_history ?? {};
  const stepKey = String(currentQuestion);
  const answerText = answers[stepKey];
  const questionScore = scores[stepKey];
  const isDisconnected = disconnectedPlayerNames.has(player.name);
  const isPastQuestion = currentQuestion < realGameQuestion;
  const isFutureQuestion = currentQuestion > realGameQuestion;
  const isAnswered = typeof answerText === 'string' && answerText.trim().length > 0;
  const showDisconnectedBadge = isDisconnected && !isPastQuestion && !isFutureQuestion;

  if (isFutureQuestion) {
    return {
      tone: 'future',
      answerText: 'Ещё не дошли',
      actionLabel: null,
      canAddPoint: false,
      canRemovePoint: false,
      showDisconnectedBadge: false,
    };
  }

  if (isDisconnected && !isAnswered) {
    if (!isPastQuestion) {
      return {
        tone: 'disconnected',
        answerText: 'Отключился',
        actionLabel: null,
        canAddPoint: false,
        canRemovePoint: false,
        showDisconnectedBadge,
      };
    }

    if (questionScore === 1) {
      return {
        tone: 'correct',
        answerText: 'Пропущено',
        actionLabel: 'Засчитано',
        canAddPoint: false,
        canRemovePoint: true,
        showDisconnectedBadge: false,
      };
    }

    return {
      tone: 'skipped',
      answerText: 'Пропущено',
      actionLabel: null,
      canAddPoint: true,
      canRemovePoint: false,
      showDisconnectedBadge: false,
    };
  }

  if (!isAnswered && isPastQuestion) {
    if (questionScore === 1) {
      return {
        tone: 'correct',
        answerText: 'Пропущено',
        actionLabel: 'Засчитано',
        canAddPoint: false,
        canRemovePoint: true,
        showDisconnectedBadge: false,
      };
    }

    return {
      tone: 'skipped',
      answerText: 'Пропущено',
      actionLabel: null,
      canAddPoint: true,
      canRemovePoint: false,
      showDisconnectedBadge: false,
    };
  }

  if (isAnswered) {
    const isCorrect = isAnswerCorrect(answerText, question?.correct);
    const currentStatus = questionScore !== undefined ? questionScore : isCorrect ? 1 : 0;

    if (currentStatus === 1) {
      return {
        tone: 'correct',
        answerText,
        actionLabel: isCorrect ? 'Верно' : 'Засчитано',
        canAddPoint: false,
        canRemovePoint: true,
        showDisconnectedBadge,
      };
    }

    return {
      tone: 'wrong',
      answerText,
      actionLabel: isCorrect ? 'Отклонено' : 'Не верно',
      canAddPoint: true,
      canRemovePoint: false,
      showDisconnectedBadge,
    };
  }

  return {
    tone: 'waiting',
    answerText: 'Ожидает ответа...',
    actionLabel: null,
    canAddPoint: false,
    canRemovePoint: false,
    showDisconnectedBadge,
  };
}
