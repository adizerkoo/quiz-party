import datetime
from .. import models, database
from ..security import validate_quiz_code


def register_results_handlers(sio_manager):

    @sio_manager.on('finish_game_signal')
    async def handle_finish(sid, data):
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        with database.get_db_session() as db:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if quiz:
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
