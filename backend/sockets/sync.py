from .. import models, database
from ..helpers import get_players_in_quiz


def register_sync_handlers(sio_manager):

    @sio_manager.on('request_sync')
    async def handle_sync(sid, data):
        room = data.get('room')
        name = data.get('name')
        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id,
                models.Player.name == name
            ).first()

            if quiz:
                is_finished = (quiz.status == "finished")
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
        finally:
            db.close()

    @sio_manager.on("get_update")
    async def get_update(sid, room):
        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if quiz:
                players = get_players_in_quiz(db, quiz.id)
                await sio_manager.emit(
                    "update_answers",
                    players,
                    room=sid
                )
        finally:
            db.close()
