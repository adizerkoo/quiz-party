"""
ORM-модели SQLAlchemy для Quiz Party.

Определяет таблицы quizzes и players, их связи и индексы.
"""

from sqlalchemy import Column, Enum, Index, Integer, String, ForeignKey, JSON, Boolean, DateTime
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, UTC


def _utc_now():
    """UTC-время без tzinfo для naive DateTime-колонок."""
    return datetime.now(UTC).replace(tzinfo=None)


Base = declarative_base()

class Quiz(Base):
    """Модель викторины. Хранит вопросы, статус игры и результаты."""
    __tablename__ = "quizzes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    code = Column(String, unique=True, index=True)
    questions_data = Column(JSON)
    total_questions = Column(Integer, default=0)
    current_question = Column(Integer, default=0)

    # 🆕 Новые поля
    status = Column(String, default="waiting")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    winner_id = Column(Integer, nullable=True)  # id победителя (Player.id)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=_utc_now)

    # Связь с игроками
    players = relationship("Player", back_populates="quiz", cascade="all, delete-orphan")
    owner = relationship("User", back_populates="owned_quizzes", foreign_keys=[owner_id])

class Player(Base):
    """Модель игрока. Привязан к викторине, хранит ответы, счёт и данные устройства."""
    __tablename__ = "players"
    __table_args__ = (
        Index("ix_players_quiz_id_name", "quiz_id", "name"),
    )
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    sid = Column(String)
    answers_history = Column(JSON, default=dict) 
    # Новое поле: { "0": 1, "1": -1, "2": 0 } - хранит баллы за каждый шаг
    scores_history = Column(JSON, default=dict) 
    emoji = Column(String, nullable=True)
    score = Column(Integer, default=0)
    is_host = Column(Boolean, default=False)
    device = Column(String, nullable=True)          # mobile / tablet / desktop
    browser = Column(String, nullable=True)         # Chrome / Firefox / Safari …
    browser_version = Column(String, nullable=True) # мажорная версия, напр. "124"
    device_model = Column(String, nullable=True)    # Samsung SM-G991B / Apple iPhone / unknown
    joined_at = Column(DateTime, default=_utc_now)
    answer_times = Column(JSON, default=dict)       # {"1": 3.2, "2": 1.5} — время ответа (сек)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"))
    quiz = relationship("Quiz", back_populates="players")
    user = relationship("User", back_populates="players", foreign_keys=[user_id])


class User(Base):
    """Persistent mobile user profile."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False)
    avatar_emoji = Column(String, nullable=False)
    device_platform = Column(String, nullable=True)
    device_brand = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utc_now, nullable=False)
    last_login_at = Column(DateTime, default=_utc_now, nullable=False)
    owned_quizzes = relationship("Quiz", back_populates="owner", foreign_keys="Quiz.owner_id")
    players = relationship("Player", back_populates="user", foreign_keys="Player.user_id")
