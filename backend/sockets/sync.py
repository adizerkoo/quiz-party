"""Socket.IO обработчики синхронизации состояния игры."""

from __future__ import annotations

import logging

from .. import database
from ..helpers import get_player_by_sid, get_players_in_quiz, get_quiz_by_code
from ..runtime_state import connection_registry
from ..security import rate_limiter, validate_quiz_code
from ..services import build_results_payload, serialize_quiz_questions, sort_result_players

logger = logging.getLogger(__name__)


def register_sync_handlers(sio_manager):
    """Регистрирует socket-события для state sync и выборочной подгрузки данных."""
    @sio_manager.on("request_sync")
    async def handle_sync(sid, data):
        """Возвращает клиенту актуальное состояние игры после join/reconnect."""
        if not rate_limiter.is_allowed(sid):
            logger.warning("Rate limit hit on request_sync  sid=%s", sid)
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz:
                logger.warning("Sync requested for missing quiz  room=%s  sid=%s", room, sid)
                return

            participant = get_player_by_sid(db, sid)
            if participant is None or participant.quiz_id != quiz.id:
                # Без валидного участника не шлём sync_state, иначе клиент может показать "фантомную" комнату.
                logger.info("Sync ignored for sid without active participant  room=%s  sid=%s", room, sid)
                return
            if participant.status == "kicked":
                await sio_manager.emit("player_kicked", {}, room=sid)
                logger.info("Sync blocked for kicked participant  room=%s  sid=%s", room, sid)
                return

            is_finished = quiz.status == "finished"
            logger.info(
                "Sync sent  name=%s  room=%s  status=%s  question=%s",
                participant.name if participant else "unknown",
                room,
                quiz.status,
                quiz.current_question,
            )

            answers_history = participant.answers_history if participant else {}
            current_answer = answers_history.get(str(quiz.current_question))
            await sio_manager.emit(
                "sync_state",
                {
                    "currentQuestion": quiz.current_question,
                    "maxReachedQuestion": quiz.current_question,
                    "status": quiz.status,
                    "started_at": str(quiz.started_at) if quiz.started_at else None,
                    "finished_at": str(quiz.finished_at) if quiz.finished_at else None,
                    "questions": serialize_quiz_questions(quiz, include_correct=True) if is_finished else None,
                    "playerAnswer": current_answer,
                    "answersHistory": answers_history,
                    "score": participant.score if participant else 0,
                    "emoji": participant.emoji if participant else "👤",
                },
                room=sid,
            )

            if is_finished:
                # Для finished-сессии сразу отдаём frozen leaderboard и все правильные ответы.
                players = sort_result_players(quiz.players)
                await sio_manager.emit(
                    "show_results",
                    {
                        "results": build_results_payload(players),
                        "questions": serialize_quiz_questions(quiz, include_correct=True),
                    },
                    room=sid,
                )
            elif quiz.status == "playing" and participant and participant.is_host:
                # Хосту во время игры дополнительно нужен список отключившихся и текущее состояние ответов.
                disconnected_names = [
                    item.name
                    for item in quiz.players
                    if not item.is_host
                    and item.status != "kicked"
                    and not connection_registry.is_connected(item.id)
                ]
                await sio_manager.emit("init_disconnected", {"players": disconnected_names}, room=sid)
                await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=sid)

    @sio_manager.on("get_update")
    async def get_update(sid, room):
        """Отправляет хосту актуальный список ответов без полного sync payload."""
        if not rate_limiter.is_allowed(sid):
            return
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz:
                players = get_players_in_quiz(db, quiz.id)
                logger.debug("get_update  room=%s  players=%d", room, len(players))
                await sio_manager.emit("update_answers", players, room=sid)
