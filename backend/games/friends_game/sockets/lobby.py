"""Socket.IO-обработчики лобби, входа в комнату и реконнекта."""
from __future__ import annotations

import asyncio
import random
import logging

from backend.app import database
from backend.app.config import PLAYER_EMOJIS
from backend.app.logging_config import build_log_extra, log_event, log_game_event, logged_socket_handler
from backend.games.friends_game.runtime_state import connection_registry, rate_limiter
from backend.games.friends_game import models
from backend.games.friends_game.repository import (
    get_player_by_sid,
    get_players_in_quiz,
    get_quiz_by_code,
    verify_host,
)
from backend.games.friends_game.resume import (
    HOST_TIMEOUT,
    build_game_cancelled_payload,
    cancel_quiz,
    evaluate_quiz_state,
    mark_participant_left,
    mark_quiz_activity,
)
from backend.games.friends_game.service import (
    DEFAULT_EMOJI,
    DevicePayload,
    ensure_installation,
    hash_secret,
    issue_participant_token,
    issue_secret,
    log_session_event,
    validate_player_name,
    validate_quiz_code,
    verify_secret,
)
from backend.platform.identity import models as identity_models
from backend.shared.utils import sanitize_text, utc_now_naive

logger = logging.getLogger(__name__)

_pending_disconnects: dict[int, asyncio.Task] = {}
_pending_host_timeouts: dict[int, asyncio.Task] = {}
DEFAULT_PLAYER_NAME = "Игрок"
DEFAULT_HOST_NAME = "Ведущий"
HOST_NAME_PLACEHOLDERS = {"HOST", DEFAULT_HOST_NAME, DEFAULT_PLAYER_NAME}


def _normalized_name(raw_name: str) -> str:
    """Санитизирует имя игрока и подставляет безопасный fallback."""
    cleaned = sanitize_text(raw_name[:15]).strip()
    return cleaned if validate_player_name(cleaned) else DEFAULT_PLAYER_NAME


def _is_placeholder_host_name(name: str) -> bool:
    """Проверяет, что клиент прислал технический placeholder вместо ника хоста."""
    normalized = sanitize_text(name).strip()
    return normalized in HOST_NAME_PLACEHOLDERS


def _ensure_unique_name(quiz: models.Quiz, requested_name: str) -> str:
    """Гарантирует уникальность отображаемого имени внутри одной игровой сессии."""
    existing_names = {
        participant.name
        for participant in quiz.players
        if participant.status not in {"kicked", "left"}
    }
    name = requested_name
    if name not in existing_names:
        return name

    original_name = name
    counter = 1
    while name in existing_names:
        name = f"{original_name} ({counter})"
        counter += 1
    return name


def _pick_emoji(quiz: models.Quiz, preferred_emoji: str | None) -> str:
    """Подбирает emoji участнику с учётом уже занятых аватаров в лобби."""
    used_emojis = {
        participant.emoji
        for participant in quiz.players
        if participant.status not in {"kicked", "left"} and participant.emoji
    }
    available_emojis = [emoji for emoji in PLAYER_EMOJIS if emoji not in used_emojis]
    return preferred_emoji or random.choice(available_emojis if available_emojis else PLAYER_EMOJIS)


def _find_disconnected_participant_by_token(
    quiz: models.Quiz,
    submitted_token: str | None,
) -> models.Player | None:
    """Ищет отключившегося участника по reconnect token."""
    if not submitted_token:
        return None
    for participant in quiz.players:
        if participant.is_host or participant.status in {"kicked", "left"}:
            continue
        if connection_registry.is_connected(participant.id):
            continue
        if verify_secret(submitted_token, participant.reconnect_token_hash):
            return participant
    return None


def _find_reconnect_candidate(
    quiz: models.Quiz,
    *,
    name: str,
    resolved_user_id: int | None,
    submitted_token: str | None,
) -> models.Player | None:
    """Подбирает кандидата на реконнект по токену, имени или `user_id`."""
    by_token = _find_disconnected_participant_by_token(quiz, submitted_token)
    if by_token is not None:
        return by_token

    for participant in quiz.players:
        if participant.is_host or participant.status in {"kicked", "left"}:
            continue
        if connection_registry.is_connected(participant.id):
            continue
        if participant.name == name:
            return participant
        if resolved_user_id is not None and participant.user_id == resolved_user_id:
            return participant
    return None


