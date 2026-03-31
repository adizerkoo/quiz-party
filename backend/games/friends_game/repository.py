"""РћР±С‰РёРµ РІСЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹Рµ С„СѓРЅРєС†РёРё РґР»СЏ СЂР°Р±РѕС‚С‹ СЃ РёРіСЂРѕРІС‹РјРё СЃРµСЃСЃРёСЏРјРё Рё СѓС‡Р°СЃС‚РЅРёРєР°РјРё."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from backend.games.friends_game.cache import cache_quiz, get_cached_quiz, invalidate_quiz
from backend.games.friends_game.runtime_state import connection_registry
from backend.games.friends_game import models
from backend.games.friends_game.service import build_participant_payload, load_quiz_graph

logger = logging.getLogger(__name__)


def get_quiz_by_code(db: Session, room_code: str):
    """РС‰РµС‚ РёРіСЂРѕРІСѓСЋ СЃРµСЃСЃРёСЋ РїРѕ РєРѕРґСѓ РєРѕРјРЅР°С‚С‹ СЃ СѓС‡С‘С‚РѕРј РєСЌС€Р° Рё eager loading."""
    cached = get_cached_quiz(room_code)
    if cached:
        # Р•СЃР»Рё РІ РєСЌС€Рµ РµСЃС‚СЊ id, СЃРЅР°С‡Р°Р»Р° РїСЂРѕР±СѓРµРј С‚РѕС‡РµС‡РЅС‹Р№ lookup РїРѕ РїРµСЂРІРёС‡РЅРѕРјСѓ РєР»СЋС‡Сѓ.
        quiz = (
            load_quiz_graph(db.query(models.Quiz))
            .filter(models.Quiz.id == cached["id"])
            .first()
        )
        if quiz:
            return quiz
        # Р•СЃР»Рё РєСЌС€ СѓРєР°Р·С‹РІР°РµС‚ РЅР° СѓР¶Рµ РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰СѓСЋ Р·Р°РїРёСЃСЊ, РѕС‡РёС‰Р°РµРј РµРіРѕ.
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
    """Р’РѕР·РІСЂР°С‰Р°РµС‚ СѓС‡Р°СЃС‚РЅРёРєР° РїРѕ Р°РєС‚РёРІРЅРѕРјСѓ Socket.IO sid.

    РЎРЅР°С‡Р°Р»Р° РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ in-memory runtime registry. Р¤allback РЅР° legacy `sid`
    РЅСѓР¶РµРЅ РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё С‚РµСЃС‚РѕРІ Рё РїРµСЂРµС…РѕРґРЅРѕРіРѕ РїРµСЂРёРѕРґР° РїРѕСЃР»Рµ РЅРѕСЂРјР°Р»РёР·Р°С†РёРё.
    """
    participant_id = connection_registry.get_participant_id(sid)
    if participant_id is None:
        players = db.query(models.Player).all()
        return next((player for player in players if getattr(player, "sid", None) == sid), None)
    return db.query(models.Player).filter(models.Player.id == participant_id).first()


def verify_host(db: Session, quiz_id: int, sid: str) -> bool:
    """РџСЂРѕРІРµСЂСЏРµС‚, С‡С‚Рѕ СѓРєР°Р·Р°РЅРЅС‹Р№ sid РїСЂРёРЅР°РґР»РµР¶РёС‚ С…РѕСЃС‚Сѓ РєРѕРЅРєСЂРµС‚РЅРѕР№ РёРіСЂРѕРІРѕР№ СЃРµСЃСЃРёРё."""
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
    """РЎРѕР±РёСЂР°РµС‚ СЃРµСЂРёР°Р»РёР·РѕРІР°РЅРЅРѕРµ РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РґР»СЏ socket-РѕС‚РІРµС‚РѕРІ."""
    players = (
        db.query(models.Player)
        .filter(
            models.Player.quiz_id == quiz_id,
            models.Player.status.notin_(("kicked", "left")),
        )
        .order_by(models.Player.joined_at.asc(), models.Player.id.asc())
        .all()
    )
    logger.debug("get_players_in_quiz  quiz_id=%s  count=%d", quiz_id, len(players))
    payload = []
    for player in players:
        item = build_participant_payload(player)
        # Legacy fallback: РІ СЃС‚Р°СЂС‹С… С‚РµСЃС‚Р°С…/СЃС†РµРЅР°СЂРёСЏС… sid РјРѕРі Р¶РёС‚СЊ РїСЂСЏРјРѕ РЅР° РјРѕРґРµР»Рё.
        if not item["connected"] and getattr(player, "sid", None):
            item["connected"] = True
        payload.append(item)
    return payload

