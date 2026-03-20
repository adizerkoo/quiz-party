import random
from .. import models, database
from ..config import PLAYER_EMOJIS
from ..helpers import get_players_in_quiz


def register_lobby_handlers(sio_manager):

    @sio_manager.on('join_room')
    async def handle_join(sid, data):
        room = data.get('room')
        name = str(data.get('name', 'Игрок'))[:15]
        role = data.get('role')
        is_host = (role == 'host')

        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if quiz:
                await sio_manager.enter_room(sid, room)
                quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()

                if not quiz:
                    return

                player = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.name == name
                ).first()

                if not player:
                    used_emojis = [p.emoji for p in db.query(models.Player.emoji).filter(models.Player.quiz_id == quiz.id).all()]
                    available_emojis = [e for e in PLAYER_EMOJIS if e not in used_emojis]
                    assigned_emoji = random.choice(available_emojis if available_emojis else PLAYER_EMOJIS)
                    player = models.Player(
                        name=name, sid=sid, quiz_id=quiz.id,
                        is_host=is_host, score=0, emoji=assigned_emoji,
                        answers_history={},
                        device=data.get('device'),
                        browser=data.get('browser'),
                        browser_version=data.get('browser_version'),
                        device_model=data.get('device_model'),
                    )
                    db.add(player)
                else:
                    player.sid = sid
                db.commit()
                await sio_manager.emit('update_players', get_players_in_quiz(db, quiz.id), room=room)
        finally:
            db.close()
