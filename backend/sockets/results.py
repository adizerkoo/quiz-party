"""Socket.IO handlers for game finalisation and result delivery."""

from __future__ import annotations

import datetime
import logging

from .. import database
from ..cache import invalidate_quiz
from ..helpers import get_player_by_sid, get_quiz_by_code, verify_host
from ..logging_config import build_log_extra, log_event, log_game_event, logged_socket_handler
from ..runtime_state import connection_registry
from ..security import validate_quiz_code
from ..services import (
    assign_final_ranks,
    build_game_cancelled_payload,
    build_results_snapshot_payload,
    evaluate_quiz_state,
    log_session_event,
    mark_quiz_activity,
    sort_result_players,
)


logger = logging.getLogger(__name__)


def register_results_handlers(sio_manager):
    """Registers Socket.IO handlers that close a game and publish results."""

    async def _emit_game_cancelled(room: str, quiz):
        await sio_manager.emit("game_cancelled", build_game_cancelled_payload(quiz), room=room)

    @logged_socket_handler(sio_manager, "finish_game_signal", logger)
    async def handle_finish(sid, data):
        """Finishes a game, freezes final ranks and broadcasts results."""
        room = data.get("room")
        if not validate_quiz_code(room):
            log_event(
                logger,
                logging.WARNING,
                "socket.finish_game_signal.invalid_room",
                "finish_game_signal ignored because room code is invalid",
                sid=sid,
                room=room,
            )
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if not quiz:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.finish_game_signal.quiz_missing",
                    "finish_game_signal ignored because the quiz does not exist",
                    room=room,
                    sid=sid,
                )
                return
            state = evaluate_quiz_state(db, quiz=quiz)
            if state.cancelled:
                if state.just_cancelled:
                    db.commit()
                await _emit_game_cancelled(room, quiz)
                return
            if not verify_host(db, quiz.id, sid):
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.finish_game_signal.host_required",
                    "finish_game_signal ignored because sender is not the host",
                    **build_log_extra(quiz=quiz, sid=sid),
                )
                return

            quiz.status = "finished"
            quiz.finished_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
            mark_quiz_activity(quiz, occurred_at=quiz.finished_at)

            players = sort_result_players(quiz.players)
            assign_final_ranks(players)

            for participant in quiz.players:
                if participant.status not in {"kicked", "left"}:
                    participant.status = "finished"
                    participant.last_seen_at = quiz.finished_at
                elif participant.role != "host":
                    participant.final_rank = None

            quiz.results_snapshot = build_results_snapshot_payload(quiz)
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="game_finished",
                payload={
                    "winner_ids": [
                        participant.id for participant in players if participant.final_rank == 1
                    ],
                },
            )
            db.commit()
            invalidate_quiz(room)

            winner_names = [
                participant.name for participant in players if participant.final_rank == 1
            ]
            log_game_event(
                logger,
                logging.INFO,
                "socket.finish_game_signal.completed",
                "Game finished and final results were published",
                **build_log_extra(quiz=quiz, participant=host, sid=sid),
                players=len(players),
                winners=winner_names,
            )
            await sio_manager.emit(
                "show_results",
                {"code": quiz.code, "status": quiz.status},
                room=room,
            )

            for target_sid in connection_registry.get_connected_sids(quiz.id):
                await sio_manager.disconnect(target_sid)
