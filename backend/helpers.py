from sqlalchemy.orm import Session
from . import models


def get_players_in_quiz(db: Session, quiz_id: int):
    players = db.query(models.Player).filter(models.Player.quiz_id == quiz_id).all()
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
