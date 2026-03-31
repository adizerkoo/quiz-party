"""Сервисы bounded context `resume` и живого состояния игровой сессии."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.orm import Session

from backend.games.friends_game.runtime_state import connection_registry
from backend.games.friends_game import models
from backend.games.friends_game.service import log_session_event, verify_secret
from backend.shared.utils import utc_now_naive


RESUME_WINDOW = timedelta(minutes=10)
HOST_TIMEOUT = timedelta(minutes=15)
INACTIVITY_CANCEL_TIMEOUT = timedelta(minutes=30)


@dataclass(slots=True)
class QuizStateEvaluation:
    """РС‚РѕРі lazy-РїСЂРѕРІРµСЂРєРё timeout/cancel РїСЂР°РІРёР» РґР»СЏ РєРѕРЅРєСЂРµС‚РЅРѕР№ РёРіСЂС‹."""

    cancelled: bool
    cancel_reason: str | None
    just_cancelled: bool
    resume_window_expired: bool


@dataclass(slots=True)
class ResumeEligibility:
    """Результат проверки, можно ли ещё предлагать клиенту resume."""

    room_code: str
    role: str
    title: str | None
    status: str | None
    can_resume: bool
    reason: str | None = None
    cancel_reason: str | None = None
    clear_credentials: bool = False


def get_quiz_activity_at(quiz: models.Quiz):
    """Возвращает timestamp последнего значимого игрового действия."""
    return quiz.last_activity_at or quiz.started_at or quiz.created_at


def mark_quiz_activity(quiz: models.Quiz, *, occurred_at=None) -> None:
    """Фиксирует значимое игровое действие для inactivity/resume логики."""
    quiz.last_activity_at = occurred_at or utc_now_naive()


def is_participant_connected(participant: models.Player) -> bool:
    """Проверяет, считается ли участник активным для reconnect/resume логики."""
    return connection_registry.is_connected(participant.id) or bool(
        getattr(participant, "sid", None)
    )


def is_quiz_resume_window_expired(quiz: models.Quiz, *, now=None) -> bool:
    """Определяет, истёк ли allowed resume window для игры."""
    if quiz.status in {"finished", "cancelled"}:
        return True

    last_activity_at = get_quiz_activity_at(quiz)
    if last_activity_at is None:
        return False

    resolved_now = now or utc_now_naive()
    return resolved_now - last_activity_at > RESUME_WINDOW


def _find_host_participant(quiz: models.Quiz) -> models.Player | None:
    """Возвращает host-participant игры, если он есть и не был kicked."""
    return next(
        (
            participant
            for participant in quiz.players
            if participant.is_host and participant.status != "kicked"
        ),
        None,
    )


def cancel_quiz(
    db: Session,
    *,
    quiz: models.Quiz,
    reason: str,
    cancelled_at=None,
) -> bool:
    """Переводит игру в `cancelled` и пишет аналитическое событие ровно один раз."""
    cancelled_at = cancelled_at or utc_now_naive()
    just_cancelled = quiz.status != "cancelled"

    quiz.status = "cancelled"
    quiz.cancelled_at = quiz.cancelled_at or cancelled_at
    quiz.cancel_reason = reason

    if just_cancelled:
        from backend.games.friends_game.cache import invalidate_quiz

        invalidate_quiz(quiz.code)
        host_participant = _find_host_participant(quiz)
        event_type = {
            "host_timeout": "game_cancelled_host_timeout",
            "inactivity_timeout": "game_cancelled_inactivity",
        }.get(reason, "game_cancelled")
        log_session_event(
            db,
            quiz=quiz,
            participant=host_participant if reason == "host_timeout" else None,
            installation=(
                host_participant.installation
                if (reason == "host_timeout" and host_participant)
                else None
            ),
            event_type=event_type,
            payload={
                "cancel_reason": reason,
                "cancelled_at": (
                    quiz.cancelled_at.isoformat() if quiz.cancelled_at else None
                ),
            },
        )

    return just_cancelled


def evaluate_quiz_state(
    db: Session,
    *,
    quiz: models.Quiz,
    now=None,
) -> QuizStateEvaluation:
    """Лениво применяет timeout-правила к игре и возвращает итоговое состояние."""
    resolved_now = now or utc_now_naive()

    if quiz.status == "cancelled":
        if quiz.cancelled_at is None:
            quiz.cancelled_at = resolved_now
        return QuizStateEvaluation(
            cancelled=True,
            cancel_reason=quiz.cancel_reason,
            just_cancelled=False,
            resume_window_expired=True,
        )

    if quiz.status == "finished":
        return QuizStateEvaluation(
            cancelled=False,
            cancel_reason=None,
            just_cancelled=False,
            resume_window_expired=True,
        )

    host_participant = _find_host_participant(quiz)
    if (
        quiz.host_left_at is not None
        and resolved_now - quiz.host_left_at > HOST_TIMEOUT
        and not (host_participant and is_participant_connected(host_participant))
    ):
        just_cancelled = cancel_quiz(
            db,
            quiz=quiz,
            reason="host_timeout",
            cancelled_at=resolved_now,
        )
        return QuizStateEvaluation(
            cancelled=True,
            cancel_reason="host_timeout",
            just_cancelled=just_cancelled,
            resume_window_expired=True,
        )

    activity_at = get_quiz_activity_at(quiz)
    if activity_at is not None and resolved_now - activity_at > INACTIVITY_CANCEL_TIMEOUT:
        just_cancelled = cancel_quiz(
            db,
            quiz=quiz,
            reason="inactivity_timeout",
            cancelled_at=resolved_now,
        )
        return QuizStateEvaluation(
            cancelled=True,
            cancel_reason="inactivity_timeout",
            just_cancelled=just_cancelled,
            resume_window_expired=True,
        )

    return QuizStateEvaluation(
        cancelled=False,
        cancel_reason=None,
        just_cancelled=False,
        resume_window_expired=is_quiz_resume_window_expired(quiz, now=resolved_now),
    )


def build_game_cancelled_payload(quiz: models.Quiz) -> dict:
    """Строит единый payload для blocked/cancelled сценариев на клиентах."""
    return {
        "status": quiz.status,
        "reason": quiz.cancel_reason,
        "title": quiz.title,
        "cancelled_at": quiz.cancelled_at.isoformat() if quiz.cancelled_at else None,
    }


def _participant_matches_resume_identity(
    participant: models.Player,
    *,
    participant_token: str | None,
    user_id: int | None,
    installation_public_id: str | None,
) -> bool:
    """Сверяет resume credentials с конкретным участником."""
    if participant_token and verify_secret(participant_token, participant.reconnect_token_hash):
        return True
    if user_id is not None and participant.user_id == user_id:
        return True
    if (
        installation_public_id
        and participant.installation is not None
        and participant.installation.public_id == installation_public_id
    ):
        return True
    return False


def find_player_resume_candidate(
    quiz: models.Quiz,
    *,
    participant_public_id: str | None,
    participant_token: str | None,
    user_id: int | None,
    installation_public_id: str | None,
) -> models.Player | None:
    """Находит участника, для которого локальные credentials ещё могут быть валидны."""
    active_players = [participant for participant in quiz.players if not participant.is_host]

    if participant_public_id:
        participant = next(
            (item for item in active_players if item.public_id == participant_public_id),
            None,
        )
        if participant is not None and _participant_matches_resume_identity(
            participant,
            participant_token=participant_token,
            user_id=user_id,
            installation_public_id=installation_public_id,
        ):
            return participant

    if participant_token:
        for participant in active_players:
            if verify_secret(participant_token, participant.reconnect_token_hash):
                return participant

    if user_id is not None:
        participant = next((item for item in active_players if item.user_id == user_id), None)
        if participant is not None:
            return participant

    if installation_public_id:
        participant = next(
            (
                item
                for item in active_players
                if item.installation is not None
                and item.installation.public_id == installation_public_id
            ),
            None,
        )
        if participant is not None:
            return participant

    return None


def evaluate_resume_eligibility(
    db: Session,
    *,
    quiz: models.Quiz | None,
    role: str,
    host_token: str | None = None,
    participant_public_id: str | None = None,
    participant_token: str | None = None,
    user_id: int | None = None,
    installation_public_id: str | None = None,
    now=None,
) -> ResumeEligibility:
    """Проверяет, можно ли ещё предлагать клиенту resume для конкретной игры."""
    if quiz is None:
        return ResumeEligibility(
            room_code="",
            role=role,
            title=None,
            status=None,
            can_resume=False,
            reason="not_found",
            clear_credentials=True,
        )

    state = evaluate_quiz_state(db, quiz=quiz, now=now)

    def _suppressed(
        reason: str,
        *,
        participant: models.Player | None = None,
        clear_credentials: bool = True,
    ):
        log_session_event(
            db,
            quiz=quiz,
            participant=participant,
            installation=participant.installation if participant else None,
            event_type="resume_offer_suppressed",
            payload={"role": role, "reason": reason},
        )
        return ResumeEligibility(
            room_code=quiz.code,
            role=role,
            title=quiz.title,
            status=quiz.status,
            can_resume=False,
            reason=reason,
            cancel_reason=quiz.cancel_reason,
            clear_credentials=clear_credentials,
        )

    if quiz.status == "finished":
        return _suppressed("finished")
    if state.cancelled or quiz.status == "cancelled":
        return _suppressed(quiz.cancel_reason or "cancelled")
    if state.resume_window_expired:
        return _suppressed("resume_window_expired")

    if role == "host":
        host_participant = _find_host_participant(quiz)
        if not verify_secret(host_token, quiz.host_secret_hash):
            return _suppressed("host_auth_failed", participant=host_participant)
        if host_participant is not None and is_participant_connected(host_participant):
            return _suppressed(
                "already_connected",
                participant=host_participant,
                clear_credentials=False,
            )
        return ResumeEligibility(
            room_code=quiz.code,
            role=role,
            title=quiz.title,
            status=quiz.status,
            can_resume=True,
        )

    participant = find_player_resume_candidate(
        quiz,
        participant_public_id=participant_public_id,
        participant_token=participant_token,
        user_id=user_id,
        installation_public_id=installation_public_id,
    )
    if participant is None:
        return _suppressed("participant_missing")
    if participant.status == "left":
        return _suppressed("participant_left", participant=participant)
    if participant.status == "kicked":
        return _suppressed("participant_kicked", participant=participant)
    if participant.status == "finished":
        return _suppressed("finished", participant=participant)
    if is_participant_connected(participant):
        return _suppressed(
            "already_connected",
            participant=participant,
            clear_credentials=False,
        )

    return ResumeEligibility(
        room_code=quiz.code,
        role=role,
        title=quiz.title,
        status=quiz.status,
        can_resume=True,
    )


def mark_participant_left(participant: models.Player, *, left_at=None) -> None:
    """Переводит участника в `left` и убирает его из resume/reconnect-кандидатов."""
    resolved_left_at = left_at or utc_now_naive()
    participant.status = "left"
    participant.left_at = resolved_left_at
    participant.disconnected_at = resolved_left_at
    participant.last_seen_at = resolved_left_at
    participant.reconnect_token_hash = None
    participant.sid = None


__all__ = [
    "HOST_TIMEOUT",
    "INACTIVITY_CANCEL_TIMEOUT",
    "RESUME_WINDOW",
    "QuizStateEvaluation",
    "ResumeEligibility",
    "build_game_cancelled_payload",
    "cancel_quiz",
    "evaluate_quiz_state",
    "evaluate_resume_eligibility",
    "find_player_resume_candidate",
    "get_quiz_activity_at",
    "is_participant_connected",
    "is_quiz_resume_window_expired",
    "mark_participant_left",
    "mark_quiz_activity",
]

