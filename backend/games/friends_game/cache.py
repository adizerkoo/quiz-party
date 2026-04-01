"""Кэш активных игровых сессий с Redis-поддержкой и in-memory fallback."""

from __future__ import annotations

import json
import logging
from typing import Any

from backend.app.redis_client import get_redis


logger = logging.getLogger(__name__)

_REDIS_PREFIX = "qp:quiz_cache:"
_REDIS_TTL = 3600  # 1 hour

# Локальный dict остаётся как L1-кэш (быстрый путь) и fallback без Redis.
_quiz_cache: dict[str, dict[str, Any]] = {}


def get_cached_quiz(room_code: str) -> dict[str, Any] | None:
    """Возвращает закэшированный снимок сессии по коду комнаты."""
    local = _quiz_cache.get(room_code)
    if local is not None:
        return local

    r = get_redis()
    if r is not None:
        try:
            raw = r.get(f"{_REDIS_PREFIX}{room_code}")
            if raw:
                data = json.loads(raw)
                _quiz_cache[room_code] = data
                return data
        except Exception:
            logger.debug("Redis get failed for quiz cache  room=%s", room_code)

    return None


def cache_quiz(room_code: str, quiz_id: int, questions_data: list, total_questions: int) -> None:
    """Сохраняет в кэш минимальные данные, нужные для повторного поиска сессии."""
    data = {
        "id": quiz_id,
        "questions_data": questions_data,
        "total_questions": total_questions,
    }
    _quiz_cache[room_code] = data

    r = get_redis()
    if r is not None:
        try:
            r.set(f"{_REDIS_PREFIX}{room_code}", json.dumps(data), ex=_REDIS_TTL)
        except Exception:
            logger.debug("Redis set failed for quiz cache  room=%s", room_code)

    logger.debug("Quiz cached  room=%s  id=%s", room_code, quiz_id)


def invalidate_quiz(room_code: str) -> None:
    """Удаляет сессию из кэша, когда локальная копия могла устареть."""
    removed = _quiz_cache.pop(room_code, None)

    r = get_redis()
    if r is not None:
        try:
            r.delete(f"{_REDIS_PREFIX}{room_code}")
        except Exception:
            logger.debug("Redis delete failed for quiz cache  room=%s", room_code)

    if removed is not None:
        logger.debug("Quiz cache invalidated  room=%s", room_code)
