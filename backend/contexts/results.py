"""Сервисы bounded context `results` и игровой истории."""

from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..service_core import DEFAULT_EMOJI, serialize_quiz_questions


def sort_result_players(players: Iterable[models.Player]) -> list[models.Player]:
    """Собирает финальный leaderboard без хоста и kicked/left-участников."""
    return [
        participant
        for participant in sorted(
            players,
            key=lambda entry: (-entry.score, entry.joined_at, entry.id),
        )
        if not participant.is_host and participant.status not in {"kicked", "left"}
    ]


def compute_dense_ranks(players: Iterable[models.Player]) -> dict[int, int]:
    """Вычисляет плотные ранги: 1, 1, 2, 3 вместо 1, 1, 3, 4."""
    ranks: dict[int, int] = {}
    current_rank = 0
    previous_score: int | None = None

    for participant in players:
        if previous_score is None or participant.score != previous_score:
            current_rank += 1
            previous_score = participant.score
        ranks[participant.id] = current_rank

    return ranks


def assign_final_ranks(players: Iterable[models.Player]) -> dict[int, int]:
    """Проставляет `final_rank` участникам в уже отсортированном leaderboard."""
    ranked_players = list(players)
    ranks = compute_dense_ranks(ranked_players)
    for participant in ranked_players:
        participant.final_rank = ranks.get(participant.id)
    return ranks


def build_results_payload(players: Iterable[models.Player]) -> list[dict]:
    """Преобразует участников в payload экрана итоговых результатов."""
    ranked_players = list(players)
    fallback_ranks = compute_dense_ranks(ranked_players)
    payload = []
    for participant in ranked_players:
        payload.append(
            {
                "name": participant.name,
                "score": participant.score,
                "final_rank": participant.final_rank or fallback_ranks.get(participant.id),
                "emoji": participant.emoji or DEFAULT_EMOJI,
                "answers": participant.answers_history,
                "answer_times": participant.answer_times,
            }
        )
    return payload


def get_result_winners(results: Iterable[dict]) -> list[dict]:
    """Возвращает победителей из унифицированного payload итогов."""
    rows = list(results)
    if not rows:
        return []

    has_persisted_ranks = any(isinstance(item.get("final_rank"), int) for item in rows)
    if has_persisted_ranks:
        return [item for item in rows if item.get("final_rank") == 1]

    max_score = max(int(item.get("score") or 0) for item in rows)
    if max_score <= 0:
        return []

    return [item for item in rows if int(item.get("score") or 0) == max_score]


def validate_results_snapshot(snapshot: object) -> dict | None:
    """Проверяет сохранённый `results_snapshot` и нормализует его к UI-контракту."""
    if not snapshot:
        return None

    try:
        normalized = schemas.QuizResultsSnapshot.model_validate(snapshot)
    except Exception:
        return None

    payload = normalized.model_dump(mode="python")
    if not isinstance(snapshot, dict):
        return payload

    raw_results = snapshot.get("results")
    if isinstance(raw_results, list):
        for raw_row, normalized_row in zip(raw_results, payload.get("results", [])):
            if not isinstance(raw_row, dict):
                continue
            for key in list(normalized_row.keys()):
                if normalized_row.get(key) is None and key not in raw_row:
                    normalized_row.pop(key, None)

    raw_questions = snapshot.get("questions")
    if isinstance(raw_questions, list):
        for raw_question, normalized_question in zip(
            raw_questions,
            payload.get("questions", []),
        ):
            if not isinstance(raw_question, dict):
                continue
            for key in list(normalized_question.keys()):
                if normalized_question.get(key) is None and key not in raw_question:
                    normalized_question.pop(key, None)

    return payload


def build_results_snapshot_payload(quiz: models.Quiz) -> dict:
    """Строит snapshot итогов напрямую из текущего ORM-графа."""
    players = sort_result_players(quiz.players)
    return schemas.QuizResultsSnapshot.model_validate(
        {
            "results": build_results_payload(players),
            "questions": serialize_quiz_questions(quiz, include_correct=True),
        }
    ).model_dump(mode="python")


