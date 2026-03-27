"""Общие вспомогательные функции для работы с игровыми сессиями и участниками."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from . import models
from .cache import get_cached_quiz, cache_quiz, invalidate_quiz
from .runtime_state import connection_registry
from .services import build_participant_payload, load_quiz_graph

logger = logging.getLogger(__name__)


def get_quiz_by_code(db: Session, room_code: str):
    """Ищет игровую сессию по коду комнаты с учётом кэша и eager loading."""
    cached = get_cached_quiz(room_code)
    if cached:
        # Если в кэше есть id, сначала пробуем точечный lookup по первичному ключу.
        quiz = (
            load_quiz_graph(db.query(models.Quiz))
            .filter(models.Quiz.id == cached["id"])
            .first()
        )
        if quiz:
            return quiz
        # Если кэш указывает на уже несуществующую запись, очищаем его.
        invalidate_quiz(room_code)

    quiz = (
        load_quiz_graph(db.query(models.Quiz))
        .filter(models.Quiz.code == room_code)
        .first()
    )
    if quiz:
        cache_quiz(room_code, quiz.id, quiz.questions_data, quiz.total_questions)
    return quiz


def get_player_by_sid(db: Session, sid: str):
    """Возвращает участника по активному Socket.IO sid.

    Сначала используется in-memory runtime registry. Фallback на legacy `sid`
    нужен для совместимости тестов и переходного периода после нормализации.
    """
    participant_id = connection_registry.get_participant_id(sid)
    if participant_id is None:
        players = db.query(models.Player).all()
        return next((player for player in players if getattr(player, "sid", None) == sid), None)
    return db.query(models.Player).filter(models.Player.id == participant_id).first()


def verify_host(db: Session, quiz_id: int, sid: str) -> bool:
    """Проверяет, что указанный sid принадлежит хосту конкретной игровой сессии."""
    participant_id = connection_registry.get_participant_id(sid)
    if participant_id is not None:
        return (
            db.query(models.Player.id)
            .filter(
                models.Player.id == participant_id,
                models.Player.quiz_id == quiz_id,
                models.Player.role == "host",
            )
            .first()
            is not None
        )

    participant = get_player_by_sid(db, sid)
    return bool(participant and participant.quiz_id == quiz_id and participant.is_host)


def get_players_in_quiz(db: Session, quiz_id: int):
    """Собирает сериализованное представление участников для socket-ответов."""
    players = (
        db.query(models.Player)
        .filter(
            models.Player.quiz_id == quiz_id,
            models.Player.status != "kicked",
        )
        .order_by(models.Player.joined_at.asc(), models.Player.id.asc())
        .all()
    )
    logger.debug("get_players_in_quiz  quiz_id=%s  count=%d", quiz_id, len(players))
    payload = []
    for player in players:
        item = build_participant_payload(player)
        # Legacy fallback: в старых тестах/сценариях sid мог жить прямо на модели.
        if not item["connected"] and getattr(player, "sid", None):
            item["connected"] = True
        payload.append(item)
    return payload
