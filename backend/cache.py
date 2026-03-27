"""Простой in-memory кэш активных игровых сессий."""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# В кэше держим только лёгкий снимок, чтобы не таскать весь ORM-граф без нужды.
_quiz_cache: Dict[str, Dict[str, Any]] = {}


def get_cached_quiz(room_code: str) -> Optional[Dict[str, Any]]:
    """Возвращает закэшированный снимок сессии по коду комнаты."""
    return _quiz_cache.get(room_code)


def cache_quiz(room_code: str, quiz_id: int, questions_data: list, total_questions: int) -> None:
    """Сохраняет в кэш минимальные данные, нужные для повторного поиска сессии."""
    _quiz_cache[room_code] = {
        "id": quiz_id,
        "questions_data": questions_data,
        "total_questions": total_questions,
    }
    logger.debug("Quiz cached  room=%s  id=%s", room_code, quiz_id)


def invalidate_quiz(room_code: str) -> None:
    """Удаляет сессию из кэша, когда локальная копия могла устареть."""
    if _quiz_cache.pop(room_code, None) is not None:
        logger.debug("Quiz cache invalidated  room=%s", room_code)
