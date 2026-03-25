"""
Pydantic-схемы для валидации входных данных и формирования ответов API.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional
from datetime import datetime
from .config import PLAYER_EMOJIS

class QuestionSchema(BaseModel):
    """Схема одного вопроса викторины (текст, тип, правильный ответ, варианты)."""
    text: str = Field(..., min_length=1, max_length=500)
    type: str
    correct: str = Field(..., min_length=1, max_length=200)
    options: Optional[List[str]] = None

    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        """Допускает только 'text' или 'options'."""
        if v not in ('text', 'options'):
            raise ValueError('type must be "text" or "options"')
        return v

    @field_validator('options')
    @classmethod
    def validate_options(cls, v):
        """Проверяет варианты ответов: от 2 до 6 штук, каждый до 200 символов."""
        if v is not None:
            if len(v) < 2:
                raise ValueError('Minimum 2 options required')
            if len(v) > 6:
                raise ValueError('Maximum 6 options allowed')
            for opt in v:
                if len(opt) > 200:
                    raise ValueError('Option text too long (max 200 chars)')
        return v


class QuizCreate(BaseModel):
    """Схема запроса на создание викторины (название + список вопросов)."""
    title: str = Field(..., min_length=1, max_length=100)
    questions: List[QuestionSchema] = Field(..., min_length=1, max_length=50)
    owner_id: Optional[int] = None


class QuizResponse(BaseModel):
    """Схема ответа API после создания викторины."""
    id: int
    code: str
    title: str

    # 🆕 Новые поля
    status: str
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    winner_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=15)
    avatar_emoji: str
    device_platform: Optional[str] = Field(default=None, max_length=20)
    device_brand: Optional[str] = Field(default=None, max_length=50)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 1 or len(cleaned) > 15:
            raise ValueError("username must contain 1..15 characters")
        return cleaned

    @field_validator("avatar_emoji")
    @classmethod
    def validate_avatar_emoji(cls, value: str) -> str:
        if value not in PLAYER_EMOJIS:
            raise ValueError("avatar_emoji is not allowed")
        return value


class UserTouch(BaseModel):
    device_platform: Optional[str] = Field(default=None, max_length=20)
    device_brand: Optional[str] = Field(default=None, max_length=50)


class UserResponse(BaseModel):
    id: int
    username: str
    avatar_emoji: str
    device_platform: Optional[str] = None
    device_brand: Optional[str] = None
    created_at: datetime
    last_login_at: datetime

    model_config = ConfigDict(from_attributes=True)
