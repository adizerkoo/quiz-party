"""Сервисы bounded context `library` для question bank и repeat draft."""

from __future__ import annotations

from hashlib import sha256
import json
import logging
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session, selectinload

from backend.app.config import DATA_PATH
from backend.app.logging_config import log_event
from backend.platform.content import models, schemas
from backend.platform.identity import models as identity_models
from backend.shared.utils import normalize_answer

logger = logging.getLogger(__name__)


QUESTION_PREVIEW_LIMIT = 80
SYSTEM_LIBRARY_SEED_SOURCE = "questions.json"
SYSTEM_LIBRARY_CATEGORY_SPECS = [
    ("about-me", "Обо мне", 10),
    ("funny", "Юмор", 20),
    ("music", "Музыка", 30),
    ("sports", "Спорт", 40),
    ("movie", "Фильмы", 50),
    ("friends", "О нас", 60),
]
SYSTEM_LIBRARY_CATEGORY_MAP = {
    slug: {"title": title, "sort_order": sort_order}
    for slug, title, sort_order in SYSTEM_LIBRARY_CATEGORY_SPECS
}
SYSTEM_LIBRARY_CATEGORY_ALIASES = {
    "frilivesends": "friends",
}


def build_question_preview(
    text: str | None,
    *,
    limit: int = QUESTION_PREVIEW_LIMIT,
) -> str | None:
    """Возвращает короткий безопасный preview вопроса для логов."""
    if not text:
        return None
    normalized = " ".join(str(text).split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(limit - 1, 1)]}…"


def _normalize_question_options(options: Iterable[str] | None) -> list[str]:
    """Нормализует список option-строк для хранения и сравнения."""
    return [str(option or "").strip() for option in (options or [])]


def build_question_fingerprint(
    *,
    text: str,
    kind: str,
    correct_answer_text: str,
    options: Iterable[str] | None,
) -> str:
    """Строит детерминированный fingerprint переиспользуемого вопроса."""
    payload = {
        "text": str(text).strip(),
        "kind": str(kind).strip(),
        "correct": str(correct_answer_text).strip(),
        "options": _normalize_question_options(options),
    }
    return sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _question_matches_search(
    question: models.QuestionBankQuestion,
    search: str | None,
) -> bool:
    """Проверяет, попадает ли вопрос в search-фильтр библиотеки."""
    if not search:
        return True

    normalized_search = search.strip().lower()
    if not normalized_search:
        return True

    haystack = [
        question.text,
        question.correct_answer_text,
        *(option.option_text for option in question.options),
    ]
    return any(normalized_search in (value or "").lower() for value in haystack)


def _serialize_bank_question(
    question: models.QuestionBankQuestion,
    *,
    is_favorite: bool,
) -> dict:
    """Сериализует строку question bank в единый API-контракт."""
    options = [option.option_text for option in question.options] or None
    return schemas.LibraryQuestionResponse(
        public_id=question.public_id,
        text=question.text,
        type=question.kind,
        correct=question.correct_answer_text,
        options=options,
        source_question_public_id=question.public_id,
        source=question.origin,
        visibility=question.visibility,
        category_slug=question.category.slug if question.category else None,
        category_title=question.category.title if question.category else None,
        is_favorite=is_favorite,
        created_at=question.created_at,
        updated_at=question.updated_at,
    ).model_dump(mode="python")


def _serialize_template_question(question: models.QuizQuestion) -> dict:
    """Сериализует вопрос шаблона для repeat/edit экрана."""
    return schemas.QuestionSchema(
        text=question.text,
        type=question.kind,
        correct=question.correct_answer_text,
        options=[option.option_text for option in question.options] or None,
        source_question_public_id=(
            question.source_question.public_id if question.source_question else None
        ),
    ).model_dump(mode="python")


def _normalize_incoming_question_payload(question_payload: dict) -> dict:
    """Приводит incoming payload вопроса к предсказуемой внутренней форме."""
    normalized = {
        "text": str(question_payload.get("text") or "").strip(),
        "type": str(question_payload.get("type") or "").strip(),
        "correct": str(question_payload.get("correct") or "").strip(),
        "options": _normalize_question_options(question_payload.get("options")),
    }
    if normalized["type"] == "text":
        normalized["options"] = []
    return normalized


def _question_payload_to_bank_fields(question_payload: dict) -> dict:
    """Преобразует API-представление вопроса в поля question bank."""
    normalized = _normalize_incoming_question_payload(question_payload)
    return {
        "text": normalized["text"],
        "kind": normalized["type"],
        "correct_answer_text": normalized["correct"],
        "options": normalized["options"],
    }


def _user_can_access_bank_question(
    question: models.QuestionBankQuestion,
    *,
    user: identity_models.User | None,
) -> bool:
    """Проверяет, имеет ли пользователь доступ к строке question bank."""
    if question.visibility == "public":
        return True
    if user is None:
        return False
    return question.owner_id == user.id


