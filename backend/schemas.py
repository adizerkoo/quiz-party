"""Pydantic-схемы API-контрактов Quiz Party."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .config import PLAYER_EMOJIS


class QuestionSchema(BaseModel):
    """Схема одного вопроса, приходящего при создании квиза."""

    text: str = Field(..., min_length=1, max_length=500)
    type: str
    correct: str = Field(..., min_length=1, max_length=200)
    options: Optional[List[str]] = None
    source_question_public_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        """Разрешает только поддерживаемые типы вопросов."""
        if value not in ("text", "options"):
            raise ValueError('type must be "text" or "options"')
        return value

    @field_validator("text", "correct")
    @classmethod
    def validate_required_text_fields(cls, value: str) -> str:
        """Trims required text fields and rejects whitespace-only values."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be blank")
        return cleaned

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        """Проверяет допустимое число и длину вариантов ответа."""
        if value is not None:
            if len(value) < 2:
                raise ValueError("Minimum 2 options required")
            if len(value) > 6:
                raise ValueError("Maximum 6 options allowed")
            normalized_options: list[str] = []
            for option in value:
                cleaned = str(option).strip()
                if not cleaned:
                    raise ValueError("Option text cannot be blank")
                if len(cleaned) > 200:
                    raise ValueError("Option text too long (max 200 chars)")
                normalized_options.append(cleaned)
            return normalized_options
        return value

    @model_validator(mode="after")
    def validate_question_shape(self) -> "QuestionSchema":
        """Ensures the payload shape matches the declared question type."""
        if self.type == "text":
            self.options = None
            return self

        if not self.options:
            raise ValueError('options are required when type is "options"')
        if self.correct not in self.options:
            raise ValueError("correct must match one of the provided options")
        return self


class QuizQuestionPayload(BaseModel):
    """Question payload used in result/history responses."""

    text: str
    type: str
    correct: Optional[str] = None
    options: Optional[List[str]] = None
    source_question_public_id: Optional[str] = None


class QuizResultPlayer(BaseModel):
    """One leaderboard row in the unified final-results contract."""

    name: str
    score: int
    final_rank: Optional[int] = None
    emoji: Optional[str] = None
    answers: dict[str, str] = Field(default_factory=dict)
    answer_times: dict[str, float] = Field(default_factory=dict)


class QuizResultsSnapshot(BaseModel):
    """Stored snapshot body reused by the final-results API."""

    results: List[QuizResultPlayer] = Field(default_factory=list)
    questions: List[QuizQuestionPayload] = Field(default_factory=list)


class QuizResultsResponse(BaseModel):
    """Unified payload for the final-results screen on every client."""

    code: str
    title: str
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    total_questions: int
    questions: List[QuizQuestionPayload] = Field(default_factory=list)
    results: List[QuizResultPlayer] = Field(default_factory=list)


class UserHistoryEntry(BaseModel):
    """One game in the user profile history."""

    quiz_code: str
    title: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    game_status: str
    cancel_reason: Optional[str] = None
    participant_status: str
    score: Optional[int] = None
    final_rank: Optional[int] = None
    is_winner: bool = False
    winner_names: List[str] = Field(default_factory=list)
    can_open_results: bool = False
    template_public_id: Optional[str] = None
    is_host_game: bool = False
    can_repeat: bool = False


class QuizCreate(BaseModel):
    """Payload для создания нового шаблона и первой игровой сессии."""

    title: str = Field(..., min_length=1, max_length=100)
    questions: List[QuestionSchema] = Field(..., min_length=1, max_length=50)
    owner_id: Optional[int] = None


class QuizResponse(BaseModel):
    """Ответ API после создания или чтения игровой сессии."""

    id: int
    public_id: Optional[str] = None
    template_public_id: Optional[str] = None
    code: str
    title: str
    status: str
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    host_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ResumeSessionCandidate(BaseModel):
    """Одна локально сохранённая игровая сессия для серверной resume-проверки."""

    room_code: str = Field(..., min_length=1, max_length=20)
    role: Literal["host", "player"]
    participant_id: Optional[str] = Field(default=None, max_length=36)
    participant_token: Optional[str] = Field(default=None, max_length=128)
    host_token: Optional[str] = Field(default=None, max_length=128)
    installation_public_id: Optional[str] = Field(default=None, max_length=36)


