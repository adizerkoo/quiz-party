from sqlalchemy import Column, Enum, Integer, String, ForeignKey, JSON, Boolean, DateTime
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime


Base = declarative_base()

class Quiz(Base):
    __tablename__ = "quizzes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    code = Column(String, unique=True, index=True)
    questions_data = Column(JSON)
    current_question = Column(Integer, default=0)

    # 🆕 Новые поля
    status = Column(String, default="waiting")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    winner_id = Column(Integer, nullable=True)  # id победителя (Player.id)

    # Связь с игроками
    players = relationship("Player", back_populates="quiz", cascade="all, delete-orphan")

class Player(Base):
    __tablename__ = "players"
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
    quiz_id = Column(Integer, ForeignKey("quizzes.id"))
    quiz = relationship("Quiz", back_populates="players")