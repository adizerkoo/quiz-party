"""Сервисные функции для работы с нормализованной схемой Quiz Party."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import secrets
from typing import Iterable

from sqlalchemy.orm import Session, Query, object_session, selectinload

from . import models
from .runtime_state import connection_registry


DEFAULT_EMOJI = "👤"


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
        if not participant.is_host and participant.status != "kicked"
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
    event = models.SessionEvent(
        quiz=quiz,
        participant=participant,
        installation=installation,
        question=question,
        event_type=event_type,
        event_payload=payload or {},
    )
    db.add(event)
    return event


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

    for index, raw_question in enumerate(questions_payload, start=1):
        # Позиция вопроса хранится явно, чтобы повторные запуски шаблона были стабильны.
        question = models.QuizQuestion(
            template=template,
            position=index,
            text=raw_question["text"],
            kind=raw_question["type"],
            correct_answer_text=raw_question["correct"],
            points=1,
        )
        db.add(question)
        db.flush()
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
    db.add(quiz)
    db.flush()
    log_session_event(db, quiz=quiz, event_type="session_created", payload={"code": code})
    return quiz, host_token


def issue_participant_token(participant: models.Player) -> str:
    """Выпускает новый reconnect token для участника и сохраняет только его хэш."""
    token = issue_secret()
    participant.reconnect_token_hash = hash_secret(token)
    return token
