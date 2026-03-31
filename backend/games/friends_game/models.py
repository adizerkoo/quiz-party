"""Модели домена текущей игры с друзьями в Quiz Party."""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import object_session, relationship

from backend.app.database import Base
from backend.games.friends_game.runtime_state import connection_registry
from backend.platform.content.models import QuizQuestion, QuizQuestionOption, QuizTemplate
from backend.shared.utils import generate_public_id, utc_now_naive

class Quiz(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (
        Index("ix_game_sessions_public_id", "public_id", unique=True),
        Index("ix_game_sessions_code", "code", unique=True),
        Index("ix_game_sessions_owner_created", "owner_id", "created_at"),
        Index("ix_game_sessions_status_activity", "status", "last_activity_at"),
        CheckConstraint("current_question >= 0", name="ck_game_sessions_current_question_non_negative"),
        CheckConstraint("total_questions >= 0", name="ck_game_sessions_total_questions_non_negative"),
        CheckConstraint(
            "status IN ('waiting', 'playing', 'finished', 'cancelled')",
            name="ck_game_sessions_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    code = Column(String(20), nullable=False)
    title = Column(String(100), nullable=False)
    template_id = Column(Integer, ForeignKey("quiz_templates.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), nullable=False, default="waiting")
    total_questions = Column(Integer, nullable=False, default=0)
    current_question = Column(Integer, nullable=False, default=0)
    host_secret_hash = Column(String(128), nullable=True)
    host_left_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancel_reason = Column(String(40), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)
    session_metadata = Column(JSON, nullable=False, default=dict)
    results_snapshot = Column(JSON, nullable=True)

    template = relationship("QuizTemplate", back_populates="sessions")
    owner = relationship("User", back_populates="owned_quizzes", foreign_keys=[owner_id])
    players = relationship(
        "Player",
        back_populates="quiz",
        cascade="all, delete-orphan",
        foreign_keys="Player.quiz_id",
        order_by="Player.joined_at",
    )
    score_adjustments = relationship("ScoreAdjustment", back_populates="quiz")
    session_events = relationship("SessionEvent", back_populates="quiz")

    def __init__(self, **kwargs):
        """РџРѕРґРґРµСЂР¶РёРІР°РµС‚ Рё РЅРѕРІСѓСЋ СЃС…РµРјСѓ, Рё legacy `questions_data` РїСЂРё СЃРѕР·РґР°РЅРёРё РјРѕРґРµР»Рё."""
        questions_data = kwargs.pop("questions_data", None)
        template = kwargs.pop("template", None)
        for key, value in kwargs.items():
            setattr(self, key, value)

        if template is not None:
            self.template = template
        elif self.template is None:
            self.template = QuizTemplate(
                title=self.title or "Quiz",
                total_questions=0,
            )

        if questions_data is not None:
            self._apply_questions_data(questions_data)
        elif self.total_questions is None:
            self.total_questions = len(self.questions)

    @property
    def template_public_id(self) -> str | None:
        """Р’РѕР·РІСЂР°С‰Р°РµС‚ РІРЅРµС€РЅРёР№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ С€Р°Р±Р»РѕРЅР°, РµСЃР»Рё РѕРЅ СѓР¶Рµ СЃРІСЏР·Р°РЅ СЃ СЃРµСЃСЃРёРµР№."""
        return self.template.public_id if self.template else None

    @property
    def questions(self) -> list[QuizQuestion]:
        """Р”Р°С‘С‚ РґРѕСЃС‚СѓРї Рє РІРѕРїСЂРѕСЃР°Рј С‡РµСЂРµР· С€Р°Р±Р»РѕРЅ, РєР°Рє Р±СѓРґС‚Рѕ РѕРЅРё РІРёСЃСЏС‚ РїСЂСЏРјРѕ РЅР° СЃРµСЃСЃРёРё."""
        return list(self.template.questions) if self.template else []

    @property
    def questions_data(self) -> list[dict]:
        """РЎРѕР±РёСЂР°РµС‚ legacy-РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµ РІРѕРїСЂРѕСЃРѕРІ РёР· РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹С… С‚Р°Р±Р»РёС†."""
        payload = []
        for question in self.questions:
            item = {
                "text": question.text,
                "type": question.kind,
                "correct": question.correct_answer_text,
            }
            options = [option.option_text for option in question.options] or None
            if options is not None:
                item["options"] = options
            payload.append(item)
        return payload

    @questions_data.setter
    def questions_data(self, value: list[dict] | None) -> None:
        """РџРѕР·РІРѕР»СЏРµС‚ СЃС‚Р°СЂРѕРјСѓ РєРѕРґСѓ РїСЂРёСЃРІР°РёРІР°С‚СЊ `questions_data` РєР°Рє СЂР°РЅСЊС€Рµ."""
        self._apply_questions_data(value or [])

    def _apply_questions_data(self, questions_data: list[dict]) -> None:
        """Р Р°Р·РІРѕСЂР°С‡РёРІР°РµС‚ legacy JSON-РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµ РІРѕРїСЂРѕСЃРѕРІ РІ РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹Рµ СЃС‚СЂРѕРєРё."""
        if self.template is None:
            self.template = QuizTemplate(
                title=self.title or "Quiz",
                total_questions=0,
            )
        self.template.title = self.title or self.template.title
        self.template.total_questions = len(questions_data)
        self.template.questions = []
        for index, raw_question in enumerate(questions_data, start=1):
            # РџРѕР·РёС†РёСЋ РІРѕРїСЂРѕСЃР° С„РёРєСЃРёСЂСѓРµРј СЏРІРЅРѕ, С‡С‚РѕР±С‹ РїРѕСЂСЏРґРѕРє Р±С‹Р» РґРµС‚РµСЂРјРёРЅРёСЂРѕРІР°РЅРЅС‹Рј.
            question = QuizQuestion(
                position=index,
                text=raw_question["text"],
                kind=raw_question["type"],
                correct_answer_text=raw_question["correct"],
                points=1,
            )
            for option_index, option_text in enumerate(raw_question.get("options") or [], start=1):
                question.options.append(
                    QuizQuestionOption(
                        position=option_index,
                        option_text=option_text,
                        is_correct=option_text.strip().lower() == raw_question["correct"].strip().lower(),
                    )
                )
            self.template.questions.append(question)
        self.total_questions = len(questions_data)


class Player(Base):
    __tablename__ = "session_participants"
    __table_args__ = (
        UniqueConstraint("quiz_id", "name", name="uq_session_participants_quiz_name"),
        Index("ix_session_participants_public_id", "public_id", unique=True),
        Index("ix_session_participants_quiz_role", "quiz_id", "role"),
        Index("ix_session_participants_quiz_final_rank", "quiz_id", "final_rank"),
        Index("ix_session_participants_user_quiz", "user_id", "quiz_id"),
        Index("ix_session_participants_installation_quiz", "installation_id", "quiz_id"),
        CheckConstraint("score >= 0", name="ck_session_participants_score_non_negative"),
        CheckConstraint(
            "final_rank IS NULL OR final_rank >= 1",
            name="ck_session_participants_final_rank_positive",
        ),
        CheckConstraint(
            "role IN ('host', 'player')",
            name="ck_session_participants_role",
        ),
        CheckConstraint(
            "status IN ('joined', 'disconnected', 'kicked', 'left', 'finished')",
            name="ck_session_participants_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    name = Column(String(40), nullable=False)
    role = Column(String(20), nullable=False, default="player")
    emoji = Column(String(16), nullable=True)
    score = Column(Integer, nullable=False, default=0)
    final_rank = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="joined")
    joined_at = Column(DateTime, nullable=False, default=utc_now_naive)
    last_seen_at = Column(DateTime, nullable=True)
    disconnected_at = Column(DateTime, nullable=True)
    kicked_at = Column(DateTime, nullable=True)
    left_at = Column(DateTime, nullable=True)
    reconnect_token_hash = Column(String(128), nullable=True)
    device = Column(String(20), nullable=True)
    browser = Column(String(40), nullable=True)
    browser_version = Column(String(20), nullable=True)
    device_model = Column(String(120), nullable=True)
    participant_metadata = Column(JSON, nullable=False, default=dict)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    installation_id = Column(Integer, ForeignKey("user_installations.id"), nullable=True)
    quiz_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)

    quiz = relationship("Quiz", back_populates="players", foreign_keys=[quiz_id])
    user = relationship("User", back_populates="players", foreign_keys=[user_id])
    installation = relationship("UserInstallation", back_populates="players", foreign_keys=[installation_id])
    answers = relationship(
        "ParticipantAnswer",
        back_populates="participant",
        cascade="all, delete-orphan",
        order_by="ParticipantAnswer.question_position",
    )
    score_adjustments = relationship(
        "ScoreAdjustment",
        back_populates="participant",
        foreign_keys="ScoreAdjustment.participant_id",
    )
    created_adjustments = relationship(
        "ScoreAdjustment",
        back_populates="created_by",
        foreign_keys="ScoreAdjustment.created_by_participant_id",
    )
    session_events = relationship("SessionEvent", back_populates="participant")

    def __init__(self, **kwargs):
        """РџРѕРґРґРµСЂР¶РёРІР°РµС‚ legacy-РєРѕРЅСЃС‚СЂСѓРєС‚РѕСЂ СЃ `sid`, `is_host` Рё history-РїРѕР»СЏРјРё."""
        is_host = kwargs.pop("is_host", None)
        sid = kwargs.pop("sid", None)
        answers_history = kwargs.pop("answers_history", None)
        scores_history = kwargs.pop("scores_history", None)
        answer_times = kwargs.pop("answer_times", None)
        for key, value in kwargs.items():
            setattr(self, key, value)

        if is_host is not None:
            self.role = "host" if is_host else "player"
        self.sid = sid
        self._legacy_answers_history = dict(answers_history or {})
        self._legacy_scores_history = dict(scores_history or {})
        self._legacy_answer_times = dict(answer_times or {})

    @hybrid_property
    def is_host(self) -> bool:
        """РЎРѕРІРјРµСЃС‚РёРјС‹Р№ С„Р»Р°Рі С…РѕСЃС‚Р° РїРѕРІРµСЂС… РЅРѕРІРѕРіРѕ РїРѕР»СЏ `role`."""
        return self.role == "host"

    @is_host.expression
    def is_host(cls):
        """SQL-РІС‹СЂР°Р¶РµРЅРёРµ РґР»СЏ РІС‹Р±РѕСЂРѕРє РїРѕ СЂРѕР»Рё С…РѕСЃС‚Р°."""
        return cls.role == "host"

    @property
    def answers_history(self) -> dict[str, str]:
        """РЎРѕР±РёСЂР°РµС‚ legacy answers_history РёР· РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹С… answer records."""
        if not self.answers:
            return dict(getattr(self, "_legacy_answers_history", {}) or {})
        history: dict[str, str] = {}
        for answer in sorted(self.answers, key=lambda item: item.question_position):
            value = answer.answer_text
            if value is None and answer.selected_option is not None:
                value = answer.selected_option.option_text
            history[str(answer.question_position)] = value or ""
        return history

    @answers_history.setter
    def answers_history(self, value: dict[str, str] | None) -> None:
        """РџСЂРёРЅРёРјР°РµС‚ legacy answers_history Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚ РµРіРѕ РІ answer records."""
        self._legacy_answers_history = dict(value or {})
        self._sync_answers_from_legacy()

    @property
    def scores_history(self) -> dict[str, int]:
        """Р’РѕР·РІСЂР°С‰Р°РµС‚ legacy scores_history РЅР° Р±Р°Р·Рµ awarded_points РїРѕ РІРѕРїСЂРѕСЃР°Рј."""
        if not self.answers:
            return dict(getattr(self, "_legacy_scores_history", {}) or {})
        return {
            str(answer.question_position): int(answer.awarded_points or 0)
            for answer in sorted(self.answers, key=lambda item: item.question_position)
        }

    @scores_history.setter
    def scores_history(self, value: dict[str, int] | None) -> None:
        """РџСЂРёРЅРёРјР°РµС‚ legacy scores_history Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚ РµРіРѕ РІ answer records."""
        self._legacy_scores_history = dict(value or {})
        self._sync_answers_from_legacy()

    @property
    def answer_times(self) -> dict[str, float]:
        """Р’РѕР·РІСЂР°С‰Р°РµС‚ legacy answer_times РёР· РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹С… answer records."""
        if not self.answers:
            return dict(getattr(self, "_legacy_answer_times", {}) or {})
        return {
            str(answer.question_position): float(answer.answer_time_seconds)
            for answer in sorted(self.answers, key=lambda item: item.question_position)
            if answer.answer_time_seconds is not None
        }

    @answer_times.setter
    def answer_times(self, value: dict[str, float] | None) -> None:
        """РџСЂРёРЅРёРјР°РµС‚ legacy answer_times Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚ РµРіРѕ РІ answer records."""
        self._legacy_answer_times = dict(value or {})
        self._sync_answers_from_legacy()

    @property
    def sid(self) -> str | None:
        """РћС‚РґР°С‘С‚ Р°РєС‚РёРІРЅС‹Р№ sid РёР· runtime registry РёР»Рё transient fallback."""
        return getattr(self, "_sid", None) or connection_registry.get_sid(self.id)

    @sid.setter
    def sid(self, value: str | None) -> None:
        """РћР±РЅРѕРІР»СЏРµС‚ runtime-РїСЂРёРІСЏР·РєСѓ sid, РЅРµ С…СЂР°РЅСЏ РµРіРѕ РєР°Рє РїРѕСЃС‚РѕСЏРЅРЅРѕРµ РїРѕР»Рµ Р‘Р”."""
        current_sid = getattr(self, "_sid", None) or connection_registry.get_sid(self.id)
        if current_sid and current_sid != value:
            if connection_registry.get_sid(self.id) == current_sid:
                connection_registry.unbind_sid(current_sid)
        self._sid = value
        if value and self.id is not None and self.quiz_id is not None:
            if connection_registry.get_sid(self.id) != value:
                connection_registry.bind(value, self.id, self.quiz_id)

    def _sync_answers_from_legacy(self) -> None:
        """РџСЂРµРѕР±СЂР°Р·СѓРµС‚ legacy history-РїРѕР»СЏ РІ РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹Рµ participant_answers."""
        if self.quiz is None or not self.quiz.questions:
            return

        answers_map = dict(getattr(self, "_legacy_answers_history", {}) or {})
        scores_map = dict(getattr(self, "_legacy_scores_history", {}) or {})
        times_map = dict(getattr(self, "_legacy_answer_times", {}) or {})
        if not answers_map and not scores_map and not times_map:
            return

        questions_by_position = {question.position: question for question in self.quiz.questions}
        answer_by_position = {answer.question_position: answer for answer in self.answers}
        all_keys = set(answers_map) | set(scores_map) | set(times_map)

        for raw_position in all_keys:
            try:
                position = int(raw_position)
            except (TypeError, ValueError):
                continue

            question = questions_by_position.get(position)
            if question is None:
                continue

            answer = answer_by_position.get(position)
            if answer is None:
                # РЎРѕР·РґР°С‘Рј answer record Р»РµРЅРёРІРѕ С‚РѕР»СЊРєРѕ РґР»СЏ СЂРµР°Р»СЊРЅРѕ РІСЃС‚СЂРµС‡Р°СЋС‰РёС…СЃСЏ legacy РєР»СЋС‡РµР№.
                answer = ParticipantAnswer(
                    participant=self,
                    quiz_id=self.quiz_id,
                    question=question,
                    question_position=position,
                )
                session = object_session(self)
                if session is not None:
                    session.add(answer)
                answer_by_position[position] = answer

            if raw_position in answers_map:
                answer.answer_text = answers_map[raw_position]
                normalized_answer = (answer.answer_text or "").strip().lower()
                answer.selected_option = next(
                    (
                        option
                        for option in question.options
                        if option.option_text.strip().lower() == normalized_answer
                    ),
                    None,
                )

            if raw_position in times_map:
                try:
                    answer.answer_time_seconds = float(times_map[raw_position])
                except (TypeError, ValueError):
                    answer.answer_time_seconds = None

            if raw_position in scores_map:
                # Р•СЃР»Рё legacy score РїРµСЂРµРґР°РЅ СЏРІРЅРѕ, СЃС‡РёС‚Р°РµРј РµРіРѕ СЂСѓС‡РЅРѕР№ РѕС†РµРЅРєРѕР№.
                answer.awarded_points = int(scores_map[raw_position] or 0)
                answer.is_correct = answer.awarded_points > 0
                answer.evaluation_status = "manual"
            elif answer.answer_text is not None:
                # РРЅР°С‡Рµ РІРѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј СЃС‚Р°РЅРґР°СЂС‚РЅСѓСЋ Р°РІС‚РѕРїСЂРѕРІРµСЂРєСѓ РїРѕ correct_answer_text.
                answer.is_correct = answer.answer_text.strip().lower() == question.correct_answer_text.strip().lower()
                answer.awarded_points = question.points if answer.is_correct else 0
                answer.evaluation_status = "auto"

        self.score = sum(answer.awarded_points or 0 for answer in self.answers)


class ParticipantAnswer(Base):
    __tablename__ = "participant_answers"
    __table_args__ = (
        UniqueConstraint("participant_id", "question_id", name="uq_participant_answers_once"),
        Index("ix_participant_answers_public_id", "public_id", unique=True),
        Index("ix_participant_answers_quiz_question", "quiz_id", "question_id"),
        Index("ix_participant_answers_participant_question", "participant_id", "question_position"),
        CheckConstraint("question_position >= 1", name="ck_participant_answers_question_position_positive"),
        CheckConstraint("awarded_points >= 0", name="ck_participant_answers_awarded_points_non_negative"),
        CheckConstraint(
            "evaluation_status IN ('pending', 'auto', 'manual')",
            name="ck_participant_answers_evaluation_status",
        ),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    participant_id = Column(Integer, ForeignKey("session_participants.id"), nullable=False)
    quiz_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("quiz_questions.id"), nullable=False)
    selected_option_id = Column(Integer, ForeignKey("quiz_question_options.id"), nullable=True)
    question_position = Column(Integer, nullable=False)
    answer_text = Column(String(500), nullable=True)
    submitted_at = Column(DateTime, nullable=False, default=utc_now_naive)
    answer_time_seconds = Column(Float, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    awarded_points = Column(Integer, nullable=False, default=0)
    evaluation_status = Column(String(20), nullable=False, default="auto")
    answer_metadata = Column(JSON, nullable=False, default=dict)

    participant = relationship("Player", back_populates="answers")
    question = relationship("QuizQuestion", back_populates="answers")
    selected_option = relationship("QuizQuestionOption", back_populates="answers")
    score_adjustments = relationship("ScoreAdjustment", back_populates="answer")


class ScoreAdjustment(Base):
    __tablename__ = "score_adjustments"
    __table_args__ = (
        Index("ix_score_adjustments_public_id", "public_id", unique=True),
        Index("ix_score_adjustments_quiz_participant", "quiz_id", "participant_id"),
        Index("ix_score_adjustments_created_at", "created_at"),
        CheckConstraint(
            "adjustment_type IN ('override', 'bonus', 'penalty', 'migration')",
            name="ck_score_adjustments_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    quiz_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    participant_id = Column(Integer, ForeignKey("session_participants.id"), nullable=False)
    answer_id = Column(Integer, ForeignKey("participant_answers.id"), nullable=True)
    question_id = Column(Integer, ForeignKey("quiz_questions.id"), nullable=True)
    created_by_participant_id = Column(Integer, ForeignKey("session_participants.id"), nullable=True)
    adjustment_type = Column(String(20), nullable=False, default="override")
    points_delta = Column(Integer, nullable=False, default=0)
    reason_code = Column(String(40), nullable=True)
    reason_text = Column(String(200), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    adjustment_metadata = Column(JSON, nullable=False, default=dict)

    quiz = relationship("Quiz", back_populates="score_adjustments")
    participant = relationship("Player", back_populates="score_adjustments", foreign_keys=[participant_id])
    answer = relationship("ParticipantAnswer", back_populates="score_adjustments")
    question = relationship("QuizQuestion", back_populates="score_adjustments")
    created_by = relationship("Player", back_populates="created_adjustments", foreign_keys=[created_by_participant_id])


class SessionEvent(Base):
    __tablename__ = "session_events"
    __table_args__ = (
        Index("ix_session_events_public_id", "public_id", unique=True),
        Index("ix_session_events_quiz_type_at", "quiz_id", "event_type", "occurred_at"),
        Index("ix_session_events_participant_at", "participant_id", "occurred_at"),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    quiz_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    participant_id = Column(Integer, ForeignKey("session_participants.id"), nullable=True)
    installation_id = Column(Integer, ForeignKey("user_installations.id"), nullable=True)
    question_id = Column(Integer, ForeignKey("quiz_questions.id"), nullable=True)
    event_type = Column(String(40), nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=utc_now_naive)
    event_payload = Column(JSON, nullable=False, default=dict)

    quiz = relationship("Quiz", back_populates="session_events")
    participant = relationship("Player", back_populates="session_events")
    installation = relationship("UserInstallation", back_populates="session_events")
    question = relationship("QuizQuestion", back_populates="session_events")

