import logging

from .. import models, database
from ..helpers import get_players_in_quiz, get_quiz_by_code
from ..security import rate_limiter, validate_quiz_code

logger = logging.getLogger(__name__)


def register_sync_handlers(sio_manager):

    @sio_manager.on('request_sync')
    async def handle_sync(sid, data):
        if not rate_limiter.is_allowed(sid):
            logger.warning("Rate limit hit on request_sync  sid=%s", sid)
            return
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz:
                logger.warning("Sync requested for missing quiz  room=%s  sid=%s", room, sid)
                return
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id,
                models.Player.sid == sid
            ).first()

            is_finished = (quiz.status == "finished")
            logger.info(
                "Sync sent  name=%s  room=%s  status=%s  question=%s",
                player.name if player else "unknown", room, quiz.status, quiz.current_question,
            )
            await sio_manager.emit('sync_state', {
                "currentQuestion": quiz.current_question,
                "maxReachedQuestion": quiz.current_question,
                "status": quiz.status,
                "started_at": str(quiz.started_at) if quiz.started_at else None,
                "finished_at": str(quiz.finished_at) if quiz.finished_at else None,
                "questions": quiz.questions_data if is_finished else None,
                "playerAnswer": player.answers_history.get(str(quiz.current_question)) if player and player.answers_history else None,
                "answersHistory": player.answers_history if player and player.answers_history else {},
                "score": player.score if player else 0,
                "emoji": player.emoji if player else "👤"
            }, room=sid)

            if quiz.status == "finished":
                players = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.is_host == False
                ).order_by(models.Player.score.desc()).all()

                results = [{"name": p.name, "score": p.score, "emoji": p.emoji, "answers": p.answers_history} for p in players]
                await sio_manager.emit('show_results', {
                    "results": results,
                    "questions": quiz.questions_data
                }, room=sid)
            elif quiz.status == "playing":
                if player and player.is_host:
                    players_data = get_players_in_quiz(db, quiz.id)
                    await sio_manager.emit('update_answers', players_data, room=sid)
            elif quiz.status == "waiting":
                pass

    @sio_manager.on("get_update")
    async def get_update(sid, room):
        if not rate_limiter.is_allowed(sid):
            return
        if not validate_quiz_code(room):
            return
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz:
                players = get_players_in_quiz(db, quiz.id)
                logger.debug("get_update  room=%s  players=%d", room, len(players))
                await sio_manager.emit(
                    "update_answers",
                    players,
                    room=sid
                )
