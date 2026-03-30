"""Socket.IO handlers for state synchronisation and lightweight updates."""

from __future__ import annotations

import logging

from .. import database
from ..helpers import get_player_by_sid, get_players_in_quiz, get_quiz_by_code
from ..logging_config import build_log_extra, log_event, logged_socket_handler
from ..runtime_state import connection_registry
from ..security import rate_limiter, validate_quiz_code
from ..contexts.resume import (
    build_game_cancelled_payload,
    evaluate_quiz_state,
)


logger = logging.getLogger(__name__)


def register_sync_handlers(sio_manager):
    """Registers Socket.IO handlers that resynchronise client state."""

    async def _emit_game_cancelled(target_sid: str, quiz):
        await sio_manager.emit("game_cancelled", build_game_cancelled_payload(quiz), room=target_sid)

    @logged_socket_handler(sio_manager, "request_sync", logger)
    async def handle_sync(sid, data):
        """Returns the latest game state after join or reconnect."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.request_sync.rate_limited",
                "request_sync rejected by rate limiter",
                sid=sid,
            )
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.request_sync.quiz_missing",
                    "request_sync ignored because the quiz does not exist",
                    room=room,
                    sid=sid,
                )
                return
            state = evaluate_quiz_state(db, quiz=quiz)
            if state.cancelled:
                if state.just_cancelled:
                    db.commit()
                await _emit_game_cancelled(sid, quiz)
                return

            participant = get_player_by_sid(db, sid)
            if participant is None or participant.quiz_id != quiz.id:
                log_event(
                    logger,
                    logging.INFO,
                    "socket.request_sync.ignored",
                    "request_sync ignored because sender has no active participant in the room",
                    room=room,
                    sid=sid,
                )
                return
            if participant.status == "kicked":
                await sio_manager.emit("player_kicked", {}, room=sid)
                log_event(
                    logger,
                    logging.INFO,
                    "socket.request_sync.kicked",
                    "request_sync blocked because participant is kicked",
                    **build_log_extra(quiz=quiz, participant=participant, sid=sid),
                )
                return
            if participant.status == "left":
                await sio_manager.emit("resume_unavailable", {"reason": "participant_left"}, room=sid)
                return

            is_finished = quiz.status == "finished"
            log_event(
                logger,
                logging.INFO,
                "socket.request_sync.completed",
                "Sync payload sent",
                **build_log_extra(quiz=quiz, participant=participant, sid=sid, question=quiz.current_question),
                status=quiz.status,
            )

            answers_history = participant.answers_history if participant else {}
            current_answer = answers_history.get(str(quiz.current_question))
            host_participant = next(
                (
                    item
                    for item in quiz.players
                    if item.is_host and item.status != "kicked"
                ),
                None,
            )
            # Для player UI отдаём текущее состояние подключения хоста,
            # чтобы баннер корректно восстанавливался после refresh/reconnect.
            host_offline = bool(
                host_participant is not None
                and not connection_registry.is_connected(host_participant.id)
            )
            await sio_manager.emit(
                "sync_state",
                {
                    "currentQuestion": quiz.current_question,
                    "maxReachedQuestion": quiz.current_question,
                    "status": quiz.status,
                    "started_at": str(quiz.started_at) if quiz.started_at else None,
                    "finished_at": str(quiz.finished_at) if quiz.finished_at else None,
                    "questions": None,
                    "playerAnswer": current_answer,
                    "answersHistory": answers_history,
                    "hostOffline": host_offline,
                    "score": participant.score if participant else 0,
                    "emoji": participant.emoji if participant else "👤",
                },
                room=sid,
            )

            if is_finished:
                await sio_manager.emit(
                    "show_results",
                    {"code": quiz.code, "status": quiz.status},
                    room=sid,
                )
            elif quiz.status == "playing" and participant and participant.is_host:
                disconnected_names = [
                    item.name
                    for item in quiz.players
                    if not item.is_host
                    and item.status not in {"kicked", "left"}
                    and not connection_registry.is_connected(item.id)
                ]
                await sio_manager.emit("init_disconnected", {"players": disconnected_names}, room=sid)
                await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=sid)

    @logged_socket_handler(sio_manager, "get_update", logger)
    async def get_update(sid, room):
        """Returns just the latest answer list without the full sync payload."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.get_update.rate_limited",
                "get_update rejected by rate limiter",
                sid=sid,
            )
            return
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz:
                state = evaluate_quiz_state(db, quiz=quiz)
                if state.cancelled:
                    if state.just_cancelled:
                        db.commit()
                    await _emit_game_cancelled(sid, quiz)
                    return
                players = get_players_in_quiz(db, quiz.id)
                log_event(
                    logger,
                    logging.DEBUG,
                    "socket.get_update.completed",
                    "Incremental answer update sent",
                    **build_log_extra(quiz=quiz, sid=sid),
                    players=len(players),
                )
                await sio_manager.emit("update_answers", players, room=sid)
