"""
Socket.IO обработчики завершения игры.

Фиксирует результаты, определяет победителя, отправляет итоги
и отключает всех игроков для освобождения ресурсов.
"""

import datetime
import logging

from .. import models, database
from ..helpers import get_quiz_by_code, verify_host
from ..cache import invalidate_quiz
from ..security import validate_quiz_code

logger = logging.getLogger(__name__)


def register_results_handlers(sio_manager):
    """Регистрирует события завершения игры на Socket.IO менеджере."""

    @sio_manager.on('finish_game_signal')
    async def handle_finish(sid, data):
        """Завершает игру: сохраняет результаты, отправляет итоги, отключает игроков. Только для хоста."""
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz:
                if not verify_host(db, quiz.id, sid):
                    logger.warning("Non-host attempted finish_game  sid=%s  room=%s", sid, room)
                    return
                quiz.status = "finished"
                quiz.finished_at = datetime.datetime.utcnow()

                players = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.is_host == False
                ).order_by(models.Player.score.desc()).all()

                # Сохраняем победителя (игрок с максимальным счётом)
                if players:
                    quiz.winner_id = players[0].id

                db.commit()
                invalidate_quiz(room)

                if players:
                    max_score = players[0].score
                    winners = [p.name for p in players if p.score == max_score]
                    winners_str = ", ".join(winners)
                else:
                    winners_str = "N/A"
                logger.info(
                    "Game finished  room=%s  quiz_id=%s  players=%d  winners=%s",
                    room, quiz.id, len(players), winners_str,
                )

                results = [{
                    "name": p.name,
                    "score": p.score,
                    "emoji": p.emoji,
                    "answers": p.answers_history
                } for p in players]

                await sio_manager.emit('show_results', {
                    "results": results,
                    "questions": quiz.questions_data
                }, room=room)

                # Results page is static — disconnect everyone to free resources
                all_players = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id
                ).all()
                for p in all_players:
                    if p.sid:
                        await sio_manager.disconnect(p.sid)
                        p.sid = None
                db.commit()