def ensure_system_question_bank_seed(db: Session) -> None:
    """Идемпотентно импортирует системные вопросы из `questions.json` в БД."""
    source_path = Path(DATA_PATH) / SYSTEM_LIBRARY_SEED_SOURCE
    log_event(
        logger,
        logging.INFO,
        "library.seed.started",
        "System question bank seed started",
        source="system",
        seed_file=str(source_path),
    )

    try:
        raw_payload = json.loads(source_path.read_text(encoding="utf-8"))
    except Exception:
        log_event(
            logger,
            logging.ERROR,
            "library.seed.failed",
            "System question bank seed failed while reading source file",
            source="system",
            seed_file=str(source_path),
            exc_info=True,
        )
        raise

    categories_by_slug = {
        category.slug: category
        for category in db.query(models.QuestionCategory).all()
    }
    for slug, spec in SYSTEM_LIBRARY_CATEGORY_MAP.items():
        if slug in categories_by_slug:
            continue
        category = models.QuestionCategory(
            slug=slug,
            title=spec["title"],
            sort_order=spec["sort_order"],
            is_active=True,
        )
        db.add(category)
        db.flush()
        categories_by_slug[slug] = category

    existing_system_fingerprints = {
        str((question.question_metadata or {}).get("seed_fingerprint"))
        for question in (
            db.query(models.QuestionBankQuestion)
            .filter(models.QuestionBankQuestion.origin == "system")
            .all()
        )
        if (question.question_metadata or {}).get("seed_fingerprint")
    }

    inserted_count = 0
    skipped_count = 0
    invalid_count = 0
    seen_fingerprints: set[str] = set()

    for raw_question in raw_payload if isinstance(raw_payload, list) else []:
        try:
            normalized = _normalize_incoming_question_payload(raw_question or {})
            if (
                normalized["type"] not in {"text", "options"}
                or not normalized["text"]
                or not normalized["correct"]
            ):
                invalid_count += 1
                continue

            if normalized["type"] == "options":
                if len(normalized["options"]) < 2:
                    invalid_count += 1
                    continue
                if normalized["correct"] not in normalized["options"]:
                    normalized["options"].append(normalized["correct"])

            fingerprint = build_question_fingerprint(
                text=normalized["text"],
                kind=normalized["type"],
                correct_answer_text=normalized["correct"],
                options=normalized["options"],
            )
            if fingerprint in seen_fingerprints or fingerprint in existing_system_fingerprints:
                skipped_count += 1
                continue
            seen_fingerprints.add(fingerprint)

            raw_category = str(raw_question.get("cat") or "").strip()
            normalized_category = SYSTEM_LIBRARY_CATEGORY_ALIASES.get(raw_category, raw_category)
            category = categories_by_slug.get(normalized_category) if normalized_category else None

            question = models.QuestionBankQuestion(
                owner=None,
                category=category,
                origin="system",
                visibility="public",
                status="active",
                text=normalized["text"],
                kind=normalized["type"],
                correct_answer_text=normalized["correct"],
                question_metadata={
                    "legacy_category_slug": raw_category or None,
                    "normalized_category_slug": normalized_category or None,
                    "seed_fingerprint": fingerprint,
                    "seed_source": SYSTEM_LIBRARY_SEED_SOURCE,
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
                        == normalize_answer(normalized["correct"]),
                    )
                )

            inserted_count += 1
        except Exception:
            invalid_count += 1

    log_event(
        logger,
        logging.INFO,
        "library.seed.completed",
        "System question bank seed completed",
        source="system",
        seed_file=str(source_path),
        inserted_count=inserted_count,
        skipped_count=skipped_count,
        invalid_count=invalid_count,
    )


def list_library_categories(db: Session) -> list[dict]:
    """Возвращает активные категории question bank в порядке для UI."""
    categories = (
        db.query(models.QuestionCategory)
        .filter(models.QuestionCategory.is_active.is_(True))
        .order_by(models.QuestionCategory.sort_order.asc(), models.QuestionCategory.title.asc())
        .all()
    )
    payload = [
        schemas.LibraryCategoryResponse.model_validate(category).model_dump(mode="python")
        for category in categories
    ]
    log_event(
        logger,
        logging.INFO,
        "library.categories.fetch",
        "Library categories fetched",
        scope="public",
        result_count=len(payload),
    )
    return payload


def _favorite_question_ids_for_user(db: Session, *, user_id: int | None) -> set[int]:
    """Возвращает set question_id, которые пользователь уже добавил в favorites."""
    if user_id is None:
        return set()

    return {
        question_id
        for (question_id,) in (
            db.query(models.UserFavoriteQuestion.question_id)
            .filter(models.UserFavoriteQuestion.user_id == user_id)
            .all()
        )
    }