def resolve_results_snapshot_payload(quiz: models.Quiz) -> dict:
    """Возвращает snapshot итогов, а при его поломке собирает payload заново."""
    snapshot = validate_results_snapshot(quiz.results_snapshot)
    if snapshot is not None:
        return snapshot
    return build_results_snapshot_payload(quiz)


def build_quiz_results_response(quiz: models.Quiz) -> dict:
    """Собирает единый API-ответ итогов для web/mobile клиентов."""
    snapshot = resolve_results_snapshot_payload(quiz)
    return schemas.QuizResultsResponse.model_validate(
        {
            "code": quiz.code,
            "title": quiz.title,
            "status": quiz.status,
            "started_at": quiz.started_at,
            "finished_at": quiz.finished_at,
            "total_questions": quiz.total_questions,
            "questions": snapshot["questions"],
            "results": snapshot["results"],
        }
    ).model_dump(mode="python", exclude_unset=True)


def get_quiz_winner_names(quiz: models.Quiz) -> list[str]:
    """Возвращает имена победителей через тот же snapshot-first контракт итогов."""
    snapshot = resolve_results_snapshot_payload(quiz)
    return [
        str(item.get("name"))
        for item in get_result_winners(snapshot["results"])
        if item.get("name")
    ]


def get_quiz_history_sort_key(quiz: models.Quiz):
    """Возвращает самый свежий значимый timestamp для сортировки истории."""
    return (
        quiz.finished_at
        or quiz.cancelled_at
        or quiz.started_at
        or quiz.last_activity_at
        or quiz.created_at
    )


def list_user_history(db: Session, *, user_id: int) -> list[dict]:
    """Возвращает историю finished/cancelled игр пользователя, начиная с новых."""
    participants = (
        db.query(models.Player)
        .options(
            selectinload(models.Player.quiz).selectinload(models.Quiz.template),
            selectinload(models.Player.quiz)
            .selectinload(models.Quiz.players)
            .selectinload(models.Player.answers)
            .selectinload(models.ParticipantAnswer.selected_option),
        )
        .filter(models.Player.user_id == user_id)
        .all()
    )

    entries: list[tuple[object, dict]] = []
    for participant in participants:
        quiz = participant.quiz
        if quiz is None or quiz.status not in {"finished", "cancelled"}:
            continue

        winner_names = get_quiz_winner_names(quiz) if quiz.status == "finished" else []
        template = quiz.template
        is_host_game = participant.is_host or quiz.owner_id == user_id
        can_repeat = bool(
            is_host_game
            and template is not None
            and template.owner_id == user_id
            and template.public_id
        )
        payload = schemas.UserHistoryEntry.model_validate(
            {
                "quiz_code": quiz.code,
                "title": quiz.title,
                "started_at": quiz.started_at,
                "finished_at": quiz.finished_at,
                "game_status": quiz.status,
                "cancel_reason": quiz.cancel_reason,
                "participant_status": participant.status,
                "score": participant.score,
                "final_rank": participant.final_rank,
                "is_winner": participant.final_rank == 1,
                "winner_names": winner_names,
                "can_open_results": quiz.status == "finished",
                "template_public_id": template.public_id if template else None,
                "is_host_game": is_host_game,
                "can_repeat": can_repeat,
            }
        ).model_dump(mode="python")
        entries.append((get_quiz_history_sort_key(quiz), payload))

    entries.sort(key=lambda item: item[0], reverse=True)
    return [payload for _, payload in entries]


__all__ = [
    "assign_final_ranks",
    "build_quiz_results_response",
    "build_results_payload",
    "build_results_snapshot_payload",
    "compute_dense_ranks",
    "get_quiz_history_sort_key",
    "get_quiz_winner_names",
    "get_result_winners",
    "list_user_history",
    "resolve_results_snapshot_payload",
    "sort_result_players",
    "validate_results_snapshot",
]
