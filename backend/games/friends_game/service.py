"""РћР±С‰РёРµ СЃРµСЂРІРёСЃС‹ backend, РєРѕС‚РѕСЂС‹Рµ РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ СЂР°Р·РЅС‹РјРё bounded context."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import logging
import secrets

from sqlalchemy.orm import Query, Session, object_session, selectinload

from backend.app.logging_config import build_log_extra, log_game_event
from backend.games.friends_game.runtime_state import connection_registry
from backend.games.friends_game import models
from backend.platform.content import models as content_models
from backend.platform.identity import models as identity_models
from backend.shared.utils import (
    generate_public_id,
    normalize_answer as normalize_answer_value,
    utc_now_naive,
)

logger = logging.getLogger(__name__)


DEFAULT_EMOJI = "👤"


def hash_secret(secret: str) -> str:
    """Р’РѕР·РІСЂР°С‰Р°РµС‚ SHA-256 С…СЌС€ СЃРµРєСЂРµС‚Р° РґР»СЏ С…СЂР°РЅРµРЅРёСЏ РІ Р‘Р”."""
    return sha256(secret.encode("utf-8")).hexdigest()


def verify_secret(secret: str | None, secret_hash: str | None) -> bool:
    """РџСЂРѕРІРµСЂСЏРµС‚ СЃРµРєСЂРµС‚ РїСЂРѕС‚РёРІ СЃРѕС…СЂР°РЅС‘РЅРЅРѕРіРѕ С…СЌС€Р° Р±РµР·РѕРїР°СЃРЅС‹Рј СЃСЂР°РІРЅРµРЅРёРµРј."""
    if not secret or not secret_hash:
        return False
    return secrets.compare_digest(hash_secret(secret), secret_hash)


def issue_secret() -> str:
    """Р“РµРЅРµСЂРёСЂСѓРµС‚ РЅРѕРІС‹Р№ СЃРµРєСЂРµС‚ РґР»СЏ host token РёР»Рё reconnect token."""
    return secrets.token_urlsafe(24)


def load_quiz_graph(query: Query) -> Query:
    """Р”РѕР±Р°РІР»СЏРµС‚ eager loading РґР»СЏ С‚РёРїРѕРІРѕРіРѕ РіСЂР°С„Р° РёРіСЂРѕРІРѕР№ СЃРµСЃСЃРёРё."""
    return query.options(
        selectinload(models.Quiz.template)
        .selectinload(content_models.QuizTemplate.questions)
        .selectinload(content_models.QuizQuestion.options),
        selectinload(models.Quiz.players)
        .selectinload(models.Player.answers)
        .selectinload(models.ParticipantAnswer.selected_option),
        selectinload(models.Quiz.players).selectinload(models.Player.installation),
    )


def serialize_question(question: content_models.QuizQuestion, include_correct: bool) -> dict:
    """РџСЂРµРѕР±СЂР°Р·СѓРµС‚ РІРѕРїСЂРѕСЃ ORM-РјРѕРґРµР»Рё РІ JSON-СЃРѕРІРјРµСЃС‚РёРјС‹Р№ payload РґР»СЏ API/socket."""
    payload = {"text": question.text, "type": question.kind}
    options = [option.option_text for option in question.options] or None
    if options is not None:
        payload["options"] = options
    if include_correct:
        payload["correct"] = question.correct_answer_text
    return payload


def serialize_quiz_questions(quiz: models.Quiz, include_correct: bool) -> list[dict]:
    """РЎРµСЂРёР°Р»РёР·СѓРµС‚ РІСЃРµ РІРѕРїСЂРѕСЃС‹ РёРіСЂРѕРІРѕР№ СЃРµСЃСЃРёРё РІ РєР»РёРµРЅС‚СЃРєРёР№ С„РѕСЂРјР°С‚."""
    return [
        serialize_question(question, include_correct=include_correct)
        for question in quiz.questions
    ]


def get_question_by_position(
    quiz: models.Quiz,
    position: int,
) -> content_models.QuizQuestion | None:
    """РС‰РµС‚ РІРѕРїСЂРѕСЃ РїРѕ РїРѕСЂСЏРґРєРѕРІРѕРјСѓ РЅРѕРјРµСЂСѓ РІРЅСѓС‚СЂРё С€Р°Р±Р»РѕРЅР°/СЃРµСЃСЃРёРё."""
    for question in quiz.questions:
        if question.position == position:
            return question
    return None


@dataclass
class DevicePayload:
    """РќРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹Р№ device/installations payload РёР· HTTP Рё socket РІС…РѕРґРѕРІ."""

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
        """РЎРѕР±РёСЂР°РµС‚ СЃРІРµРґРµРЅРёСЏ РѕР± СѓСЃС‚СЂРѕР№СЃС‚РІРµ РёР· socket payload."""
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
    def from_api(
        cls,
        platform: str | None,
        brand: str | None,
        installation_public_id: str | None = None,
    ) -> "DevicePayload":
        """РЎРѕР±РёСЂР°РµС‚ РјРёРЅРёРјР°Р»СЊРЅС‹Р№ device payload РёР· HTTP API Р·Р°РїСЂРѕСЃР°."""
        return cls(
            platform=platform,
            device_brand=brand,
            installation_public_id=installation_public_id,
        )

    def has_signal(self) -> bool:
        """РџСЂРѕРІРµСЂСЏРµС‚, СЃРѕРґРµСЂР¶РёС‚ Р»Рё payload С…РѕС‚СЊ РєР°РєРёРµ-С‚Рѕ РїРѕР»РµР·РЅС‹Рµ device/installation РґР°РЅРЅС‹Рµ."""
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
    user: identity_models.User | None,
    device: DevicePayload,
) -> identity_models.UserInstallation | None:
    """РќР°С…РѕРґРёС‚ РёР»Рё СЃРѕР·РґР°С‘С‚ installation/device Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ."""
    if not device.has_signal():
        return None

    installation = None
    requested_installation_public_id = device.installation_public_id
    requested_client_installation_key = device.client_installation_key
    if requested_installation_public_id:
        installation = (
            db.query(identity_models.UserInstallation)
            .filter(identity_models.UserInstallation.public_id == requested_installation_public_id)
            .first()
        )
        if (
            installation is not None
            and user is not None
            and installation.user_id not in {None, user.id}
        ):
            logger.warning(
                "installation.public_id.conflict ignored  installation_public_id=%s  existing_user_id=%s  requested_user_id=%s",
                requested_installation_public_id,
                installation.user_id,
                user.id,
            )
            installation = None
            requested_installation_public_id = None

    if installation is None and requested_client_installation_key:
        installation = (
            db.query(identity_models.UserInstallation)
            .filter(
                identity_models.UserInstallation.client_installation_key
                == requested_client_installation_key
            )
            .first()
        )
        if (
            installation is not None
            and user is not None
            and installation.user_id not in {None, user.id}
        ):
            logger.warning(
                "installation.client_key.conflict ignored  client_installation_key=%s  existing_user_id=%s  requested_user_id=%s",
                requested_client_installation_key,
                installation.user_id,
                user.id,
            )
            installation = None

    if installation is None and user is not None:
        installation = (
            db.query(identity_models.UserInstallation)
            .filter(
                identity_models.UserInstallation.user_id == user.id,
                identity_models.UserInstallation.platform == (device.platform or "unknown"),
                identity_models.UserInstallation.device_brand == device.device_brand,
            )
            .order_by(
                identity_models.UserInstallation.last_seen_at.desc(),
                identity_models.UserInstallation.id.desc(),
            )
            .first()
        )

    if installation is None:
        installation = identity_models.UserInstallation(
            user=user,
            public_id=requested_installation_public_id or generate_public_id(),
            client_installation_key=requested_client_installation_key,
        )
        db.add(installation)
    installation.user = user
    if requested_installation_public_id:
        installation.public_id = requested_installation_public_id
    installation.platform = device.platform or installation.platform or "unknown"
    installation.device_family = device.device_family or installation.device_family
    installation.device_brand = device.device_brand or installation.device_brand
    installation.device_model = device.device_model or installation.device_model
    installation.browser = device.browser or installation.browser
    installation.browser_version = device.browser_version or installation.browser_version
    installation.app_version = device.app_version or installation.app_version
    installation.last_seen_at = utc_now_naive()
    if requested_client_installation_key:
        installation.client_installation_key = requested_client_installation_key
    if user is not None:
        user.device_platform = installation.platform
        user.device_brand = installation.device_brand
    return installation


def build_participant_payload(participant: models.Player) -> dict:
    """РЎС‚СЂРѕРёС‚ socket/API payload СѓС‡Р°СЃС‚РЅРёРєР° РІ СЃРѕРІРјРµСЃС‚РёРјРѕРј СЃ legacy РєР»РёРµРЅС‚Р°РјРё РІРёРґРµ."""
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


def refresh_participant_score(participant: models.Player) -> int:
    """РџРµСЂРµСЃС‡РёС‚С‹РІР°РµС‚ СЃСѓРјРјР°СЂРЅС‹Р№ СЃС‡С‘С‚ СѓС‡Р°СЃС‚РЅРёРєР° РїРѕ РµРіРѕ answer records."""
    participant.score = sum(answer.awarded_points or 0 for answer in participant.answers)
    return participant.score


def normalize_answer(value: str) -> str:
    """РќРѕСЂРјР°Р»РёР·СѓРµС‚ РѕС‚РІРµС‚ РґР»СЏ case-insensitive СЃСЂР°РІРЅРµРЅРёСЏ."""
    return normalize_answer_value(value)


def validate_quiz_code(code: str) -> bool:
    """РџСЂРѕРІРµСЂСЏРµС‚, С‡С‚Рѕ РєРѕРґ РєРѕРјРЅР°С‚С‹ РЅРµРїСѓСЃС‚РѕР№ Рё СЃРѕРґРµСЂР¶РёС‚ С‚РѕР»СЊРєРѕ Р±РµР·РѕРїР°СЃРЅС‹Рµ СЃРёРјРІРѕР»С‹."""
    if not code or len(code) > 20:
        return False
    return all(char.isalnum() or char == "-" for char in code)


def validate_player_name(name: str) -> bool:
    """РџСЂРѕРІРµСЂСЏРµС‚ РґРѕРїСѓСЃС‚РёРјСѓСЋ РґР»РёРЅСѓ РѕС‚РѕР±СЂР°Р¶Р°РµРјРѕРіРѕ РёРјРµРЅРё РёРіСЂРѕРєР°."""
    return bool(name) and 1 <= len(name) <= 15


def validate_answer(answer: str) -> bool:
    """РџСЂРѕРІРµСЂСЏРµС‚, С‡С‚Рѕ РѕС‚РІРµС‚ РЅРµРїСѓСЃС‚РѕР№ Рё РЅРµ РїСЂРµРІС‹С€Р°РµС‚ РґРѕРїСѓСЃС‚РёРјСѓСЋ РґР»РёРЅСѓ."""
    return bool(answer) and len(str(answer)) <= 500


def find_option_for_answer(
    question: content_models.QuizQuestion,
    answer_text: str,
) -> content_models.QuizQuestionOption | None:
    """РС‰РµС‚ option-СЃС‚СЂРѕРєСѓ, СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰СѓСЋ РїСЂРёСЃР»Р°РЅРЅРѕРјСѓ РѕС‚РІРµС‚Сѓ."""
    normalized = normalize_answer(answer_text)
    for option in question.options:
        if normalize_answer(option.option_text) == normalized:
            return option
    return None


def upsert_answer(
    *,
    participant: models.Player,
    quiz: models.Quiz,
    question: content_models.QuizQuestion,
    answer_text: str | None,
    answer_time_seconds: float | None,
    submitted_at=None,
) -> tuple[models.ParticipantAnswer, bool]:
    """РЎРѕР·РґР°С‘С‚ РёР»Рё РѕР±РЅРѕРІР»СЏРµС‚ РѕС‚РІРµС‚ СѓС‡Р°СЃС‚РЅРёРєР° РЅР° РєРѕРЅРєСЂРµС‚РЅС‹Р№ РІРѕРїСЂРѕСЃ."""
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

    answer.answer_text = answer_text
    answer.selected_option = find_option_for_answer(question, answer_text or "")
    answer.submitted_at = submitted_at or utc_now_naive()
    answer.answer_time_seconds = answer_time_seconds
    if answer_text is not None:
        answer.is_correct = normalize_answer(answer_text) == normalize_answer(
            question.correct_answer_text
        )
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
    question: content_models.QuizQuestion,
    desired_points: int,
    created_by: models.Player | None,
) -> models.ScoreAdjustment | None:
    """РџСЂРёРјРµРЅСЏРµС‚ СЂСѓС‡РЅСѓСЋ РєРѕСЂСЂРµРєС‚РёСЂРѕРІРєСѓ РѕС‡РєРѕРІ РѕС‚ С…РѕСЃС‚Р°."""
    answer = next((item for item in participant.answers if item.question_id == question.id), None)
    if answer is None:
        answer = models.ParticipantAnswer(
            participant=participant,
            quiz_id=quiz.id,
            question=question,
            question_position=question.position,
            answer_text=None,
            submitted_at=utc_now_naive(),
            is_correct=bool(desired_points),
            awarded_points=max(desired_points, 0),
            evaluation_status="manual",
        )
        session = object_session(participant)
        if session is not None:
            session.add(answer)
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

    return models.ScoreAdjustment(
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


def log_session_event(
    db: Session,
    *,
    quiz: models.Quiz,
    event_type: str,
    participant: models.Player | None = None,
    installation: identity_models.UserInstallation | None = None,
    question: content_models.QuizQuestion | None = None,
    payload: dict | None = None,
) -> models.SessionEvent:
    """РЎРѕР·РґР°С‘С‚ Р°РЅР°Р»РёС‚РёС‡РµСЃРєРѕРµ СЃРѕР±С‹С‚РёРµ СЃРµСЃСЃРёРё Рё РґРѕР±Р°РІР»СЏРµС‚ РµРіРѕ РІ С‚РµРєСѓС‰СѓСЋ С‚СЂР°РЅР·Р°РєС†РёСЋ."""
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


def _resolve_template_source_question_map(
    db: Session,
    *,
    owner: identity_models.User | None,
    questions_payload: list[dict],
) -> dict[str, content_models.QuestionBankQuestion]:
    """РЎРѕР±РёСЂР°РµС‚ РґРѕСЃС‚СѓРїРЅС‹Рµ source-question СЃСЃС‹Р»РєРё РґР»СЏ РЅРѕРІРѕРіРѕ С€Р°Р±Р»РѕРЅР° РєРІРёР·Р°."""
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
        db.query(content_models.QuestionBankQuestion)
        .filter(content_models.QuestionBankQuestion.public_id.in_(source_public_ids))
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
    owner: identity_models.User | None,
    questions_payload: list[dict],
) -> tuple[models.Quiz, str]:
    """РЎРѕР·РґР°С‘С‚ С€Р°Р±Р»РѕРЅ РєРІРёР·Р°, РІРѕРїСЂРѕСЃС‹ Рё РїРµСЂРІСѓСЋ РёРіСЂРѕРІСѓСЋ СЃРµСЃСЃРёСЋ."""
    template = content_models.QuizTemplate(
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
        source_question = source_question_map.get(
            str(raw_question.get("source_question_public_id") or "").strip()
        )
        question = content_models.QuizQuestion(
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
            db.add(
                content_models.QuizQuestionOption(
                    question=question,
                    position=option_index,
                    option_text=option_text,
                    is_correct=normalize_answer(option_text)
                    == normalize_answer(raw_question["correct"]),
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
    """Р’С‹РїСѓСЃРєР°РµС‚ РЅРѕРІС‹Р№ reconnect token РґР»СЏ СѓС‡Р°СЃС‚РЅРёРєР° Рё СЃРѕС…СЂР°РЅСЏРµС‚ С‚РѕР»СЊРєРѕ РµРіРѕ С…СЌС€."""
    token = issue_secret()
    participant.reconnect_token_hash = hash_secret(token)
    return token


__all__ = [
    "DEFAULT_EMOJI",
    "DevicePayload",
    "apply_score_override",
    "build_participant_payload",
    "create_quiz_session",
    "ensure_installation",
    "find_option_for_answer",
    "get_question_by_position",
    "hash_secret",
    "issue_participant_token",
    "issue_secret",
    "load_quiz_graph",
    "log_session_event",
    "normalize_answer",
    "refresh_participant_score",
    "serialize_question",
    "serialize_quiz_questions",
    "upsert_answer",
    "validate_answer",
    "validate_player_name",
    "validate_quiz_code",
    "verify_secret",
]

