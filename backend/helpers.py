"""
Вспомогательные функции для работы с БД.

Объединяет часто используемые запросы: поиск викторины, проверка хоста,
получение списка игроков.
"""

import logging
from sqlalchemy.orm import Session
from . import models
from .cache import get_cached_quiz, cache_quiz, invalidate_quiz

logger = logging.getLogger(__name__)


def get_quiz_by_code(db: Session, room_code: str):
    """Находит викторину по коду комнаты. Использует in-memory кэш для ускорения."""
    cached = get_cached_quiz(room_code)
    if cached:
        quiz = db.get(models.Quiz, cached["id"])
        if quiz:
            return quiz
        invalidate_quiz(room_code)

    quiz = db.query(models.Quiz).filter(models.Quiz.code == room_code).first()
    if quiz:
        cache_quiz(room_code, quiz.id, quiz.questions_data, quiz.total_questions)
    return quiz


def verify_host(db: Session, quiz_id: int, sid: str) -> bool:
    """Проверяет, принадлежит ли данный socket sid хосту (ведущему) викторины."""
    return db.query(models.Player).filter(
        models.Player.quiz_id == quiz_id,
        models.Player.sid == sid,
        models.Player.is_host == True
    ).first() is not None


def get_players_in_quiz(db: Session, quiz_id: int):
    """Возвращает список игроков викторины в формате словарей для фронтенда."""
    players = db.query(models.Player).filter(models.Player.quiz_id == quiz_id).all()
    logger.debug("get_players_in_quiz  quiz_id=%s  count=%d", quiz_id, len(players))
    return [
        {
            "name": p.name,
            "is_host": p.is_host,
            "score": p.score,
            "emoji": p.emoji or "👤",
            "answers_history": p.answers_history or {},
            "scores_history": p.scores_history or {}
        } for p in players
    ]