class ResumeCheckRequest(BaseModel):
    """Пакет локальных credentials, которые клиент хочет проверить на валидность."""

    sessions: List[ResumeSessionCandidate] = Field(..., min_length=1, max_length=10)
    user_id: Optional[int] = None
    installation_public_id: Optional[str] = Field(default=None, max_length=36)


class ResumeSessionStatus(BaseModel):
    """Результат серверной проверки одной сохранённой сессии."""

    room_code: str
    role: Literal["host", "player"]
    title: Optional[str] = None
    status: Optional[str] = None
    can_resume: bool
    reason: Optional[str] = None
    cancel_reason: Optional[str] = None
    clear_credentials: bool = False


class ResumeCheckResponse(BaseModel):
    """Ответ API c лучшим resume-кандидатом и причинами отказа по остальным."""

    has_resume_game: bool
    resume_game: Optional[ResumeSessionStatus] = None
    sessions: List[ResumeSessionStatus]


LibraryScope = Literal["public", "favorites"]
OriginScreen = Literal["create", "profile", "history"]


class LibraryCategoryResponse(BaseModel):
    """One question-bank category row for the library UI."""

    public_id: str
    slug: str
    title: str
    sort_order: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class LibraryQuestionResponse(BaseModel):
    """Reusable question row returned by library/favorites endpoints."""

    public_id: str
    text: str
    type: str
    correct: str
    options: Optional[List[str]] = None
    source_question_public_id: str
    source: Literal["system", "user"]
    visibility: Literal["public", "private"]
    category_slug: Optional[str] = None
    category_title: Optional[str] = None
    is_favorite: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FavoriteQuestionMutationRequest(BaseModel):
    """Adds an existing bank question to favorites or creates a private reusable one."""

    user_id: Optional[int] = None
    installation_public_id: Optional[str] = Field(default=None, max_length=36)
    origin_screen: Optional[OriginScreen] = None
    source_question_public_id: Optional[str] = Field(default=None, max_length=36)
    question: Optional[QuestionSchema] = None

    @model_validator(mode="after")
    def validate_payload_shape(self) -> "FavoriteQuestionMutationRequest":
        if self.source_question_public_id and self.question is not None:
            raise ValueError("Provide either source_question_public_id or question")
        if not self.source_question_public_id and self.question is None:
            raise ValueError("source_question_public_id or question is required")
        return self


class TemplateDraftResponse(BaseModel):
    """Draft payload that lets the host reopen create with a stored template snapshot."""

    template_public_id: str
    title: str
    total_questions: int
    questions: List[QuestionSchema] = Field(default_factory=list)


class UserCreate(BaseModel):
    """Payload создания профиля пользователя и его installation layer."""

    username: str = Field(..., min_length=1, max_length=15)
    avatar_emoji: str
    device_platform: Optional[str] = Field(default=None, max_length=20)
    device_brand: Optional[str] = Field(default=None, max_length=50)
    installation_public_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        """Ограничивает username по длине после trim."""
        cleaned = value.strip()
        if len(cleaned) < 1 or len(cleaned) > 15:
            raise ValueError("username must contain 1..15 characters")
        return cleaned

    @field_validator("avatar_emoji")
    @classmethod
    def validate_avatar_emoji(cls, value: str) -> str:
        """Разрешает только emoji из серверного whitelist."""
        if value not in PLAYER_EMOJIS:
            raise ValueError("avatar_emoji is not allowed")
        return value


class UserUpdate(UserCreate):
    """Payload обновления профиля пользователя."""

    pass


class UserTouch(BaseModel):
    """Payload для обновления last_login_at и текущей installation информации."""

    device_platform: Optional[str] = Field(default=None, max_length=20)
    device_brand: Optional[str] = Field(default=None, max_length=50)
    installation_public_id: Optional[str] = Field(default=None, max_length=36)


class UserSessionExchangeRequest(UserTouch):
    """Payload for exchanging a legacy installation binding into a bearer session."""

    pass


class UserResponse(BaseModel):
    """Публичное представление профиля пользователя в ответах API."""

    id: int
    public_id: Optional[str] = None
    username: str
    avatar_emoji: str
    device_platform: Optional[str] = None
    device_brand: Optional[str] = None
    installation_public_id: Optional[str] = None
    created_at: datetime
    last_login_at: datetime
    session_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
