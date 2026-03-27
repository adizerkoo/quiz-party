"""HTTP-маршруты FastAPI для Quiz Party."""

from __future__ import annotations

from datetime import UTC, datetime
import logging
from pathlib import Path
import secrets
import string

from fastapi import Depends, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import database, models, schemas
from .cache import cache_quiz
from .config import DATA_PATH, FRONTEND_PATH, PLAYER_EMOJIS
from .helpers import get_quiz_by_code
from .security import sanitize_text, validate_player_name
from .services import (
    DevicePayload,
    build_results_payload,
    create_quiz_session,
    ensure_installation,
    load_quiz_graph,
    serialize_quiz_questions,
    sort_result_players,
)

logger = logging.getLogger(__name__)


def _generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    """Генерирует уникальный код комнаты формата `PARTY-XXXXX`."""
    for _ in range(max_attempts):
        suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5))
        code = f"PARTY-{suffix}"
        exists = db.query(models.Quiz.id).filter(models.Quiz.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=503, detail="Could not generate unique room code")


def _utc_now():
    """Возвращает текущее UTC-время без tzinfo для naive DateTime колонок."""
    return datetime.now(UTC).replace(tzinfo=None)


def _clean_username(username: str) -> str:
    """Санитизирует и валидирует имя пользователя для профиля."""
    cleaned = sanitize_text(username).strip()
    if not validate_player_name(cleaned):
        raise HTTPException(status_code=422, detail="Invalid username")
    return cleaned


def _clean_optional_text(value, max_length: int) -> str | None:
    """Очищает опциональный текст и обрезает его до безопасной длины."""
    if value is None:
        return None
    cleaned = sanitize_text(str(value)).strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


def register_routes(app):
    """Регистрирует все HTTP-маршруты backend-приложения."""
    @app.get("/")
    async def read_index():
        """Отдаёт главную HTML-страницу web-клиента."""
        return FileResponse(Path(FRONTEND_PATH) / "index.html")

    @app.get("/api/health")
    async def health(db: Session = Depends(database.get_db)):
        """Проверяет доступность backend и соединения с БД."""
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
        """Создаёт новый шаблон квиза и первую игровую сессию."""
        code = _generate_unique_code(db)
        owner = None
        if quiz_data.owner_id is not None:
            owner = db.query(models.User).filter(models.User.id == quiz_data.owner_id).first()
            if not owner:
                raise HTTPException(status_code=422, detail="Invalid owner_id")

        logger.info("Creating quiz  title=%r  code=%s  questions=%d", quiz_data.title, code, len(quiz_data.questions))
        try:
            # Внутри одной транзакции создаём и template, и game session.
            quiz, host_token = create_quiz_session(
                db,
                title=quiz_data.title,
                code=code,
                owner=owner,
                questions_payload=[question.model_dump() for question in quiz_data.questions],
            )
            db.commit()
            db.refresh(quiz)
            # Кэшируем только после успешного commit, чтобы не держать "фантомную" сессию.
            cache_quiz(code, quiz.id, quiz.questions_data, quiz.total_questions)
            logger.info("Quiz created  id=%s  code=%s", quiz.id, code)
            return schemas.QuizResponse(
                id=quiz.id,
                public_id=quiz.public_id,
                template_public_id=quiz.template_public_id,
                code=quiz.code,
                title=quiz.title,
                status=quiz.status,
                created_at=quiz.created_at,
                started_at=quiz.started_at,
                finished_at=quiz.finished_at,
                host_token=host_token,
            )
        except Exception:
            db.rollback()
            logger.error("Failed to create quiz  code=%s", code, exc_info=True)
            raise

    @app.post("/api/v1/users", response_model=schemas.UserResponse)
    def create_user(user_data: schemas.UserCreate, db: Session = Depends(database.get_db)):
        """Создаёт профиль пользователя и при наличии данных связывает installation."""
        username = _clean_username(user_data.username)
        user = models.User(
            username=username,
            avatar_emoji=user_data.avatar_emoji,
            created_at=_utc_now(),
            updated_at=_utc_now(),
            last_login_at=_utc_now(),
        )
        try:
            db.add(user)
            ensure_installation(
                db,
                user=user,
                device=DevicePayload.from_api(
                    platform=_clean_optional_text(user_data.device_platform, 20),
                    brand=_clean_optional_text(user_data.device_brand, 50),
                    installation_public_id=user_data.installation_public_id,
                ),
            )
            db.commit()
            db.refresh(user)
        except IntegrityError as exc:
            db.rollback()
            logger.warning("User profile create conflict  username=%s", username, exc_info=True)
            raise HTTPException(status_code=409, detail="User profile could not be saved") from exc
        logger.info("User profile created  id=%s  username=%s", user.id, user.username)
        return user

    @app.get("/api/v1/users/meta")
    def get_users_meta():
        """Возвращает справочные данные для UI профиля пользователя."""
        return {"avatar_emojis": PLAYER_EMOJIS}

    @app.get("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def get_user(user_id: int, db: Session = Depends(database.get_db)):
        """Возвращает профиль пользователя по внутреннему id."""
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @app.put("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def update_user(user_id: int, user_data: schemas.UserUpdate, db: Session = Depends(database.get_db)):
        """Обновляет профиль пользователя без смены его identity."""
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.username = _clean_username(user_data.username)
        user.avatar_emoji = user_data.avatar_emoji
        user.updated_at = _utc_now()
        ensure_installation(
            db,
            user=user,
            device=DevicePayload.from_api(
                platform=_clean_optional_text(user_data.device_platform, 20),
                brand=_clean_optional_text(user_data.device_brand, 50),
                installation_public_id=user_data.installation_public_id,
            ),
        )

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
        """Обновляет last_login_at и связывает текущую установку с профилем."""
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.last_login_at = _utc_now()
        ensure_installation(
            db,
            user=user,
            device=DevicePayload.from_api(
                platform=_clean_optional_text(touch_data.device_platform, 20),
                brand=_clean_optional_text(touch_data.device_brand, 50),
                installation_public_id=touch_data.installation_public_id,
            ),
        )
        db.commit()
        db.refresh(user)
        logger.info("User profile touched  id=%s", user.id)
        return user

    @app.get("/api/v1/quizzes/{code}")
    def get_quiz(code: str, role: str = Query(default=None), db: Session = Depends(database.get_db)):
        """Возвращает текущую игровую сессию в совместимом с клиентами формате."""
        quiz = get_quiz_by_code(db, code)
        if not quiz:
            logger.warning("Quiz not found  code=%s", code)
            raise HTTPException(status_code=404, detail="The quiz was not found")

        # Только хосту выдаём правильные ответы до завершения игры.
        questions = serialize_quiz_questions(quiz, include_correct=(role == "host"))
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
        }

    @app.get("/api/v1/quizzes/{code}/results")
    def get_quiz_results(code: str, db: Session = Depends(database.get_db)):
        """Возвращает финальные результаты завершённой игровой сессии."""
        quiz = (
            load_quiz_graph(db.query(models.Quiz))
            .filter(models.Quiz.code == code)
            .first()
        )
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        if quiz.status != "finished":
            raise HTTPException(status_code=400, detail="Quiz is not finished yet")

        # Сортировка фиксирует leaderboard: сначала score, затем время входа и id.
        players = sort_result_players(quiz.players)

        return {
            "code": quiz.code,
            "title": quiz.title,
            "status": quiz.status,
            "started_at": quiz.started_at,
            "finished_at": quiz.finished_at,
            "total_questions": quiz.total_questions,
            "questions": serialize_quiz_questions(quiz, include_correct=True),
            "results": build_results_payload(players),
        }