def list_library_questions(
    db: Session,
    *,
    scope: schemas.LibraryScope,
    user: identity_models.User | None,
    category: str | None = None,
    search: str | None = None,
    origin_screen: schemas.OriginScreen | None = None,
) -> list[dict]:
    """Возвращает public или favorite строки question bank для экранов библиотеки."""
    normalized_category = (category or "").strip()
    normalized_search = (search or "").strip()

    query = (
        db.query(models.QuestionBankQuestion)
        .options(
            selectinload(models.QuestionBankQuestion.options),
            selectinload(models.QuestionBankQuestion.category),
        )
        .filter(models.QuestionBankQuestion.status == "active")
    )

    favorite_ids = _favorite_question_ids_for_user(db, user_id=getattr(user, "id", None))
    if scope == "favorites":
        if user is None:
            return []
        query = (
            query.join(models.UserFavoriteQuestion)
            .filter(models.UserFavoriteQuestion.user_id == user.id)
            .order_by(
                models.UserFavoriteQuestion.created_at.desc(),
                models.QuestionBankQuestion.created_at.desc(),
            )
        )
    else:
        query = query.filter(models.QuestionBankQuestion.visibility == "public").order_by(
            models.QuestionBankQuestion.created_at.desc(),
            models.QuestionBankQuestion.id.desc(),
        )

    questions = query.all()
    if normalized_category:
        questions = [
            question
            for question in questions
            if question.category is not None and question.category.slug == normalized_category
        ]
    if normalized_search:
        questions = [
            question
            for question in questions
            if _question_matches_search(question, normalized_search)
        ]

    if scope != "favorites":
        questions.sort(
            key=lambda question: (
                question.category.sort_order if question.category else 9999,
                question.created_at,
                question.id,
            ),
            reverse=False,
        )

    payload = [
        _serialize_bank_question(question, is_favorite=question.id in favorite_ids)
        for question in questions
    ]
    log_event(
        logger,
        logging.INFO,
        "library.questions.fetch",
        "Library questions fetched",
        user_id=getattr(user, "id", None),
        scope=scope,
        category=normalized_category or None,
        search=normalized_search or None,
        result_count=len(payload),
        origin_screen=origin_screen,
    )
    return payload


def get_template_draft_for_owner(
    db: Session,
    *,
    template_public_id: str,
    user: identity_models.User,
    origin_screen: schemas.OriginScreen | None = None,
) -> dict | None:
    """Возвращает draft шаблона для сценария repeat/edit владельца."""
    template = (
        db.query(models.QuizTemplate)
        .options(
            selectinload(models.QuizTemplate.questions).selectinload(models.QuizQuestion.options),
            selectinload(models.QuizTemplate.questions).selectinload(
                models.QuizQuestion.source_question
            ),
        )
        .filter(models.QuizTemplate.public_id == template_public_id)
        .first()
    )
    if template is None:
        return None

    if template.owner_id != user.id:
        log_event(
            logger,
            logging.WARNING,
            "repeat.request.denied",
            "Repeat request denied for template draft",
            user_id=user.id,
            template_public_id=template_public_id,
            origin_screen=origin_screen,
        )
        log_event(
            logger,
            logging.WARNING,
            "repeat.request.unauthorized",
            "Unauthorized repeat attempt detected",
            user_id=user.id,
            template_public_id=template_public_id,
            origin_screen=origin_screen,
        )
        raise PermissionError("Template draft access denied")

    payload = schemas.TemplateDraftResponse(
        template_public_id=template.public_id,
        title=template.title,
        total_questions=template.total_questions,
        questions=[_serialize_template_question(question) for question in template.questions],
    ).model_dump(mode="python")
    log_event(
        logger,
        logging.INFO,
        "repeat.request.allowed",
        "Repeat request allowed",
        user_id=user.id,
        template_public_id=template_public_id,
        origin_screen=origin_screen,
        result_count=len(payload["questions"]),
    )
    log_event(
        logger,
        logging.INFO,
        "template.draft.fetch",
        "Template draft fetched",
        user_id=user.id,
        template_public_id=template_public_id,
        origin_screen=origin_screen,
        result_count=len(payload["questions"]),
    )
    return payload


__all__ = [
    "QUESTION_PREVIEW_LIMIT",
    "SYSTEM_LIBRARY_CATEGORY_ALIASES",
    "SYSTEM_LIBRARY_CATEGORY_MAP",
    "SYSTEM_LIBRARY_CATEGORY_SPECS",
    "SYSTEM_LIBRARY_SEED_SOURCE",
    "build_question_fingerprint",
    "build_question_preview",
    "ensure_system_question_bank_seed",
    "get_template_draft_for_owner",
    "list_library_categories",
    "list_library_questions",
]
