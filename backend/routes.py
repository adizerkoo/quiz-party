"""
HTTP-маршруты FastAPI.

Отдача статики, health-check, создание и получение викторин.
"""

import string
import logging
import secrets
from pathlib import Path
from datetime import datetime, UTC
from fastapi import Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from . import models, schemas, database
from .cache import cache_quiz
from .config import FRONTEND_PATH, DATA_PATH, PLAYER_EMOJIS
from .security import sanitize_text, validate_player_name

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


def _utc_now():
    return datetime.now(UTC).replace(tzinfo=None)


def _clean_username(username: str) -> str:
    cleaned = sanitize_text(username).strip()
    if not validate_player_name(cleaned):
        raise HTTPException(status_code=422, detail="Invalid username")
    return cleaned


def _clean_optional_text(value, max_length: int) -> str | None:
    if value is None:
        return None
    cleaned = sanitize_text(str(value)).strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


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
        if quiz_data.owner_id is not None:
            owner_exists = db.query(models.User.id).filter(models.User.id == quiz_data.owner_id).first()
            if not owner_exists:
                raise HTTPException(status_code=422, detail="Invalid owner_id")
        logger.info("Creating quiz  title=%r  code=%s  questions=%d", quiz_data.title, code, len(quiz_data.questions))
        try:
            new_quiz = models.Quiz(
                title=quiz_data.title,
                code=code,
                questions_data=[q.model_dump() for q in quiz_data.questions],
                total_questions=len(quiz_data.questions),
                status="waiting",
                owner_id=quiz_data.owner_id,
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

    @app.post("/api/v1/users", response_model=schemas.UserResponse)
    def create_user(user_data: schemas.UserCreate, db: Session = Depends(database.get_db)):
        username = _clean_username(user_data.username)
        new_user = models.User(
            username=username,
            avatar_emoji=user_data.avatar_emoji,
            device_platform=_clean_optional_text(user_data.device_platform, 20),
            device_brand=_clean_optional_text(user_data.device_brand, 50),
            created_at=_utc_now(),
            last_login_at=_utc_now(),
        )
        try:
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
        except IntegrityError as exc:
            db.rollback()
            logger.warning("User profile create conflict  username=%s", username, exc_info=True)
            raise HTTPException(status_code=409, detail="User profile could not be saved") from exc
        logger.info("User profile created  id=%s  username=%s", new_user.id, new_user.username)
        return new_user

    @app.get("/api/v1/users/meta")
    def get_users_meta():
        return {"avatar_emojis": PLAYER_EMOJIS}

    @app.get("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def get_user(user_id: int, db: Session = Depends(database.get_db)):
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @app.put("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def update_user(user_id: int, user_data: schemas.UserUpdate, db: Session = Depends(database.get_db)):
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.username = _clean_username(user_data.username)
        user.avatar_emoji = user_data.avatar_emoji
        user.device_platform = _clean_optional_text(user_data.device_platform, 20)
        user.device_brand = _clean_optional_text(user_data.device_brand, 50)

        try:
            db.commit()
            db.refresh(user)
        except IntegrityError as exc:
            db.rollback()
            logger.warning("User profile update conflict  id=%s  username=%s", user_id, user.username, exc_info=True)
            raise HTTPException(status_code=409, detail="User profile could not be updated") from exc
        logger.info("User profile updated  id=%s  username=%s", user.id, user.username)
        return user

    @app.post("/api/v1/users/{user_id}/touch", response_model=schemas.UserResponse)
    def touch_user(user_id: int, touch_data: schemas.UserTouch, db: Session = Depends(database.get_db)):
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.last_login_at = _utc_now()
        if touch_data.device_platform is not None:
            user.device_platform = _clean_optional_text(touch_data.device_platform, 20)
        if touch_data.device_brand is not None:
            user.device_brand = _clean_optional_text(touch_data.device_brand, 50)

        db.commit()
        db.refresh(user)
        logger.info("User profile touched  id=%s", user.id)
        return user

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