def _find_kicked_participant(
    quiz: models.Quiz,
    *,
    name: str,
    resolved_user_id: int | None,
    installation_id: int | None,
    submitted_token: str | None,
) -> models.Player | None:
    """Ищет уже кикнутого игрока, чтобы не создавать ему новую запись при повторном входе."""
    kicked_players = [
        participant
        for participant in quiz.players
        if not participant.is_host and participant.status == "kicked"
    ]
    if not kicked_players:
        return None

    if submitted_token:
        for participant in kicked_players:
            if verify_secret(submitted_token, participant.reconnect_token_hash):
                return participant

    if resolved_user_id is not None:
        for participant in kicked_players:
            if participant.user_id == resolved_user_id:
                return participant

    if installation_id is not None:
        for participant in kicked_players:
            if participant.installation_id == installation_id:
                return participant

    if submitted_token is None and resolved_user_id is None and installation_id is None:
        # Legacy fallback: если у клиента нет стабильной identity, остаётся только имя.
        for participant in kicked_players:
            if participant.name == name:
                return participant

    return None


def _find_left_participant(
    quiz: models.Quiz,
    *,
    name: str,
    resolved_user_id: int | None,
    installation_id: int | None,
    submitted_token: str | None,
) -> models.Player | None:
    """Ищет участника, который уже покинул игру добровольно."""
    left_players = [
        participant
        for participant in quiz.players
        if not participant.is_host and participant.status == "left"
    ]
    if not left_players:
        return None

    if submitted_token:
        for participant in left_players:
            if verify_secret(submitted_token, participant.reconnect_token_hash):
                return participant

    if resolved_user_id is not None:
        for participant in left_players:
            if participant.user_id == resolved_user_id:
                return participant

    if installation_id is not None:
        for participant in left_players:
            if participant.installation_id == installation_id:
                return participant

    if submitted_token is None and resolved_user_id is None and installation_id is None:
        for participant in left_players:
            if participant.name == name:
                return participant

    return None


def _find_host_participant(quiz: models.Quiz) -> models.Player | None:
    """Возвращает host-participant для текущей игровой сессии, если он уже существует."""
    return next(
        (
            participant
            for participant in quiz.players
            if participant.is_host and participant.status != "kicked"
        ),
        None,
    )


def _should_restore_host_mode(
    quiz: models.Quiz,
    *,
    requested_role: str | None,
    submitted_host_token: str | None,
) -> bool:
    """Переводит player-вход в host flow только при валидном `host_token` этой комнаты."""
    if requested_role == "host":
        return True
    return verify_secret(submitted_host_token, quiz.host_secret_hash)


async def _emit_credentials(sio_manager, sid: str, *, participant: models.Player, host_token: str | None, participant_token: str) -> None:
    """Отправляет клиенту актуальные reconnect/host credentials после join."""
    await sio_manager.emit(
        "session_credentials",
        {
            "role": participant.role,
            "participant_id": participant.public_id,
            "participant_token": participant_token,
            "host_token": host_token,
            "installation_public_id": participant.installation.public_id if participant.installation else None,
        },
        room=sid,
    )


