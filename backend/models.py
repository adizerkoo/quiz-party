from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class Quiz(Base):
    __tablename__ = "quizzes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)  # Название квиза (например, "ДР Макса")
    code = Column(String, unique=True, index=True) # Код комнаты для входа
    # Храним вопросы в формате JSON для простоты (или можно вынести в отдельную таблицу)
    questions_data = Column(JSON) 

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    score = Column(Integer, default=0)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"))