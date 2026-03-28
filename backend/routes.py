"""HTTP routes for the Quiz Party backend."""

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
from .logging_config import build_log_extra, log_event, log_game_event
from .security import sanitize_text, validate_player_name
from .services import (
    DevicePayload,
    build_quiz_results_response,
    create_quiz_session,
    ensure_installation,
    evaluate_quiz_state,
    evaluate_resume_eligibility,
    list_user_history,
    load_quiz_graph,
    serialize_quiz_questions,
)


logger = logging.getLogger(__name__)


def _generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    """Generates a unique room code in the PARTY-XXXXX format."""
    for _ in range(max_attempts):
        suffix = "".join(
            secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5)
        )
        code = f"PARTY-{suffix}"
        exists = db.query(models.Quiz.id).filter(models.Quiz.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=503, detail="Could not generate unique room code")


def _utc_now():
    """Returns the current UTC time without tzinfo for naive DateTime columns."""
    return datetime.now(UTC).replace(tzinfo=None)


def _clean_username(username: str) -> str:
    """Sanitises and validates a username for the profile API."""
    cleaned = sanitize_text(username).strip()
    if not validate_player_name(cleaned):
        raise HTTPException(status_code=422, detail="Invalid username")
    return cleaned


def _clean_optional_text(value, max_length: int) -> str | None:
    """Sanitises optional free text and trims it to a safe max length."""
    if value is None:
        return None
    cleaned = sanitize_text(str(value)).strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