def register_lobby_handlers(sio_manager):
    """Регистрирует socket-события лобби: join, disconnect и kick."""
    async def _emit_game_cancelled(room: str, quiz: models.Quiz, *, target_sid: str | None = None):
        await sio_manager.emit("game_cancelled", build_game_cancelled_payload(quiz), room=target_sid or room)

    async def _emit_resume_unavailable(target_sid: str, *, reason: str):
        await sio_manager.emit("resume_unavailable", {"reason": reason}, room=target_sid)

    async def _emit_host_connection_state(room: str, *, host_offline: bool, target_sid: str | None = None):
        """Шлёт клиентам текущее состояние подключения хоста для постоянного индикатора."""
        await sio_manager.emit(
            "host_connection_state",
            {"hostOffline": host_offline},
            room=target_sid or room,
        )

    async def _schedule_host_timeout(quiz_id: int, quiz_code: str, expected_host_left_at):
        await asyncio.sleep(HOST_TIMEOUT.total_seconds())
        try:
            with database.get_db_session() as db:
                quiz = get_quiz_by_code(db, quiz_code)
                if quiz is None or quiz.id != quiz_id:
                    return
                if quiz.host_left_at != expected_host_left_at:
                    return

                state = evaluate_quiz_state(db, quiz=quiz)
                if not state.cancelled or state.cancel_reason != "host_timeout":
                    return

                db.commit()
                await _emit_game_cancelled(quiz.code, quiz)
        finally:
            _pending_host_timeouts.pop(quiz_id, None)

    async def _delayed_disconnect_notify(participant_id: int, participant_name: str, participant_emoji: str, quiz_code: str):
        """Отложенно подтверждает отключение игрока, если реконнекта не произошло."""
        await asyncio.sleep(5)
        if connection_registry.is_connected(participant_id):
            _pending_disconnects.pop(participant_id, None)
            return

        with database.get_db_session() as db:
            participant = db.query(models.Player).filter(models.Player.id == participant_id).first()
            if participant and participant.status == "disconnected":
                quiz = db.query(models.Quiz).filter(models.Quiz.id == participant.quiz_id).first()
                if quiz and quiz.status == "waiting":
                    # В лобби просто переотрисовываем список игроков без отдельного toast-события.
                    players = get_players_in_quiz(db, quiz.id)
                    await sio_manager.emit("update_players", players, room=quiz_code)
                else:
                    await sio_manager.emit(
                        "player_disconnected",
                        {"name": participant_name, "emoji": participant_emoji},
                        room=quiz_code,
                    )
        _pending_disconnects.pop(participant_id, None)

    @logged_socket_handler(sio_manager, "disconnect", logger)
    async def handle_disconnect(sid, *_):
        """Переводит участника в `disconnected`/`finished` и планирует отложенное уведомление."""
        connection = connection_registry.unbind_sid(sid)

        with database.get_db_session() as db:
            if connection is not None:
                participant = db.query(models.Player).filter(models.Player.id == connection.participant_id).first()
            else:
                participant = get_player_by_sid(db, sid)
            if participant is not None:
                participant.sid = None
            if participant is None:
                log_event(
                    logger,
                    logging.DEBUG,
                    "socket.disconnect.unknown_sid",
                    "disconnect ignored because sid is unknown",
                    sid=sid,
                )
                return

            quiz = db.query(models.Quiz).filter(models.Quiz.id == participant.quiz_id).first()
            if quiz is None:
                return

            participant.last_seen_at = utc_now_naive()
            if quiz.status == "finished":
                # После завершения игры не держим участника в disconnected-state.
                if participant.status != "kicked":
                    participant.status = "finished"
                db.commit()
                return

            if participant.status == "left":
                db.commit()
                return

            participant.status = "disconnected"
            participant.disconnected_at = utc_now_naive()
            if participant.is_host:
                quiz.host_left_at = participant.disconnected_at
            log_session_event(
                db,
                quiz=quiz,
                participant=participant,
                installation=participant.installation,
                event_type="participant_disconnected",
                payload={"participant_name": participant.name},
            )
            db.commit()
            log_event(
                logger,
                logging.INFO,
                "socket.disconnect.completed",
                "Participant disconnected",
                **build_log_extra(quiz=quiz, participant=participant, sid=sid),
                status=quiz.status,
            )

            if quiz.status in ("waiting", "playing") and participant.is_host:
                await _emit_host_connection_state(quiz.code, host_offline=True)
                previous_timeout_task = _pending_host_timeouts.pop(quiz.id, None)
                if previous_timeout_task:
                    previous_timeout_task.cancel()
                _pending_host_timeouts[quiz.id] = asyncio.create_task(
                    _schedule_host_timeout(quiz.id, quiz.code, quiz.host_left_at)
                )

            if quiz.status in ("waiting", "playing") and not participant.is_host:
                # Даём игроку короткое окно на реконнект, чтобы не шуметь лишними событиями.
                old_task = _pending_disconnects.pop(participant.id, None)
                if old_task:
                    old_task.cancel()
                _pending_disconnects[participant.id] = asyncio.create_task(
                    _delayed_disconnect_notify(
                        participant.id,
                        participant.name,
                        participant.emoji or DEFAULT_EMOJI,
                        quiz.code,
                    )
                )

    @logged_socket_handler(sio_manager, "kick_player", logger)
    async def handle_kick_player(sid, data):
        """Исключает игрока из лобби по команде хоста."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.kick_player.rate_limited",
                "kick_player rejected by rate limiter",
                sid=sid,
            )
            return
        room = data.get("room")
        if not validate_quiz_code(room):
            log_event(
                logger,
                logging.WARNING,
                "socket.kick_player.invalid_room",
                "kick_player ignored because room code is invalid",
                sid=sid,
                room=room,
            )
            return
        target_name = data.get("playerName")
        if not target_name:
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz:
                return
            state = evaluate_quiz_state(db, quiz=quiz)
            if state.cancelled:
                if state.just_cancelled:
                    db.commit()
                await _emit_game_cancelled(room, quiz)
                return
            if not verify_host(db, quiz.id, sid) or quiz.status != "waiting":
                return

            participant = (
                db.query(models.Player)
                .filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.name == target_name,
                    models.Player.role == "player",
                    models.Player.status.notin_(("kicked", "left")),
                )
                .first()
            )
            if participant is None:
                return

            participant.status = "kicked"
            participant.kicked_at = utc_now_naive()
            target_sid = connection_registry.get_sid(participant.id)
            if target_sid:
                connection_registry.unbind_sid(target_sid)
            pending_disconnect = _pending_disconnects.pop(participant.id, None)
            if pending_disconnect:
                pending_disconnect.cancel()
            # После кика participant больше не должен всплывать в fallback-поиске по sid.
            participant.sid = None
            log_session_event(
                db,
                quiz=quiz,
                participant=participant,
                installation=participant.installation,
                event_type="participant_kicked",
                payload={"participant_name": participant.name},
            )
            db.commit()
            log_game_event(
                logger,
                logging.INFO,
                "socket.kick_player.completed",
                "Player was kicked from the lobby",
                **build_log_extra(quiz=quiz, participant=participant, sid=sid),
            )

            if target_sid:
                await sio_manager.emit("player_kicked", {}, room=target_sid)
                await sio_manager.leave_room(target_sid, room)

            await sio_manager.emit("update_players", get_players_in_quiz(db, quiz.id), room=room)

    @logged_socket_handler(sio_manager, "leave_game", logger)
    async def handle_leave_game(sid, data):
        """Позволяет игроку добровольно покинуть игру без права на реконнект."""
        room = data.get("room")
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            participant = get_player_by_sid(db, sid)
            if quiz is None or participant is None or participant.quiz_id != quiz.id or participant.is_host:
                return
            if participant.status in {"kicked", "left"}:
                await _emit_resume_unavailable(sid, reason="participant_left")
                return

            left_at = utc_now_naive()
            mark_participant_left(participant, left_at=left_at)
            pending_disconnect = _pending_disconnects.pop(participant.id, None)
            if pending_disconnect:
                pending_disconnect.cancel()
            log_session_event(
                db,
                quiz=quiz,
                participant=participant,
                installation=participant.installation,
                event_type="participant_left",
                payload={
                    "participant_name": participant.name,
                    "left_at": left_at.isoformat(),
                },
            )
            db.commit()

            await sio_manager.emit(
                "leave_confirmed",
                {"left_at": left_at.isoformat()},
                room=sid,
            )
            await sio_manager.emit("update_players", get_players_in_quiz(db, quiz.id), room=room)
            if quiz.status == "playing":
                await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)
            await sio_manager.leave_room(sid, room)
            await sio_manager.disconnect(sid)

    @logged_socket_handler(sio_manager, "cancel_game_signal", logger)
    async def handle_cancel_game(sid, data):
        """Позволяет хосту вручную отменить уже начатую игру для всех участников."""
        room = data.get("room")
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz is None:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.cancel_game_signal.quiz_missing",
                    "cancel_game_signal ignored because the quiz does not exist",
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
                    "socket.cancel_game_signal.host_required",
                    "cancel_game_signal ignored because sender is not the host",
                    **build_log_extra(quiz=quiz, sid=sid),
                )
                return

            if quiz.status != "playing":
                log_event(
                    logger,
                    logging.INFO,
                    "socket.cancel_game_signal.skipped",
                    "cancel_game_signal ignored because the quiz is not active",
                    **build_log_extra(quiz=quiz, sid=sid),
                    status=quiz.status,
                )
                return

            host = get_player_by_sid(db, sid)
            cancelled_at = utc_now_naive()
            cancel_quiz(
                db,
                quiz=quiz,
                reason="host_left",
                cancelled_at=cancelled_at,
            )
            mark_quiz_activity(quiz, occurred_at=cancelled_at)
            db.commit()

            log_game_event(
                logger,
                logging.INFO,
                "socket.cancel_game_signal.completed",
                "Game cancelled by host",
                **build_log_extra(quiz=quiz, participant=host, sid=sid),
                cancel_reason=quiz.cancel_reason,
            )
            await _emit_game_cancelled(room, quiz)

    @logged_socket_handler(sio_manager, "join_room", logger)
    async def handle_join(sid, data):
        """Обрабатывает вход хоста/игрока в комнату и сценарии реконнекта."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.join_room.rate_limited",
                "join_room rejected by rate limiter",
                sid=sid,
            )
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            log_event(
                logger,
                logging.WARNING,
                "socket.join_room.invalid_room",
                "join_room ignored because room code is invalid",
                sid=sid,
                room=room,
            )
            return

        requested_role = data.get("role")
        is_host = requested_role == "host"
        requested_name = _normalized_name(str(data.get("name", DEFAULT_PLAYER_NAME)))
        preferred_emoji = data.get("emoji") if data.get("emoji") in PLAYER_EMOJIS else None
        submitted_host_token = data.get("host_token")
        submitted_participant_token = data.get("participant_token") or data.get("reconnect_token")

        requested_user_id = data.get("user_id")
        try:
            requested_user_id = int(requested_user_id) if requested_user_id is not None else None
        except (TypeError, ValueError):
            requested_user_id = None

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz is None:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.join_room.quiz_missing",
                    "join_room ignored because the quiz does not exist",
                    sid=sid,
                    room=room,
                )
                return

            state = evaluate_quiz_state(db, quiz=quiz)
            if state.cancelled:
                if state.just_cancelled:
                    db.commit()
                await _emit_game_cancelled(room, quiz, target_sid=sid)
                return

            # Если player-маршрут открывает сам хост со своим host token,
            # не создаём дубликат игрока, а возвращаем в host flow.
            role_was_corrected = False
            if _should_restore_host_mode(
                quiz,
                requested_role=requested_role,
                submitted_host_token=submitted_host_token,
            ):
                role_was_corrected = requested_role != "host"
                is_host = True

            resolved_user = None
            if requested_user_id is not None:
                resolved_user = (
                    db.query(identity_models.User)
                    .filter(identity_models.User.id == requested_user_id)
                    .first()
                )
            elif quiz.owner_id is not None and is_host:
                # Если хост не прислал user_id, пробуем восстановить его из owner текущей сессии.
                resolved_user = (
                    db.query(identity_models.User)
                    .filter(identity_models.User.id == quiz.owner_id)
                    .first()
                )

            device = DevicePayload.from_socket(data)
            installation = ensure_installation(db, user=resolved_user, device=device)

            host_token_to_return = None
            participant = None
            name_assigned = None
            is_reconnect = False

            if is_host:
                if quiz.host_secret_hash and not verify_secret(submitted_host_token, quiz.host_secret_hash):
                    await sio_manager.emit("host_auth_failed", {}, room=sid)
                    log_event(
                        logger,
                        logging.WARNING,
                        "socket.join_room.host_auth_failed",
                        "Host authentication failed during join_room",
                        room=room,
                        sid=sid,
                    )
                    return

                existing_host = _find_host_participant(quiz)
                if existing_host and connection_registry.is_connected(existing_host.id):
                    await sio_manager.emit("host_already_connected", {}, room=sid)
                    log_event(
                        logger,
                        logging.INFO,
                        "socket.join_room.host_already_connected",
                        "join_room rejected because the host is already connected",
                        room=room,
                        sid=sid,
                    )
                    return
                if state.resume_window_expired:
                    log_session_event(
                        db,
                        quiz=quiz,
                        participant=existing_host,
                        installation=installation or (existing_host.installation if existing_host else None),
                        event_type="resume_offer_suppressed",
                        payload={"role": "host", "reason": "resume_window_expired"},
                    )
                    db.commit()
                    await _emit_resume_unavailable(sid, reason="resume_window_expired")
                    return

                if existing_host is None:
                    # Первый вход хоста создаёт session_participant c role=host.
                    if _is_placeholder_host_name(requested_name):
                        # Старые клиенты могли прислать "HOST" вместо настоящего ника.
                        requested_name = (
                            _normalized_name(resolved_user.username)
                            if resolved_user is not None
                            else DEFAULT_HOST_NAME
                        )

                    host_name = _ensure_unique_name(quiz, requested_name)
                    participant = models.Player(
                        name=host_name,
                        role="host",
                        emoji=preferred_emoji or _pick_emoji(quiz, None),
                        quiz=quiz,
                        user=resolved_user,
                        installation=installation,
                        device=device.device_family,
                        browser=device.browser,
                        browser_version=device.browser_version,
                        device_model=device.device_model,
                        status="joined",
                        joined_at=utc_now_naive(),
                        last_seen_at=utc_now_naive(),
                    )
                    db.add(participant)
                    if host_name != requested_name:
                        name_assigned = host_name
                else:
                    # При реконнекте хоста переиспользуем прежнюю participant-запись.
                    # При reconnect сохраняем уже выбранное имя хоста для стабильного UX в рамках сессии.
                    participant = existing_host
                    is_reconnect = True
                    if _is_placeholder_host_name(participant.name) and resolved_user is not None:
                        repaired_host_name = _ensure_unique_name(quiz, _normalized_name(resolved_user.username))
                        if repaired_host_name != participant.name:
                            participant.name = repaired_host_name
                            name_assigned = repaired_host_name
                    participant.user = resolved_user or participant.user
                    participant.installation = installation or participant.installation
                    participant.device = device.device_family or participant.device
                    participant.browser = device.browser or participant.browser
                    participant.browser_version = device.browser_version or participant.browser_version
                    participant.device_model = device.device_model or participant.device_model
                    participant.status = "joined"
                    participant.last_seen_at = utc_now_naive()
                    participant.disconnected_at = None

                # Хост-токен ротируется на каждом успешном входе.
                host_token_to_return = issue_secret()
                quiz.host_secret_hash = hash_secret(host_token_to_return)
                quiz.host_left_at = None
            else:
                kicked_participant = _find_kicked_participant(
                    quiz,
                    name=requested_name,
                    resolved_user_id=resolved_user.id if resolved_user else None,
                    installation_id=installation.id if installation else None,
                    submitted_token=submitted_participant_token,
                )
                if kicked_participant is not None:
                    log_session_event(
                        db,
                        quiz=quiz,
                        participant=kicked_participant,
                        installation=installation or kicked_participant.installation,
                        event_type="kicked_rejoin_blocked",
                        payload={"participant_name": kicked_participant.name},
                    )
                    db.commit()
                    await sio_manager.emit("player_kicked", {}, room=sid)
                    log_event(
                        logger,
                        logging.INFO,
                        "socket.join_room.kicked_rejoin_blocked",
                        "Kicked player rejoin was blocked",
                        room=room,
                        sid=sid,
                        player=requested_name,
                    )
                    return

                left_participant = _find_left_participant(
                    quiz,
                    name=requested_name,
                    resolved_user_id=resolved_user.id if resolved_user else None,
                    installation_id=installation.id if installation else None,
                    submitted_token=submitted_participant_token,
                )
                if left_participant is not None:
                    log_session_event(
                        db,
                        quiz=quiz,
                        participant=left_participant,
                        installation=installation or left_participant.installation,
                        event_type="resume_offer_suppressed",
                        payload={"role": "player", "reason": "participant_left"},
                    )
                    db.commit()
                    await _emit_resume_unavailable(sid, reason="participant_left")
                    return

                participant = _find_reconnect_candidate(
                    quiz,
                    name=requested_name,
                    resolved_user_id=resolved_user.id if resolved_user else None,
                    submitted_token=submitted_participant_token,
                )

                if participant is not None and state.resume_window_expired:
                    log_session_event(
                        db,
                        quiz=quiz,
                        participant=participant,
                        installation=installation or participant.installation,
                        event_type="resume_offer_suppressed",
                        payload={"role": "player", "reason": "resume_window_expired"},
                    )
                    db.commit()
                    await _emit_resume_unavailable(sid, reason="resume_window_expired")
                    return

                if participant is None and quiz.status != "waiting":
                    await sio_manager.emit("game_already_started", {}, room=sid)
                    log_event(
                        logger,
                        logging.INFO,
                        "socket.join_room.game_already_started",
                        "Late join was blocked because the game already started",
                        room=room,
                        sid=sid,
                        player=requested_name,
                        status=quiz.status,
                    )
                    return

                if participant is None:
                    # Новый игрок может войти только до старта игры и пока не переполнена комната.
                    active_count = sum(
                        1
                        for item in quiz.players
                        if not item.is_host and item.status not in {"kicked", "left"}
                    )
                    if active_count >= 50:
                        await sio_manager.emit("room_full", {}, room=sid)
                        log_event(
                            logger,
                            logging.INFO,
                            "socket.join_room.room_full",
                            "join_room rejected because the room is full",
                            room=room,
                            sid=sid,
                            players=active_count,
                        )
                        return

                    assigned_name = _ensure_unique_name(quiz, requested_name)
                    participant = models.Player(
                        name=assigned_name,
                        role="player",
                        emoji=_pick_emoji(quiz, preferred_emoji),
                        quiz=quiz,
                        user=resolved_user,
                        installation=installation,
                        device=device.device_family,
                        browser=device.browser,
                        browser_version=device.browser_version,
                        device_model=device.device_model,
                        status="joined",
                        joined_at=utc_now_naive(),
                        last_seen_at=utc_now_naive(),
                    )
                    db.add(participant)
                    if assigned_name != requested_name:
                        name_assigned = assigned_name
                else:
                    # Реконнект игрока обновляет device/install info, но не создаёт новую запись.
                    is_reconnect = True
                    participant.user = resolved_user or participant.user
                    participant.installation = installation or participant.installation
                    participant.device = device.device_family or participant.device
                    participant.browser = device.browser or participant.browser
                    participant.browser_version = device.browser_version or participant.browser_version
                    participant.device_model = device.device_model or participant.device_model
                    if preferred_emoji and participant.emoji is None:
                        participant.emoji = preferred_emoji
                    participant.status = "joined"
                    participant.last_seen_at = utc_now_naive()
                    participant.disconnected_at = None

            # Participant token также ротируется на каждом успешном join/reconnect.
            mark_quiz_activity(quiz)
            participant_token = issue_participant_token(participant)
            if participant.emoji is None:
                participant.emoji = _pick_emoji(quiz, preferred_emoji)
            participant.sid = sid

            old_task = _pending_disconnects.pop(participant.id, None)
            if old_task:
                old_task.cancel()
            if participant.is_host:
                pending_host_timeout = _pending_host_timeouts.pop(quiz.id, None)
                if pending_host_timeout:
                    pending_host_timeout.cancel()

            db.flush()
            connection_registry.bind(sid, participant.id, quiz.id)
            rate_limiter.register_identity(sid, f"participant:{participant.public_id}")
            log_session_event(
                db,
                quiz=quiz,
                participant=participant,
                installation=participant.installation,
                event_type="participant_reconnected" if is_reconnect else "participant_joined",
                payload={"participant_name": participant.name, "role": participant.role},
            )
            db.commit()

            await sio_manager.enter_room(sid, room)
            await _emit_credentials(
                sio_manager,
                sid,
                participant=participant,
                host_token=host_token_to_return,
                participant_token=participant_token,
            )
            if name_assigned:
                await sio_manager.emit("name_assigned", {"name": name_assigned}, room=sid)

            await sio_manager.emit("update_players", get_players_in_quiz(db, quiz.id), room=room)

            # Отдельное событие реконнекта шлём только если игрок вернулся уже в активную игру.
            if participant.is_host and quiz.status in ("waiting", "playing"):
                await _emit_host_connection_state(room, host_offline=False)
            if quiz.status == "playing" and not participant.is_host and old_task is None and submitted_participant_token:
                await sio_manager.emit(
                    "player_reconnected",
                    {"name": participant.name, "emoji": participant.emoji or DEFAULT_EMOJI},
                    room=room,
                )
            join_event = "socket.reconnect.completed" if is_reconnect else "socket.join_room.completed"
            join_message = "Participant reconnected" if is_reconnect else "Participant joined room"
            join_log = log_game_event if (quiz.status == "waiting" or is_reconnect) else log_event
            join_log(
                logger,
                logging.INFO,
                join_event,
                join_message,
                **build_log_extra(quiz=quiz, participant=participant, sid=sid),
                reconnect=is_reconnect,
                role_corrected=role_was_corrected,
                assigned_name=name_assigned,
                status=quiz.status,
            )

