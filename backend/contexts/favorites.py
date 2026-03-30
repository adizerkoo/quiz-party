"""Сервисы bounded context `favorites` для question bank."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..logging_config import log_event
from ..service_core import normalize_answer
from .library import (
    _question_payload_to_bank_fields,
    _serialize_bank_question,
    _user_can_access_bank_question,
    build_question_fingerprint,
    build_question_preview,
    list_library_questions,
)

logger = logging.getLogger(__name__)


def list_favorite_questions(
    db: Session,
    *,
    user: models.User,
    category: str | None = None,
    search: str | None = None,
    origin_screen: schemas.OriginScreen | None = None,
) -> list[dict]:
    """Возвращает favorite-вопросы пользователя в UI-контракте библиотеки."""
    payload = list_library_questions(
        db,
        scope="favorites",
        user=user,
        category=category,
        search=search,
        origin_screen=origin_screen,
    )
    log_event(
        logger,
        logging.INFO,
        "favorites.fetch",
        "Favorite questions fetched",
        user_id=user.id,
        category=(category or "").strip() or None,
        search=(search or "").strip() or None,
        result_count=len(payload),
        origin_screen=origin_screen,
    )
    return payload


def _find_existing_private_bank_question(
    db: Session,
    *,
    user: models.User,
    question_payload: dict,
) -> models.QuestionBankQuestion | None:
    """Ищет уже существующий private-вопрос пользователя с тем же содержимым."""
    normalized = _question_payload_to_bank_fields(question_payload)
    candidates = (
        db.query(models.QuestionBankQuestion)
        .options(selectinload(models.QuestionBankQuestion.options))
        .filter(
            models.QuestionBankQuestion.owner_id == user.id,
            models.QuestionBankQuestion.origin == "user",
            models.QuestionBankQuestion.visibility == "private",
            models.QuestionBankQuestion.status == "active",
            models.QuestionBankQuestion.kind == normalized["kind"],
            models.QuestionBankQuestion.text == normalized["text"],
            models.QuestionBankQuestion.correct_answer_text
            == normalized["correct_answer_text"],
        )
        .all()
    )
    expected_options = normalized["options"]
    for candidate in candidates:
        existing_options = [option.option_text for option in candidate.options]
        if existing_options == expected_options:
            return candidate
    return None


def add_favorite_question(
    db: Session,
    *,
    user: models.User,
    source_question_public_id: str | None = None,
    question_payload: dict | None = None,
    origin_screen: schemas.OriginScreen | None = None,
) -> dict:
    """Добавляет existing question в favorites или создаёт private reusable question."""
    question: models.QuestionBankQuestion | None = None

    if source_question_public_id:
        question = (
            db.query(models.QuestionBankQuestion)
            .options(
                selectinload(models.QuestionBankQuestion.options),
                selectinload(models.QuestionBankQuestion.category),
            )
            .filter(models.QuestionBankQuestion.public_id == source_question_public_id)
            .first()
        )
        if (
            question is None
            or question.status != "active"
            or not _user_can_access_bank_question(question, user=user)
        ):
            raise ValueError("Question not found")

        favorite = (
            db.query(models.UserFavoriteQuestion)
            .filter(
                models.UserFavoriteQuestion.user_id == user.id,
                models.UserFavoriteQuestion.question_id == question.id,
            )
            .first()
        )
        if favorite is None:
            favorite = models.UserFavoriteQuestion(user=user, question=question)
            db.add(favorite)

        log_event(
            logger,
            logging.INFO,
            "favorites.add.existing",
            "Existing question added to favorites",
            user_id=user.id,
            question_public_id=question.public_id,
            source=question.origin,
            origin_screen=origin_screen,
        )
        return _serialize_bank_question(question, is_favorite=True)

    if question_payload is None:
        raise ValueError("Question payload is required")

    existing_private_question = _find_existing_private_bank_question(
        db,
        user=user,
        question_payload=question_payload,
    )
    if existing_private_question is not None:
        question = existing_private_question
    else:
        normalized = _question_payload_to_bank_fields(question_payload)
        fingerprint = build_question_fingerprint(
            text=normalized["text"],
            kind=normalized["kind"],
            correct_answer_text=normalized["correct_answer_text"],
            options=normalized["options"],
        )
        question = models.QuestionBankQuestion(
            owner=user,
            category=None,
            origin="user",
            visibility="private",
            status="active",
            text=normalized["text"],
            kind=normalized["kind"],
            correct_answer_text=normalized["correct_answer_text"],
            question_metadata={
                "created_from": "favorite_custom_draft",
                "origin_screen": origin_screen,
                "fingerprint": fingerprint,
            },
        )
        db.add(question)
        db.flush()

        for position, option_text in enumerate(normalized["options"], start=1):
            db.add(
                models.QuestionBankOption(
                    question=question,
                    position=position,
                    option_text=option_text,
                    is_correct=normalize_answer(option_text)
                    == normalize_answer(normalized["correct_answer_text"]),
                )
            )

    favorite = (
        db.query(models.UserFavoriteQuestion)
        .filter(
            models.UserFavoriteQuestion.user_id == user.id,
            models.UserFavoriteQuestion.question_id == question.id,
        )
        .first()
    )
    if favorite is None:
        db.add(models.UserFavoriteQuestion(user=user, question=question))

    db.flush()
    db.refresh(question)
    log_event(
        logger,
        logging.INFO,
        "favorites.add.custom",
        "Custom favorite question saved",
        user_id=user.id,
        question_public_id=question.public_id,
        source=question.origin,
        origin_screen=origin_screen,
        question_preview=build_question_preview(question.text),
    )
    return _serialize_bank_question(question, is_favorite=True)


def remove_favorite_question(
    db: Session,
    *,
    user: models.User,
    question_public_id: str,
    origin_screen: schemas.OriginScreen | None = None,
) -> bool:
    """Удаляет вопрос из favorites пользователя, не трогая сам bank record."""
    favorite = (
        db.query(models.UserFavoriteQuestion)
        .join(models.QuestionBankQuestion)
        .filter(
            models.UserFavoriteQuestion.user_id == user.id,
            models.QuestionBankQuestion.public_id == question_public_id,
        )
        .first()
    )
    if favorite is None:
        return False

    db.delete(favorite)
    log_event(
        logger,
        logging.INFO,
        "favorites.remove",
        "Favorite question removed",
        user_id=user.id,
        question_public_id=question_public_id,
        origin_screen=origin_screen,
    )
    return True


__all__ = [
    "add_favorite_question",
    "list_favorite_questions",
    "remove_favorite_question",
]