def register_routes(app):
    """Registers all HTTP routes for the backend application."""

    @app.get("/")
    async def read_index():
        """Serves the main web client HTML page."""
        return FileResponse(Path(FRONTEND_PATH) / "index.html")

    @app.get("/api/health")
    async def health(db: Session = Depends(database.get_db)):
        """Checks backend liveness and database connectivity."""
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ok"}
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "http.health.failed",
                "Health check failed because the database is unavailable",
                exc_info=True,
            )
            raise HTTPException(status_code=503, detail="Database unavailable")

    app.mount("/data", StaticFiles(directory=str(DATA_PATH)), name="data")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

    @app.post("/api/v1/quizzes", response_model=schemas.QuizResponse)
    def create_quiz(quiz_data: schemas.QuizCreate, db: Session = Depends(database.get_db)):
        """Creates a new quiz template and its first game session."""
        code = _generate_unique_code(db)
        owner = None
        if quiz_data.owner_id is not None:
            owner = db.query(models.User).filter(models.User.id == quiz_data.owner_id).first()
            if not owner:
                raise HTTPException(status_code=422, detail="Invalid owner_id")

        log_event(
            logger,
            logging.INFO,
            "quiz.create.started",
            "Quiz creation started",
            room=code,
            title=quiz_data.title,
            questions=len(quiz_data.questions),
            owner_id=quiz_data.owner_id,
        )
        try:
            quiz, host_token = create_quiz_session(
                db,
                title=quiz_data.title,
                code=code,
                owner=owner,
                questions_payload=[question.model_dump() for question in quiz_data.questions],
            )
            db.commit()
            db.refresh(quiz)
            cache_quiz(code, quiz.id, quiz.questions_data, quiz.total_questions)
            log_game_event(
                logger,
                logging.INFO,
                "quiz.create.completed",
                "Quiz created",
                **build_log_extra(quiz=quiz),
                template_public_id=quiz.template_public_id,
            )
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
            log_event(
                logger,
                logging.ERROR,
                "quiz.create.failed",
                "Quiz creation failed",
                room=code,
                title=quiz_data.title,
                exc_info=True,
            )
            raise

    @app.post("/api/v1/users", response_model=schemas.UserResponse)
    def create_user(user_data: schemas.UserCreate, db: Session = Depends(database.get_db)):
        """Creates a user profile and optionally links an installation record."""
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
            log_event(
                logger,
                logging.WARNING,
                "user.create.conflict",
                "User profile creation hit a uniqueness conflict",
                username=username,
                exc_info=True,
            )
            raise HTTPException(status_code=409, detail="User profile could not be saved") from exc
        log_event(
            logger,
            logging.INFO,
            "user.create.completed",
            "User profile created",
            user_id=user.id,
            username=user.username,
        )
        return user

    @app.get("/api/v1/users/meta")
    def get_users_meta():
        """Returns UI metadata for the user profile screen."""
        return {"avatar_emojis": PLAYER_EMOJIS}

    @app.get("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def get_user(user_id: int, db: Session = Depends(database.get_db)):
        """Returns a user profile by internal id."""
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @app.get("/api/v1/users/{user_id}/history", response_model=list[schemas.UserHistoryEntry])
    def get_user_history(user_id: int, db: Session = Depends(database.get_db)):
        """Returns the user's finished/cancelled game history for the profile UI."""
        user = db.query(models.User.id).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return list_user_history(db, user_id=user_id)

    @app.put("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def update_user(user_id: int, user_data: schemas.UserUpdate, db: Session = Depends(database.get_db)):
        """Updates the user profile without changing its identity."""
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
            log_event(
                logger,
                logging.WARNING,
                "user.update.conflict",
                "User profile update hit a uniqueness conflict",
                user_id=user_id,
                username=user.username,
                exc_info=True,
            )
            raise HTTPException(status_code=409, detail="User profile could not be updated") from exc

        log_event(
            logger,
            logging.INFO,
            "user.update.completed",
            "User profile updated",
            user_id=user.id,
            username=user.username,
        )
        return user

    @app.post("/api/v1/users/{user_id}/touch", response_model=schemas.UserResponse)
    def touch_user(user_id: int, touch_data: schemas.UserTouch, db: Session = Depends(database.get_db)):
        """Updates last_login_at and binds the current installation to the user."""
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
        log_event(
            logger,
            logging.INFO,
            "user.touch.completed",
            "User profile touched",
            user_id=user.id,
        )
        return user

    @app.get("/api/v1/quizzes/{code}")
    def get_quiz(code: str, role: str = Query(default=None), db: Session = Depends(database.get_db)):
        """Returns the current game session in a client-compatible format."""
        quiz = get_quiz_by_code(db, code)
        if not quiz:
            log_event(
                logger,
                logging.WARNING,
                "quiz.fetch.not_found",
                "Quiz was not found",
                room=code,
            )
            raise HTTPException(status_code=404, detail="The quiz was not found")

        state = evaluate_quiz_state(db, quiz=quiz)
        if state.just_cancelled:
            db.commit()
            db.refresh(quiz)

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
            "last_activity_at": quiz.last_activity_at,
            "cancelled_at": quiz.cancelled_at,
            "cancel_reason": quiz.cancel_reason,
        }

    @app.get("/api/v1/quizzes/{code}/results", response_model=schemas.QuizResultsResponse)
    def get_quiz_results(code: str, db: Session = Depends(database.get_db)):
        """Returns final results for a finished game session."""
        quiz = (
            load_quiz_graph(db.query(models.Quiz))
            .filter(models.Quiz.code == code)
            .first()
        )
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        state = evaluate_quiz_state(db, quiz=quiz)
        if state.just_cancelled:
            db.commit()
            db.refresh(quiz)
        if quiz.status != "finished":
            raise HTTPException(status_code=400, detail="Quiz is not finished yet")
        return build_quiz_results_response(quiz)

    @app.post("/api/v1/resume/check", response_model=schemas.ResumeCheckResponse)
    def check_resume(payload: schemas.ResumeCheckRequest, db: Session = Depends(database.get_db)):
        """Validates saved local session credentials and returns at most one resumable game."""
        sessions: list[schemas.ResumeSessionStatus] = []

        for candidate in payload.sessions:
            normalized_room_code = candidate.room_code.strip().upper()
            quiz = get_quiz_by_code(db, normalized_room_code)
            eligibility = evaluate_resume_eligibility(
                db,
                quiz=quiz,
                role=candidate.role,
                host_token=candidate.host_token,
                participant_public_id=candidate.participant_id,
                participant_token=candidate.participant_token,
                user_id=payload.user_id,
                installation_public_id=candidate.installation_public_id or payload.installation_public_id,
            )
            room_code = eligibility.room_code or normalized_room_code
            sessions.append(
                schemas.ResumeSessionStatus(
                    room_code=room_code,
                    role=candidate.role,
                    title=eligibility.title,
                    status=eligibility.status,
                    can_resume=eligibility.can_resume,
                    reason=eligibility.reason,
                    cancel_reason=eligibility.cancel_reason,
                    clear_credentials=eligibility.clear_credentials,
                )
            )

        db.commit()

        resume_game = next((item for item in sessions if item.can_resume), None)
        return schemas.ResumeCheckResponse(
            has_resume_game=resume_game is not None,
            resume_game=resume_game,
            sessions=sessions,
        )
