"""
HTTP-маршруты FastAPI.

Отдача статики, health-check, создание и получение викторин.
"""

import string
import logging
import secrets
from pathlib import Path
from fastapi import Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from . import models, schemas, database
from .cache import cache_quiz
from .config import FRONTEND_PATH, DATA_PATH

logger = logging.getLogger(__name__)


def _generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    """Генерирует уникальный код комнаты (PARTY-XXXXX) с повтором при коллизии."""
    for _ in range(max_attempts):
        suffix = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5))
        code = f"PARTY-{suffix}"
        exists = db.query(models.Quiz.id).filter(models.Quiz.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=503, detail="Could not generate unique room code")


def register_routes(app):
    """Регистрирует все HTTP-маршруты на экземпляре FastAPI."""
    @app.get("/")
    async def read_index():
        """Отдаёт главную страницу (index.html)."""
        index_file = Path(FRONTEND_PATH) / "index.html"
        return FileResponse(index_file)

    @app.get("/api/health")
    async def health(db: Session = Depends(database.get_db)):
        """Проверка работоспособности сервера и подключения к БД."""
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ok"}
        except Exception:
            logger.error("Health check failed — database unavailable", exc_info=True)
            raise HTTPException(status_code=503, detail="Database unavailable")

    app.mount("/data", StaticFiles(directory=str(DATA_PATH)), name="data")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

    @app.post("/api/v1/quizzes", response_model=schemas.QuizResponse)
    def create_quiz(quiz_data: schemas.QuizCreate, db: Session = Depends(database.get_db)):
        """Создаёт новую викторину с уникальным кодом комнаты и сохраняет в БД."""
        code = _generate_unique_code(db)
        logger.info("Creating quiz  title=%r  code=%s  questions=%d", quiz_data.title, code, len(quiz_data.questions))
        try:
            new_quiz = models.Quiz(
                title=quiz_data.title,
                code=code,
                questions_data=[q.model_dump() for q in quiz_data.questions],
                total_questions=len(quiz_data.questions),
                status="waiting"
            )
            db.add(new_quiz)
            db.commit()
            db.refresh(new_quiz)
            cache_quiz(code, new_quiz.id, new_quiz.questions_data, new_quiz.total_questions)
            logger.info("Quiz created  id=%s  code=%s", new_quiz.id, code)
            return new_quiz
        except Exception as e:
            logger.error("Failed to create quiz  code=%s  error=%s", code, e, exc_info=True)
            db.rollback()
            raise

    @app.get("/api/v1/quizzes/{code}")
    def get_quiz(code: str, role: str = Query(default=None), db: Session = Depends(database.get_db)):
        """Возвращает данные викторины по коду. Для хоста включает правильные ответы."""
        quiz = db.query(models.Quiz).filter(models.Quiz.code == code).first()
        if not quiz:
            logger.warning("Quiz not found  code=%s", code)
            raise HTTPException(status_code=404, detail="The quiz was not found")
        logger.debug("Quiz fetched  code=%s  status=%s", code, quiz.status)

        if role == "host":
            questions = quiz.questions_data
        else:
            questions = [
                {k: v for k, v in q.items() if k != "correct"}
                for q in (quiz.questions_data or [])
            ]

        return {
            "id": quiz.id,
            "code": quiz.code,
            "title": quiz.title,
            "questions_data": questions,
            "total_questions": quiz.total_questions,
            "current_question": quiz.current_question,
            "status": quiz.status,
            "created_at": quiz.created_at,
            "started_at": quiz.started_at,
            "finished_at": quiz.finished_at,
            "winner_id": quiz.winner_id,
        }

    @app.get("/api/v1/quizzes/{code}/results")
    def get_quiz_results(code: str, db: Session = Depends(database.get_db)):
        """Возвращает результаты завершённой викторины."""
        quiz = db.query(models.Quiz).filter(models.Quiz.code == code).first()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        if quiz.status != "finished":
            raise HTTPException(status_code=400, detail="Quiz is not finished yet")

        players = db.query(models.Player).filter(
            models.Player.quiz_id == quiz.id,
            models.Player.is_host == False
        ).order_by(models.Player.score.desc()).all()

        return {
            "code": quiz.code,
            "title": quiz.title,
            "status": quiz.status,
            "started_at": quiz.started_at,
            "finished_at": quiz.finished_at,
            "total_questions": quiz.total_questions,
            "questions": quiz.questions_data,
            "results": [{
                "name": p.name,
                "score": p.score,
                "emoji": p.emoji,
                "answers": p.answers_history,
                "answer_times": p.answer_times or {},
            } for p in players],
        }
