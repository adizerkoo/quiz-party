"""Ленивая инициализация Redis-клиента для Quiz Party backend.

Если REDIS_URL не задан или Redis недоступен, все функции возвращают None,
и потребители автоматически переключаются на in-memory fallback.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_redis_initialized = False
_redis_client = None


def get_redis():
    """Возвращает подключённый Redis-клиент или None, если Redis не настроен."""
    global _redis_initialized, _redis_client

    if _redis_initialized:
        return _redis_client

    _redis_initialized = True
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        logger.info("REDIS_URL is not set, using in-memory fallback for cache and runtime state")
        return None

    try:
        import redis

        client = redis.Redis.from_url(redis_url, decode_responses=True)
        client.ping()
        _redis_client = client
        masked = redis_url.split("@")[-1] if "@" in redis_url else redis_url
        logger.info("Redis connected: %s", masked)
        return client
    except Exception:
        logger.warning(
            "Redis is not available at %s, falling back to in-memory storage",
            redis_url,
            exc_info=True,
        )
        return None


def reset_redis_client() -> None:
    """Сбрасывает кэшированное состояние клиента (используется в тестах)."""
    global _redis_initialized, _redis_client
    _redis_initialized = False
    _redis_client = None
