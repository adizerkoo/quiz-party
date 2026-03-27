export type GameRole = 'host' | 'player';

export type GameStatus = 'waiting' | 'playing' | 'finished' | 'cancelled';

export type GameQuestionType = 'text' | 'options';

export type GameAnswersHistory = Record<string, string>;

export type GameScoresHistory = Record<string, number>;

export type GameAnswerTimes = Record<string, number>;

export type GameQuestion = {
  text: string;
  type: GameQuestionType;
  correct?: string;
  options?: string[];
};

export type GameQuizResponse = {
  id: number;
  code: string;
  title: string;
  questions_data: GameQuestion[];
  total_questions: number;
  current_question: number;
  status: GameStatus;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  last_activity_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
};

export type GameLobbyPlayer = {
  name: string;
  is_host: boolean;
  score: number;
  emoji?: string;
  answers_history?: GameAnswersHistory;
  scores_history?: GameScoresHistory;
  answer_times?: GameAnswerTimes;
  connected?: boolean;
};

export type GameResultPlayer = {
  name: string;
  score: number;
  final_rank?: number | null;
  emoji?: string;
  answers?: GameAnswersHistory;
};

export type GameResultsPayload = {
  results: GameResultPlayer[];
  questions: GameQuestion[];
};

export type GameBlockedState = {
  icon: string;
  title: string;
  subtitle: string;
};

export type GameResumeSessionStatus = {
  room_code: string;
  role: GameRole;
  title?: string | null;
  status?: GameStatus | null;
  can_resume: boolean;
  reason?: string | null;
  cancel_reason?: string | null;
  clear_credentials?: boolean;
};

export type GameResumeCheckResponse = {
  has_resume_game: boolean;
  resume_game?: GameResumeSessionStatus | null;
  sessions: GameResumeSessionStatus[];
};

export type GameToastItem = {
  id: string;
  message: string;
};

export type GameSyncState = {
  currentQuestion: number;
  maxReachedQuestion?: number;
  status: GameStatus;
  started_at?: string | null;
  finished_at?: string | null;
  questions?: GameQuestion[] | null;
  playerAnswer?: string | null;
  answersHistory?: GameAnswersHistory;
  score?: number;
  emoji?: string;
};

export type NativeGameRouteParams = {
  room?: string;
};

export type HostAnswerCardTone =
  | 'waiting'
  | 'correct'
  | 'wrong'
  | 'skipped'
  | 'disconnected'
  | 'future';

export type HostAnswerCardState = {
  tone: HostAnswerCardTone;
  answerText: string;
  actionLabel: string | null;
  canAddPoint: boolean;
  canRemovePoint: boolean;
  showDisconnectedBadge: boolean;
};
