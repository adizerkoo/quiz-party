"""HTTP API текущей игры с друзьями: сессии, resume, history и results."""

from __future__ import annotations

from datetime import UTC, datetime
import logging
import secrets
import string

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app import database
from backend.games.friends_game.cache import cache_quiz
from backend.app.logging_config import build_log_extra, log_event, log_game_event
from backend.games.friends_game import models, schemas
from backend.games.friends_game.repository import get_quiz_by_code
from backend.games.friends_game.results import build_quiz_results_response, list_user_history
from backend.games.friends_game.resume import evaluate_quiz_state, evaluate_resume_eligibility
from backend.games.friends_game.service import (
    create_quiz_session,
    load_quiz_graph,
    serialize_quiz_questions,
)
from backend.platform.identity.service import (
    AuthenticatedUserContext,
    ensure_authenticated_identity_matches,
    get_current_authenticated_user,
    get_optional_authenticated_user,
)


logger = logging.getLogger(__name__)


def _generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    """Генерирует уникальный room code в формате `PARTY-XXXXX`."""
    for _ in range(max_attempts):
        suffix = "".join(
            secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5)
        )
        code = f"PARTY-{suffix}"
        exists = db.query(models.Quiz.id).filter(models.Quiz.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=503, detail="Could not generate unique room code")


def register_friends_game_routes(app):
    """Регистрирует HTTP-маршруты текущей игры с друзьями."""

    @app.post("/api/v1/quizzes", response_model=schemas.QuizResponse)
    def create_quiz(
        quiz_data: schemas.QuizCreate,
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext | None = Depends(get_optional_authenticated_user),
    ):
        """Создаёт новый quiz template и первую игровую сессию."""
        code = _generate_unique_code(db)
        owner = None
        if quiz_data.owner_id is not None:
            if auth is None:
                raise HTTPException(status_code=401, detail="Session token is required")
            ensure_authenticated_identity_matches(auth, user_id=quiz_data.owner_id)
            owner = auth.user

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
            source_question_links = int((quiz.session_metadata or {}).get("source_question_links") or 0)
            log_event(
                logger,
                logging.INFO,
                "quiz.create.source_links",
                "Quiz created with reusable question links",
                room=quiz.code,
                quiz_code=quiz.code,
                user_id=getattr(owner, "id", None),
                template_public_id=quiz.template_public_id,
                source_question_links=source_question_links,
                origin_screen="create",
            )
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

    @app.get("/api/v1/users/{user_id}/history", response_model=list[schemas.UserHistoryEntry])
    def get_user_history(
        user_id: int,
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Возвращает finished/cancelled историю текущей игры для профиля пользователя."""
        ensure_authenticated_identity_matches(auth, user_id=user_id)
        return list_user_history(db, user_id=auth.user.id)

    @app.get("/api/v1/quizzes/{code}")
    def get_quiz(
        code: str,
        role: str = Query(default=None),
        db: Session = Depends(database.get_db),
    ):
        """Возвращает текущую игровую сессию в клиент-совместимом формате."""
        quiz = get_quiz_by_code(db, code)
        if not quiz:
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

    @app.get(
        "/api/v1/quizzes/{code}/results",
        response_model=schemas.QuizResultsResponse,
        response_model_exclude_unset=True,
    )
    def get_quiz_results(code: str, db: Session = Depends(database.get_db)):
        """Возвращает финальные результаты для завершённой игровой сессии."""
        quiz = load_quiz_graph(db.query(models.Quiz)).filter(models.Quiz.code == code).first()
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
        """Проверяет локально сохранённые credentials и ищет максимум одну resumable game."""
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

