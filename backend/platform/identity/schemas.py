"""Pydantic-схемы платформенного identity-слоя Quiz Party."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.config import PLAYER_EMOJIS

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
