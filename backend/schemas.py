"""Pydantic-схемы API-контрактов Quiz Party."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import PLAYER_EMOJIS


class QuestionSchema(BaseModel):
    """Схема одного вопроса, приходящего при создании квиза."""

    text: str = Field(..., min_length=1, max_length=500)
    type: str
    correct: str = Field(..., min_length=1, max_length=200)
    options: Optional[List[str]] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        """Разрешает только поддерживаемые типы вопросов."""
        if value not in ("text", "options"):
            raise ValueError('type must be "text" or "options"')
        return value

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        """Проверяет допустимое число и длину вариантов ответа."""
        if value is not None:
            if len(value) < 2:
                raise ValueError("Minimum 2 options required")
            if len(value) > 6:
                raise ValueError("Maximum 6 options allowed")
            for option in value:
                if len(option) > 200:
                    raise ValueError("Option text too long (max 200 chars)")
        return value


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

    model_config = ConfigDict(from_attributes=True)
