"""Socket.IO обработчики завершения игры и выдачи итоговых результатов."""

from __future__ import annotations

import datetime
import logging

from .. import database
from ..cache import invalidate_quiz
from ..helpers import get_player_by_sid, get_quiz_by_code, verify_host
from ..runtime_state import connection_registry
from ..security import validate_quiz_code
from ..services import (
    assign_final_ranks,
    build_results_payload,
    log_session_event,
    serialize_quiz_questions,
    sort_result_players,
)

logger = logging.getLogger(__name__)


def register_results_handlers(sio_manager):
    """Регистрирует socket-события, отвечающие за финализацию игровой сессии."""

    @sio_manager.on("finish_game_signal")
    async def handle_finish(sid, data):
        """Завершает игру, фиксирует итоговые ранги и рассылает финальные результаты."""
        room = data.get("room")
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if not quiz or not verify_host(db, quiz.id, sid):
                return

            quiz.status = "finished"
            quiz.finished_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

            # Итоговый leaderboard сортируем детерминированно, а победителей определяем
            # только через final_rank, без отдельного winner_id в game_sessions.
            players = sort_result_players(quiz.players)
            assign_final_ranks(players)

            for participant in quiz.players:
                # Даже отключившиеся участники попадают в финальный frozen state,
                # чтобы экран результатов можно было строить только из БД.
                if participant.status != "kicked":
                    participant.status = "finished"
                    participant.last_seen_at = quiz.finished_at
                elif participant.role != "host":
                    participant.final_rank = None

            results_payload = build_results_payload(players)
            quiz.results_snapshot = {
                "results": results_payload,
                "questions": serialize_quiz_questions(quiz, include_correct=True),
            }
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="game_finished",
                payload={
                    "winner_ids": [participant.id for participant in players if participant.final_rank == 1],
                },
            )
            db.commit()
            invalidate_quiz(room)

            logger.info(
                "Game finished  room=%s  quiz_id=%s  players=%d",
                room,
                quiz.id,
                len(players),
            )
            await sio_manager.emit(
                "show_results",
                {
                    "results": results_payload,
                    "questions": serialize_quiz_questions(quiz, include_correct=True),
                },
                room=room,
            )

            # После публикации итогов закрываем активные сокеты, чтобы клиенты
            # перешли в read-only режим и больше не держали игровое соединение.
            for target_sid in connection_registry.get_connected_sids(quiz.id):
                await sio_manager.disconnect(target_sid)
