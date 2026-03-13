from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class Quiz(Base):
    __tablename__ = "quizzes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    code = Column(String, unique=True, index=True)
    questions_data = Column(JSON)
    
    # Связь с игроками
    players = relationship("Player", back_populates="quiz", cascade="all, delete-orphan")

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    sid = Column(String)
    last_answer = Column(String, nullable=True)
    score = Column(Integer, default=0)  # Поле для очков
    is_host = Column(Boolean, default=False)
    
    quiz_id = Column(Integer, ForeignKey("quizzes.id"))
    
    # ВОТ ЭТА СТРОКА БЫЛА ПРИЧИНОЙ ОШИБКИ (проверь её наличие)
    quiz = relationship("Quiz", back_populates="players")