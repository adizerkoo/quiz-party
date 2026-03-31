"""Pydantic-схемы платформенного identity-слоя Quiz Party."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.config import PLAYER_EMOJIS

class UserCreate(BaseModel):
    """Payload СЃРѕР·РґР°РЅРёСЏ РїСЂРѕС„РёР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рё РµРіРѕ installation layer."""

    username: str = Field(..., min_length=1, max_length=15)
    avatar_emoji: str
    device_platform: Optional[str] = Field(default=None, max_length=20)
    device_brand: Optional[str] = Field(default=None, max_length=50)
    installation_public_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        """РћРіСЂР°РЅРёС‡РёРІР°РµС‚ username РїРѕ РґР»РёРЅРµ РїРѕСЃР»Рµ trim."""
        cleaned = value.strip()
        if len(cleaned) < 1 or len(cleaned) > 15:
            raise ValueError("username must contain 1..15 characters")
        return cleaned

    @field_validator("avatar_emoji")
    @classmethod
    def validate_avatar_emoji(cls, value: str) -> str:
        """Р Р°Р·СЂРµС€Р°РµС‚ С‚РѕР»СЊРєРѕ emoji РёР· СЃРµСЂРІРµСЂРЅРѕРіРѕ whitelist."""
        if value not in PLAYER_EMOJIS:
            raise ValueError("avatar_emoji is not allowed")
        return value


class UserUpdate(UserCreate):
    """Payload РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРѕС„РёР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ."""

    pass


class UserTouch(BaseModel):
    """Payload РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ last_login_at Рё С‚РµРєСѓС‰РµР№ installation РёРЅС„РѕСЂРјР°С†РёРё."""

    device_platform: Optional[str] = Field(default=None, max_length=20)
    device_brand: Optional[str] = Field(default=None, max_length=50)
    installation_public_id: Optional[str] = Field(default=None, max_length=36)


class UserSessionExchangeRequest(UserTouch):
    """Payload for exchanging a legacy installation binding into a bearer session."""

    pass


class UserResponse(BaseModel):
    """РџСѓР±Р»РёС‡РЅРѕРµ РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµ РїСЂРѕС„РёР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ РѕС‚РІРµС‚Р°С… API."""

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
