import random
import logging
from .. import models, database
from ..config import PLAYER_EMOJIS
from ..helpers import get_players_in_quiz, get_quiz_by_code
from ..security import rate_limiter, validate_quiz_code, validate_player_name, sanitize_text

logger = logging.getLogger(__name__)


def register_lobby_handlers(sio_manager):

    @sio_manager.on('disconnect')
    async def handle_disconnect(sid):
        with database.get_db_session() as db:
            player = db.query(models.Player).filter(models.Player.sid == sid).first()
            if player:
                player.sid = None
                db.commit()
                logger.info("Player disconnected  name=%s  quiz_id=%s  sid=%s", player.name, player.quiz_id, sid)
            else:
                logger.debug("Unknown sid disconnected  sid=%s", sid)

    @sio_manager.on('join_room')
    async def handle_join(sid, data):
        if not rate_limiter.is_allowed(sid):
            logger.warning("Rate limit hit on join_room  sid=%s", sid)
            return
        room = data.get('room')
        if not validate_quiz_code(room):
            logger.warning("Invalid quiz code on join  room=%r  sid=%s", room, sid)
            return
        raw_name = sanitize_text(str(data.get('name', 'Игрок'))[:15]).strip()
        name = raw_name if validate_player_name(raw_name) else 'Игрок'
        role = data.get('role')
        is_host = (role == 'host')

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz:
                await sio_manager.enter_room(sid, room)

                player = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.name == name
                ).first()

                if player and player.sid is None:
                    # Реконнект: игрок с таким именем отключился ранее
                    player.sid = sid
                    logger.info("Player reconnected  name=%s  room=%s  sid=%s", name, room, sid)
                elif player:
                    # Имя занято активным игроком — создаём нового с суффиксом
                    if quiz.status != "waiting" and not is_host:
                        await sio_manager.emit('game_already_started', {}, room=sid)
                        logger.info("Blocked late join  name=%s  room=%s  status=%s", name, room, quiz.status)
                        return

                    existing_names = {p.name for p in db.query(models.Player.name).filter(models.Player.quiz_id == quiz.id).all()}
                    original_name = name
                    counter = 1
                    while name in existing_names:
                        name = f"{original_name} ({counter})"
                        counter += 1
                    logger.info("Name conflict resolved  original=%s  assigned=%s  room=%s", original_name, name, room)
                    await sio_manager.emit('name_assigned', {'name': name}, room=sid)

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
                    # Новый игрок с уникальным именем
                    if quiz.status != "waiting" and not is_host:
                        await sio_manager.emit('game_already_started', {}, room=sid)
                        logger.info("Blocked late join  name=%s  room=%s  status=%s", name, room, quiz.status)
                        return

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

                db.commit()
                logger.info("Player joined  name=%s  room=%s  host=%s  sid=%s", name, room, is_host, sid)
                await sio_manager.emit('update_players', get_players_in_quiz(db, quiz.id), room=room)
