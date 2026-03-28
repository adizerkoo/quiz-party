"""Сервисные функции для работы с нормализованной схемой Quiz Party."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from hashlib import sha256
import json
import logging
from pathlib import Path
import secrets
from typing import Iterable

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, Query, object_session, selectinload

from . import models, schemas
from .config import DATA_PATH
from .logging_config import build_log_extra, log_event, log_game_event
from .runtime_state import connection_registry

logger = logging.getLogger(__name__)


DEFAULT_EMOJI = "👤"
RESUME_WINDOW = timedelta(minutes=10)
HOST_TIMEOUT = timedelta(minutes=15)
INACTIVITY_CANCEL_TIMEOUT = timedelta(minutes=30)
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


@dataclass(slots=True)
class QuizStateEvaluation:
    cancelled: bool
    cancel_reason: str | None
    just_cancelled: bool
    resume_window_expired: bool


@dataclass(slots=True)
class ResumeEligibility:
    room_code: str
    role: str
    title: str | None
    status: str | None
    can_resume: bool
    reason: str | None = None
    cancel_reason: str | None = None
    clear_credentials: bool = False


def build_question_preview(text: str | None, *, limit: int = QUESTION_PREVIEW_LIMIT) -> str | None:
    """Returns a short safe preview for logs without dumping the full question text."""
    if not text:
        return None
    normalized = " ".join(str(text).split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(limit - 1, 1)]}…"


def _normalize_question_options(options: Iterable[str] | None) -> list[str]:
    return [str(option or "").strip() for option in (options or [])]


def build_question_fingerprint(
    *,
    text: str,
    kind: str,
    correct_answer_text: str,
    options: Iterable[str] | None,
) -> str:
    """Builds a deterministic fingerprint for reusable questions."""
    payload = {
        "text": str(text).strip(),
        "kind": str(kind).strip(),
        "correct": str(correct_answer_text).strip(),
        "options": _normalize_question_options(options),
    }
    return sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _question_matches_search(question: models.QuestionBankQuestion, search: str | None) -> bool:
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
    return schemas.QuestionSchema(
        text=question.text,
        type=question.kind,
        correct=question.correct_answer_text,
        options=[option.option_text for option in question.options] or None,
        source_question_public_id=question.source_question.public_id if question.source_question else None,
    ).model_dump(mode="python")


def _normalize_incoming_question_payload(question_payload: dict) -> dict:
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
    user: models.User | None,
) -> bool:
    if question.visibility == "public":
        return True
    if user is None:
        return False
    return question.owner_id == user.id


def ensure_system_question_bank_seed(db: Session) -> None:
    """Idempotently imports developer questions from questions.json into the DB."""
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
                    "seed_source": SYSTEM_LIBRARY_SEED_SOURCE,
                    "seed_fingerprint": fingerprint,
                    "legacy_category_slug": raw_category or None,
                    "normalized_category_slug": normalized_category or None,
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
                        is_correct=normalize_answer(option_text) == normalize_answer(normalized["correct"]),
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


def hash_secret(secret: str) -> str:
    """Возвращает SHA-256 хэш секрета для хранения в БД."""
    return sha256(secret.encode("utf-8")).hexdigest()


def verify_secret(secret: str | None, secret_hash: str | None) -> bool:
    """Проверяет секрет против сохранённого хэша безопасным сравнением."""
    if not secret or not secret_hash:
        return False
    return secrets.compare_digest(hash_secret(secret), secret_hash)


def issue_secret() -> str:
    """Генерирует новый секрет для host token или reconnect token."""
    return secrets.token_urlsafe(24)


def load_quiz_graph(query: Query) -> Query:
    """Добавляет eager loading для типового графа игровой сессии."""
    return query.options(
        selectinload(models.Quiz.template)
        .selectinload(models.QuizTemplate.questions)
        .selectinload(models.QuizQuestion.options),
        selectinload(models.Quiz.players)
        .selectinload(models.Player.answers)
        .selectinload(models.ParticipantAnswer.selected_option),
        selectinload(models.Quiz.players).selectinload(models.Player.installation),
    )


def serialize_question(question: models.QuizQuestion, include_correct: bool) -> dict:
    """Преобразует вопрос ORM-модели в JSON-совместимый payload для API/socket."""
    payload = {
        "text": question.text,
        "type": question.kind,
    }
    options = [option.option_text for option in question.options] or None
    if options is not None:
        payload["options"] = options
    if include_correct:
        payload["correct"] = question.correct_answer_text
    return payload


def serialize_quiz_questions(quiz: models.Quiz, include_correct: bool) -> list[dict]:
    """Сериализует все вопросы игровой сессии в клиентский формат."""
    return [
        serialize_question(question, include_correct=include_correct)
        for question in quiz.questions
    ]


def get_question_by_position(quiz: models.Quiz, position: int) -> models.QuizQuestion | None:
    """Ищет вопрос по порядковому номеру внутри шаблона/сессии."""
    for question in quiz.questions:
        if question.position == position:
            return question
    return None


@dataclass
class DevicePayload:
    platform: str | None = None
    device_family: str | None = None
    device_brand: str | None = None
    device_model: str | None = None
    browser: str | None = None
    browser_version: str | None = None
    app_version: str | None = None
    installation_public_id: str | None = None
    client_installation_key: str | None = None

    @classmethod
    def from_socket(cls, data: dict) -> "DevicePayload":
        """Собирает сведения об устройстве из socket payload."""
        return cls(
            platform=data.get("device_platform") or data.get("platform") or data.get("device"),
            device_family=data.get("device"),
            device_brand=data.get("device_brand"),
            device_model=data.get("device_model"),
            browser=data.get("browser"),
            browser_version=data.get("browser_version"),
            app_version=data.get("app_version"),
            installation_public_id=data.get("installation_public_id"),
            client_installation_key=data.get("client_installation_key"),
        )

    @classmethod
    def from_api(cls, platform: str | None, brand: str | None, installation_public_id: str | None = None) -> "DevicePayload":
        """Собирает минимальный device payload из HTTP API запроса."""
        return cls(
            platform=platform,
            device_brand=brand,
            installation_public_id=installation_public_id,
        )

    def has_signal(self) -> bool:
        """Проверяет, содержит ли payload хоть какие-то полезные device/installation данные."""
        return any(
            [
                self.platform,
                self.device_family,
                self.device_brand,
                self.device_model,
                self.browser,
                self.browser_version,
                self.app_version,
                self.installation_public_id,
                self.client_installation_key,
            ]
        )


def ensure_installation(
    db: Session,
    *,
    user: models.User | None,
    device: DevicePayload,
) -> models.UserInstallation | None:
    """Находит или создаёт installation/device запись пользователя.

    Приоритет поиска такой:
    1. Явный `installation_public_id`.
    2. Клиентский installation key.
    3. Похожая установка того же пользователя по platform/brand.
    """
    if not device.has_signal():
        return None

    installation = None
    if device.installation_public_id:
        # Самый надёжный способ связать клиента со старой установкой.
        installation = (
            db.query(models.UserInstallation)
            .filter(models.UserInstallation.public_id == device.installation_public_id)
            .first()
        )

    if installation is None and device.client_installation_key:
        # Дополнительный lookup для клиентов, у которых есть свой локальный installation key.
        installation = (
            db.query(models.UserInstallation)
            .filter(models.UserInstallation.client_installation_key == device.client_installation_key)
            .first()
        )

    if installation is None and user is not None:
        # Последний мягкий fallback для старых клиентов без стабильного installation id.
        installation = (
            db.query(models.UserInstallation)
            .filter(
                models.UserInstallation.user_id == user.id,
                models.UserInstallation.platform == (device.platform or "unknown"),
                models.UserInstallation.device_brand == device.device_brand,
            )
            .order_by(models.UserInstallation.last_seen_at.desc(), models.UserInstallation.id.desc())
            .first()
        )

    if installation is None:
        installation = models.UserInstallation(
            user=user,
            public_id=device.installation_public_id or models._public_id(),
            client_installation_key=device.client_installation_key,
        )
        db.add(installation)

    installation.user = user
    if device.installation_public_id:
        # Если клиент уже прислал внешний installation id, считаем его source of truth.
        installation.public_id = device.installation_public_id
    installation.platform = device.platform or installation.platform or "unknown"
    installation.device_family = device.device_family or installation.device_family
    installation.device_brand = device.device_brand or installation.device_brand
    installation.device_model = device.device_model or installation.device_model
    installation.browser = device.browser or installation.browser
    installation.browser_version = device.browser_version or installation.browser_version
    installation.app_version = device.app_version or installation.app_version
    installation.last_seen_at = models._utc_now()
    if device.client_installation_key:
        installation.client_installation_key = device.client_installation_key
    if user is not None:
        user.device_platform = installation.platform
        user.device_brand = installation.device_brand
    return installation


def build_participant_payload(participant: models.Player) -> dict:
    """Строит socket/API payload участника в совместимом с legacy клиентами виде."""
    return {
        "name": participant.name,
        "is_host": participant.is_host,
        "score": participant.score,
        "emoji": participant.emoji or DEFAULT_EMOJI,
        "answers_history": participant.answers_history,
        "scores_history": participant.scores_history,
        "answer_times": participant.answer_times,
        "connected": connection_registry.is_connected(participant.id),
    }


def sort_result_players(players: Iterable[models.Player]) -> list[models.Player]:
    """Собирает финальный leaderboard без хоста и kicked-участников."""
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
    """Returns winner rows from the unified results contract."""
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
    """Validates persisted results_snapshot and normalizes it to the UI contract."""
    if not snapshot:
        return None

    try:
        normalized = schemas.QuizResultsSnapshot.model_validate(snapshot)
    except Exception:
        return None

    return normalized.model_dump(mode="python")


def build_results_snapshot_payload(quiz: models.Quiz) -> dict:
    """Builds a normalized snapshot body directly from the current DB graph."""
    players = sort_result_players(quiz.players)
    return schemas.QuizResultsSnapshot.model_validate(
        {
            "results": build_results_payload(players),
            "questions": serialize_quiz_questions(quiz, include_correct=True),
        }
    ).model_dump(mode="python")


def resolve_results_snapshot_payload(quiz: models.Quiz) -> dict:
    """Returns snapshot-first results payload, falling back to fresh DB assembly."""
    snapshot = validate_results_snapshot(quiz.results_snapshot)
    if snapshot is not None:
        return snapshot

    return build_results_snapshot_payload(quiz)


def build_quiz_results_response(quiz: models.Quiz) -> dict:
    """Builds the unified final-results response shared by every client."""
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
    ).model_dump(mode="python")


def get_quiz_winner_names(quiz: models.Quiz) -> list[str]:
    """Returns winner names using the same snapshot-first result source of truth."""
    snapshot = resolve_results_snapshot_payload(quiz)
    return [
        str(item.get("name"))
        for item in get_result_winners(snapshot["results"])
        if item.get("name")
    ]


def get_quiz_history_sort_key(quiz: models.Quiz):
    """Returns the freshest meaningful timestamp for history ordering."""
    return (
        quiz.finished_at
        or quiz.cancelled_at
        or quiz.started_at
        or quiz.last_activity_at
        or quiz.created_at
    )


def list_user_history(db: Session, *, user_id: int) -> list[dict]:
    """Returns profile history rows for one user, newest first."""
    participants = (
        db.query(models.Player)
        .options(
            selectinload(models.Player.quiz)
            .selectinload(models.Quiz.template),
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
        if quiz is None:
            continue
        if quiz.status not in {"finished", "cancelled"}:
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


def list_library_categories(db: Session) -> list[dict]:
    """Returns active reusable-question categories ordered for the UI."""
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
    user: models.User | None,
    category: str | None = None,
    search: str | None = None,
    origin_screen: schemas.OriginScreen | None = None,
) -> list[dict]:
    """Returns public or favorite question-bank rows for library screens."""
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
            .order_by(models.UserFavoriteQuestion.created_at.desc(), models.QuestionBankQuestion.created_at.desc())
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
        _serialize_bank_question(
            question,
            is_favorite=question.id in favorite_ids,
        )
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


def list_favorite_questions(
    db: Session,
    *,
    user: models.User,
    category: str | None = None,
    search: str | None = None,
    origin_screen: schemas.OriginScreen | None = None,
) -> list[dict]:
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
            models.QuestionBankQuestion.correct_answer_text == normalized["correct_answer_text"],
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
    """Adds an existing bank question to favorites or creates a private reusable one first."""
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
        if question is None or question.status != "active" or not _user_can_access_bank_question(question, user=user):
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
                    is_correct=normalize_answer(option_text) == normalize_answer(normalized["correct_answer_text"]),
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


def get_template_draft_for_owner(
    db: Session,
    *,
    template_public_id: str,
    user: models.User,
    origin_screen: schemas.OriginScreen | None = None,
) -> dict | None:
    template = (
        db.query(models.QuizTemplate)
        .options(
            selectinload(models.QuizTemplate.questions)
            .selectinload(models.QuizQuestion.options),
            selectinload(models.QuizTemplate.questions)
            .selectinload(models.QuizQuestion.source_question),
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


def refresh_participant_score(participant: models.Player) -> int:
    """Пересчитывает суммарный счёт участника по его answer records."""
    participant.score = sum(answer.awarded_points or 0 for answer in participant.answers)
    return participant.score


def normalize_answer(value: str) -> str:
    """Нормализует ответ для case-insensitive сравнения."""
    return value.strip().lower()


def find_option_for_answer(question: models.QuizQuestion, answer_text: str) -> models.QuizQuestionOption | None:
    """Ищет option-строку, соответствующую присланному ответу."""
    normalized = normalize_answer(answer_text)
    for option in question.options:
        if normalize_answer(option.option_text) == normalized:
            return option
    return None


def upsert_answer(
    *,
    participant: models.Player,
    quiz: models.Quiz,
    question: models.QuizQuestion,
    answer_text: str | None,
    answer_time_seconds: float | None,
    submitted_at=None,
) -> tuple[models.ParticipantAnswer, bool]:
    """Создаёт или обновляет ответ участника на конкретный вопрос.

    Возвращает сам answer record и флаг `created`, чтобы вызывающий код мог
    при необходимости различать первый ответ и повторную запись.
    """
    answer = next((item for item in participant.answers if item.question_id == question.id), None)
    created = False
    if answer is None:
        answer = models.ParticipantAnswer(
            participant=participant,
            quiz_id=quiz.id,
            question=question,
            question_position=question.position,
        )
        session = object_session(participant)
        if session is not None:
            session.add(answer)
        created = True

    # Одно место истины для текущего состояния ответа:
    # текст, выбранная опция, время ответа, автопроверка и очки.
    answer.answer_text = answer_text
    answer.selected_option = find_option_for_answer(question, answer_text or "")
    answer.submitted_at = submitted_at or models._utc_now()
    answer.answer_time_seconds = answer_time_seconds
    if answer_text is not None:
        answer.is_correct = normalize_answer(answer_text) == normalize_answer(question.correct_answer_text)
    else:
        answer.is_correct = False
    answer.awarded_points = question.points if answer.is_correct else 0
    answer.evaluation_status = "auto"
    refresh_participant_score(participant)
    return answer, created


def apply_score_override(
    *,
    quiz: models.Quiz,
    participant: models.Player,
    question: models.QuizQuestion,
    desired_points: int,
    created_by: models.Player | None,
) -> models.ScoreAdjustment | None:
    """Применяет ручную корректировку очков от хоста.

    Если answer record ещё не существует, функция создаёт его, чтобы ручная
    модерация не зависела от факта отправки ответа клиентом.
    """
    answer = next((item for item in participant.answers if item.question_id == question.id), None)
    if answer is None:
        answer = models.ParticipantAnswer(
            participant=participant,
            quiz_id=quiz.id,
            question=question,
            question_position=question.position,
            answer_text=None,
            submitted_at=models._utc_now(),
            is_correct=bool(desired_points),
            awarded_points=max(desired_points, 0),
            evaluation_status="manual",
        )
        session = object_session(participant)
        if session is not None:
            session.add(answer)
        # Ручная оценка стартует с нуля, если автоматической оценки ещё не было.
        current_points = 0
    else:
        current_points = int(answer.awarded_points or 0)

    if current_points == desired_points:
        return None

    delta = desired_points - current_points
    answer.awarded_points = max(desired_points, 0)
    answer.is_correct = desired_points > 0
    answer.evaluation_status = "manual"
    refresh_participant_score(participant)

    adjustment = models.ScoreAdjustment(
        quiz=quiz,
        participant=participant,
        answer=answer,
        question=question,
        created_by=created_by,
        adjustment_type="override",
        points_delta=delta,
        reason_code="host_override",
        reason_text="Host manual score override",
    )
    return adjustment


def log_session_event(
    db: Session,
    *,
    quiz: models.Quiz,
    event_type: str,
    participant: models.Player | None = None,
    installation: models.UserInstallation | None = None,
    question: models.QuizQuestion | None = None,
    payload: dict | None = None,
) -> models.SessionEvent:
    """Создаёт аналитическое событие сессии и добавляет его в текущую транзакцию."""
    normalized_payload = payload or {}
    event = models.SessionEvent(
        quiz=quiz,
        participant=participant,
        installation=installation,
        question=question,
        event_type=event_type,
        event_payload=normalized_payload,
    )
    db.add(event)
    log_game_event(
        logger,
        logging.INFO,
        event_type,
        "Session event recorded",
        **build_log_extra(quiz=quiz, participant=participant, question=question),
        participant_id=getattr(participant, "id", None),
        installation_id=getattr(installation, "id", None),
        installation_public_id=getattr(installation, "public_id", None),
        question_id=getattr(question, "id", None),
        event_payload=normalized_payload,
    )
    return event


def get_quiz_activity_at(quiz: models.Quiz):
    """Возвращает timestamp последнего значимого игрового действия."""
    return quiz.last_activity_at or quiz.started_at or quiz.created_at


def mark_quiz_activity(quiz: models.Quiz, *, occurred_at=None) -> None:
    """Фиксирует значимое игровое действие для inactivity/resume логики."""
    quiz.last_activity_at = occurred_at or models._utc_now()


def is_participant_connected(participant: models.Player) -> bool:
    """Проверяет, считается ли участник активным для reconnect/resume логики."""
    return connection_registry.is_connected(participant.id) or bool(getattr(participant, "sid", None))


def is_quiz_resume_window_expired(quiz: models.Quiz, *, now=None) -> bool:
    """Определяет, истёк ли 10-минутный allowed resume window."""
    if quiz.status in {"finished", "cancelled"}:
        return True

    last_activity_at = get_quiz_activity_at(quiz)
    if last_activity_at is None:
        return False

    resolved_now = now or models._utc_now()
    return resolved_now - last_activity_at > RESUME_WINDOW


def _find_host_participant(quiz: models.Quiz) -> models.Player | None:
    return next(
        (
            participant
            for participant in quiz.players
            if participant.is_host and participant.status != "kicked"
        ),
        None,
    )


def cancel_quiz(
    db: Session,
    *,
    quiz: models.Quiz,
    reason: str,
    cancelled_at=None,
) -> bool:
    """Переводит игру в cancelled и пишет аналитическое событие ровно один раз."""
    cancelled_at = cancelled_at or models._utc_now()
    just_cancelled = quiz.status != "cancelled"

    quiz.status = "cancelled"
    quiz.cancelled_at = quiz.cancelled_at or cancelled_at
    quiz.cancel_reason = reason

    if just_cancelled:
        from .cache import invalidate_quiz

        invalidate_quiz(quiz.code)
        host_participant = _find_host_participant(quiz)
        event_type = {
            "host_timeout": "game_cancelled_host_timeout",
            "inactivity_timeout": "game_cancelled_inactivity",
        }.get(reason, "game_cancelled")
        log_session_event(
            db,
            quiz=quiz,
            participant=host_participant if reason == "host_timeout" else None,
            installation=host_participant.installation if (reason == "host_timeout" and host_participant) else None,
            event_type=event_type,
            payload={
                "cancel_reason": reason,
                "cancelled_at": quiz.cancelled_at.isoformat() if quiz.cancelled_at else None,
            },
        )

    return just_cancelled


def evaluate_quiz_state(
    db: Session,
    *,
    quiz: models.Quiz,
    now=None,
) -> QuizStateEvaluation:
    """Лениво применяет timeout-правила к игре и возвращает итоговое состояние."""
    resolved_now = now or models._utc_now()

    if quiz.status == "cancelled":
        if quiz.cancelled_at is None:
            quiz.cancelled_at = resolved_now
        return QuizStateEvaluation(
            cancelled=True,
            cancel_reason=quiz.cancel_reason,
            just_cancelled=False,
            resume_window_expired=True,
        )

    if quiz.status == "finished":
        return QuizStateEvaluation(
            cancelled=False,
            cancel_reason=None,
            just_cancelled=False,
            resume_window_expired=True,
        )

    host_participant = _find_host_participant(quiz)
    if (
        quiz.host_left_at is not None
        and resolved_now - quiz.host_left_at > HOST_TIMEOUT
        and not (host_participant and is_participant_connected(host_participant))
    ):
        just_cancelled = cancel_quiz(
            db,
            quiz=quiz,
            reason="host_timeout",
            cancelled_at=resolved_now,
        )
        return QuizStateEvaluation(
            cancelled=True,
            cancel_reason="host_timeout",
            just_cancelled=just_cancelled,
            resume_window_expired=True,
        )

    activity_at = get_quiz_activity_at(quiz)
    if activity_at is not None and resolved_now - activity_at > INACTIVITY_CANCEL_TIMEOUT:
        just_cancelled = cancel_quiz(
            db,
            quiz=quiz,
            reason="inactivity_timeout",
            cancelled_at=resolved_now,
        )
        return QuizStateEvaluation(
            cancelled=True,
            cancel_reason="inactivity_timeout",
            just_cancelled=just_cancelled,
            resume_window_expired=True,
        )

    return QuizStateEvaluation(
        cancelled=False,
        cancel_reason=None,
        just_cancelled=False,
        resume_window_expired=is_quiz_resume_window_expired(quiz, now=resolved_now),
    )


def build_game_cancelled_payload(quiz: models.Quiz) -> dict:
    """Строит единый payload для blocked/cancelled сценариев на клиентах."""
    return {
        "status": quiz.status,
        "reason": quiz.cancel_reason,
        "title": quiz.title,
        "cancelled_at": quiz.cancelled_at.isoformat() if quiz.cancelled_at else None,
    }


def _participant_matches_resume_identity(
    participant: models.Player,
    *,
    participant_token: str | None,
    user_id: int | None,
    installation_public_id: str | None,
) -> bool:
    if participant_token and verify_secret(participant_token, participant.reconnect_token_hash):
        return True
    if user_id is not None and participant.user_id == user_id:
        return True
    if (
        installation_public_id
        and participant.installation is not None
        and participant.installation.public_id == installation_public_id
    ):
        return True
    return False


def find_player_resume_candidate(
    quiz: models.Quiz,
    *,
    participant_public_id: str | None,
    participant_token: str | None,
    user_id: int | None,
    installation_public_id: str | None,
) -> models.Player | None:
    """Находит участника, для которого локальные credentials ещё могут быть валидны."""
    active_players = [participant for participant in quiz.players if not participant.is_host]

    if participant_public_id:
        participant = next(
            (item for item in active_players if item.public_id == participant_public_id),
            None,
        )
        if participant is not None and _participant_matches_resume_identity(
            participant,
            participant_token=participant_token,
            user_id=user_id,
            installation_public_id=installation_public_id,
        ):
            return participant

    if participant_token:
        for participant in active_players:
            if verify_secret(participant_token, participant.reconnect_token_hash):
                return participant

    if user_id is not None:
        participant = next((item for item in active_players if item.user_id == user_id), None)
        if participant is not None:
            return participant

    if installation_public_id:
        participant = next(
            (
                item
                for item in active_players
                if item.installation is not None and item.installation.public_id == installation_public_id
            ),
            None,
        )
        if participant is not None:
            return participant

    return None


def evaluate_resume_eligibility(
    db: Session,
    *,
    quiz: models.Quiz | None,
    role: str,
    host_token: str | None = None,
    participant_public_id: str | None = None,
    participant_token: str | None = None,
    user_id: int | None = None,
    installation_public_id: str | None = None,
    now=None,
) -> ResumeEligibility:
    """Проверяет, можно ли ещё предлагать клиенту resume для конкретной игры."""
    if quiz is None:
        return ResumeEligibility(
            room_code="",
            role=role,
            title=None,
            status=None,
            can_resume=False,
            reason="not_found",
            clear_credentials=True,
        )

    state = evaluate_quiz_state(db, quiz=quiz, now=now)

    def _suppressed(reason: str, *, participant: models.Player | None = None, clear_credentials: bool = True):
        log_session_event(
            db,
            quiz=quiz,
            participant=participant,
            installation=participant.installation if participant else None,
            event_type="resume_offer_suppressed",
            payload={"role": role, "reason": reason},
        )
        return ResumeEligibility(
            room_code=quiz.code,
            role=role,
            title=quiz.title,
            status=quiz.status,
            can_resume=False,
            reason=reason,
            cancel_reason=quiz.cancel_reason,
            clear_credentials=clear_credentials,
        )

    if quiz.status == "finished":
        return _suppressed("finished")
    if state.cancelled or quiz.status == "cancelled":
        return _suppressed(quiz.cancel_reason or "cancelled")
    if state.resume_window_expired:
        return _suppressed("resume_window_expired")

    if role == "host":
        host_participant = _find_host_participant(quiz)
        if not verify_secret(host_token, quiz.host_secret_hash):
            return _suppressed("host_auth_failed", participant=host_participant)
        if host_participant is not None and is_participant_connected(host_participant):
            return _suppressed("already_connected", participant=host_participant, clear_credentials=False)
        return ResumeEligibility(
            room_code=quiz.code,
            role=role,
            title=quiz.title,
            status=quiz.status,
            can_resume=True,
        )

    participant = find_player_resume_candidate(
        quiz,
        participant_public_id=participant_public_id,
        participant_token=participant_token,
        user_id=user_id,
        installation_public_id=installation_public_id,
    )
    if participant is None:
        return _suppressed("participant_missing")
    if participant.status == "left":
        return _suppressed("participant_left", participant=participant)
    if participant.status == "kicked":
        return _suppressed("participant_kicked", participant=participant)
    if participant.status == "finished":
        return _suppressed("finished", participant=participant)
    if is_participant_connected(participant):
        return _suppressed("already_connected", participant=participant, clear_credentials=False)

    return ResumeEligibility(
        room_code=quiz.code,
        role=role,
        title=quiz.title,
        status=quiz.status,
        can_resume=True,
    )


def mark_participant_left(participant: models.Player, *, left_at=None) -> None:
    """Переводит участника в left и убирает его из reconnect/resume-кандидатов."""
    resolved_left_at = left_at or models._utc_now()
    participant.status = "left"
    participant.left_at = resolved_left_at
    participant.disconnected_at = resolved_left_at
    participant.last_seen_at = resolved_left_at
    participant.reconnect_token_hash = None
    participant.sid = None


def _resolve_template_source_question_map(
    db: Session,
    *,
    owner: models.User | None,
    questions_payload: list[dict],
) -> dict[str, models.QuestionBankQuestion]:
    source_public_ids = sorted(
        {
            str(raw_question.get("source_question_public_id") or "").strip()
            for raw_question in questions_payload
            if raw_question.get("source_question_public_id")
        }
    )
    if not source_public_ids:
        return {}

    source_questions = (
        db.query(models.QuestionBankQuestion)
        .filter(models.QuestionBankQuestion.public_id.in_(source_public_ids))
        .all()
    )
    return {
        question.public_id: question
        for question in source_questions
        if question.status == "active"
        and (
            question.visibility == "public"
            or (owner is not None and question.owner_id == owner.id)
        )
    }


def create_quiz_session(
    db: Session,
    *,
    title: str,
    code: str,
    owner: models.User | None,
    questions_payload: list[dict],
) -> tuple[models.Quiz, str]:
    """Создаёт шаблон квиза, вопросы и первую игровую сессию.

    Функция возвращает ORM-объект сессии и одноразовый host token, который
    клиент обязан сохранить для дальнейших подключений хоста.
    """
    template = models.QuizTemplate(
        owner=owner,
        title=title,
        total_questions=len(questions_payload),
    )
    db.add(template)
    db.flush()
    source_question_map = _resolve_template_source_question_map(
        db,
        owner=owner,
        questions_payload=questions_payload,
    )
    source_links_count = 0

    for index, raw_question in enumerate(questions_payload, start=1):
        # Позиция вопроса хранится явно, чтобы повторные запуски шаблона были стабильны.
        source_question = source_question_map.get(
            str(raw_question.get("source_question_public_id") or "").strip()
        )
        question = models.QuizQuestion(
            template=template,
            position=index,
            text=raw_question["text"],
            kind=raw_question["type"],
            correct_answer_text=raw_question["correct"],
            points=1,
            source_question=source_question,
        )
        db.add(question)
        db.flush()
        if source_question is not None:
            source_links_count += 1
        options = raw_question.get("options") or []
        for option_index, option_text in enumerate(options, start=1):
            # Каждая option получает собственную строку вместо JSON-массива в questions_data.
            db.add(
                models.QuizQuestionOption(
                    question=question,
                    position=option_index,
                    option_text=option_text,
                    is_correct=normalize_answer(option_text) == normalize_answer(raw_question["correct"]),
                )
            )

    host_token = issue_secret()
    quiz = models.Quiz(
        title=title,
        code=code,
        template=template,
        owner=owner,
        total_questions=len(questions_payload),
        current_question=0,
        status="waiting",
        host_secret_hash=hash_secret(host_token),
    )
    quiz.session_metadata = {
        **(quiz.session_metadata or {}),
        "source_question_links": source_links_count,
    }
    db.add(quiz)
    db.flush()
    log_session_event(db, quiz=quiz, event_type="session_created", payload={"code": code})
    return quiz, host_token


def issue_participant_token(participant: models.Player) -> str:
    """Выпускает новый reconnect token для участника и сохраняет только его хэш."""
    token = issue_secret()
    participant.reconnect_token_hash = hash_secret(token)
    return token
