"""
Socket.IO обработчики лобби.

Подключение/отключение игроков, реконнект, разрешение конфликтов
имён, ограничение на 50 игроков в комнате.
"""

import asyncio
import random
import logging
from .. import models, database
from ..config import PLAYER_EMOJIS
from ..helpers import get_players_in_quiz, get_quiz_by_code, verify_host
from ..security import rate_limiter, validate_quiz_code, validate_player_name, sanitize_text

logger = logging.getLogger(__name__)

# Таймеры отложенного уведомления об отключении (player_id -> asyncio.Task)
_pending_disconnects = {}


def register_lobby_handlers(sio_manager):
    """Регистрирует события лобби на Socket.IO менеджере."""

    async def _delayed_disconnect_notify(player_id, player_name, player_emoji, quiz_code):
        """Ждёт 5 секунд и отправляет уведомление если игрок не переподключился."""
        await asyncio.sleep(5)
        with database.get_db_session() as db:
            player = db.query(models.Player).filter(models.Player.id == player_id).first()
            if player and player.sid is None:
                await sio_manager.emit('player_disconnected', {
                    'name': player_name,
                    'emoji': player_emoji
                }, room=quiz_code)
                logger.info("Player disconnect confirmed after delay  name=%s  quiz_code=%s", player_name, quiz_code)
        _pending_disconnects.pop(player_id, None)

    @sio_manager.on('disconnect')
    async def handle_disconnect(sid):
        """Обрабатывает отключение: обнуляет sid игрока для возможности реконнекта."""
        with database.get_db_session() as db:
            player = db.query(models.Player).filter(models.Player.sid == sid).first()
            if player:
                quiz = db.query(models.Quiz).filter(models.Quiz.id == player.quiz_id).first()
                player_id = player.id
                player_name = player.name
                player_emoji = player.emoji or '👤'
                player.sid = None
                db.commit()
                logger.info("Player disconnected  name=%s  quiz_id=%s  sid=%s", player_name, player.quiz_id, sid)
                # Отложенное уведомление хоста (5с задержка для реконнекта при обновлении страницы)
                if quiz and quiz.status == "playing" and not player.is_host:
                    old_task = _pending_disconnects.pop(player_id, None)
                    if old_task:
                        old_task.cancel()
                    _pending_disconnects[player_id] = asyncio.create_task(
                        _delayed_disconnect_notify(player_id, player_name, player_emoji, quiz.code)
                    )
            else:
                logger.debug("Unknown sid disconnected  sid=%s", sid)

    @sio_manager.on('kick_player')
    async def handle_kick_player(sid, data):
        """Хост исключает игрока из комнаты ожидания."""
        if not rate_limiter.is_allowed(sid):
            return
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        target_name = data.get('playerName')
        if not target_name:
            return
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz:
                return
            if not verify_host(db, quiz.id, sid):
                logger.warning("Non-host attempted kick_player  sid=%s  room=%s", sid, room)
                return
            if quiz.status != "waiting":
                return
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id,
                models.Player.name == target_name,
                models.Player.is_host == False
            ).first()
            if player:
                kicked_sid = player.sid
                db.delete(player)
                db.commit()
                logger.info("Player kicked  name=%s  room=%s  by_host_sid=%s", target_name, room, sid)
                if kicked_sid:
                    await sio_manager.emit('player_kicked', {}, room=kicked_sid)
                    await sio_manager.leave_room(kicked_sid, room)
                await sio_manager.emit('update_players', get_players_in_quiz(db, quiz.id), room=room)

    @sio_manager.on('join_room')
    async def handle_join(sid, data):
        """Подключает игрока к комнате: реконнект, создание нового или переименование при конфликте."""
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
                # Проверка: если хост уже подключён, блокируем дубликат
                if is_host:
                    existing_host = db.query(models.Player).filter(
                        models.Player.quiz_id == quiz.id,
                        models.Player.is_host == True,
                        models.Player.sid != None
                    ).first()
                    if existing_host:
                        await sio_manager.emit('host_already_connected', {}, room=sid)
                        logger.info("Blocked duplicate host  room=%s  sid=%s", room, sid)
                        return

                await sio_manager.enter_room(sid, room)

                player = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.name == name
                ).first()

                if player and player.sid is None:
                    # Реконнект: игрок с таким именем отключился ранее
                    player.sid = sid
                    # Отменяем отложенное уведомление об отключении
                    old_task = _pending_disconnects.pop(player.id, None)
                    if old_task:
                        old_task.cancel()
                    logger.info("Player reconnected  name=%s  room=%s  sid=%s", name, room, sid)
                    # Уведомляем хоста только если игрок был реально отмечен как отключённый
                    # (если old_task существовал — 5с ещё не прошли и хост не знает об отключении)
                    if quiz.status == "playing" and not is_host and not old_task:
                        await sio_manager.emit('player_reconnected', {
                            'name': player.name,
                            'emoji': player.emoji or '👤'
                        }, room=room)
                elif player:
                    # Имя занято активным игроком — создаём нового с суффиксом
                    if quiz.status != "waiting" and not is_host:
                        await sio_manager.emit('game_already_started', {}, room=sid)
                        logger.info("Blocked late join  name=%s  room=%s  status=%s", name, room, quiz.status)
                        return

                    if not is_host:
                        active_count = db.query(models.Player).filter(
                            models.Player.quiz_id == quiz.id,
                            models.Player.is_host == False
                        ).count()
                        if active_count >= 50:
                            await sio_manager.emit('room_full', {}, room=sid)
                            logger.info("Room full  room=%s  count=%d", room, active_count)
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

                    if not is_host:
                        active_count = db.query(models.Player).filter(
                            models.Player.quiz_id == quiz.id,
                            models.Player.is_host == False
                        ).count()
                        if active_count >= 50:
                            await sio_manager.emit('room_full', {}, room=sid)
                            logger.info("Room full  room=%s  count=%d", room, active_count)
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
                if player:
                    rate_limiter.register_identity(sid, f"player:{player.id}")
                logger.info("Player joined  name=%s  room=%s  host=%s  sid=%s", name, room, is_host, sid)
                await sio_manager.emit('update_players', get_players_in_quiz(db, quiz.id), room=room)
