"""In-memory cache for active quizzes (room_code → quiz data)."""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# room_code → {"id": int, "questions_data": list, "total_questions": int}
_quiz_cache: Dict[str, Dict[str, Any]] = {}


def get_cached_quiz(room_code: str) -> Optional[Dict[str, Any]]:
    """Return cached quiz data or None."""
    return _quiz_cache.get(room_code)


def cache_quiz(room_code: str, quiz_id: int, questions_data: list, total_questions: int) -> None:
    """Store quiz data in cache."""
    _quiz_cache[room_code] = {
        "id": quiz_id,
        "questions_data": questions_data,
        "total_questions": total_questions,
    }
    logger.debug("Quiz cached  room=%s  id=%s", room_code, quiz_id)


def invalidate_quiz(room_code: str) -> None:
    """Remove quiz from cache."""
    if _quiz_cache.pop(room_code, None) is not None:
        logger.debug("Quiz cache invalidated  room=%s", room_code)
