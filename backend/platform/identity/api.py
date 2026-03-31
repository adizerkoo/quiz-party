"""HTTP API платформенного identity-домена: профиль, сессии и installations."""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app import database
from backend.app.config import PLAYER_EMOJIS
from backend.platform.identity import schemas
from backend.platform.identity import models
from backend.platform.identity.repository import get_installation_by_public_id
from backend.platform.identity.service import (
    AuthenticatedUserContext,
    DevicePayload,
    ensure_authenticated_identity_matches,
    ensure_installation,
    get_current_authenticated_user,
    get_optional_authenticated_user,
    issue_installation_session_token,
)
from backend.shared.utils import generate_public_id, sanitize_text, utc_now_naive


logger = logging.getLogger(__name__)


def _clean_username(username: str) -> str:
    """Санитизирует и валидирует username для profile API."""
    cleaned = sanitize_text(username).strip()
    if len(cleaned) < 1 or len(cleaned) > 15:
        raise HTTPException(status_code=422, detail="Invalid username")
    return cleaned


def _clean_optional_text(value, max_length: int) -> str | None:
    """Санитизирует опциональный текст и ограничивает его безопасной длиной."""
    if value is None:
        return None
    cleaned = sanitize_text(str(value)).strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


def _build_user_response(
    user: models.User,
    *,
    session_token: str | None = None,
) -> schemas.UserResponse:
    """Сериализует профильный ответ и при необходимости добавляет новый bearer token."""
    return schemas.UserResponse(
        id=user.id,
        public_id=user.public_id,
        username=user.username,
        avatar_emoji=user.avatar_emoji,
        device_platform=user.device_platform,
        device_brand=user.device_brand,
        installation_public_id=user.installation_public_id,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        session_token=session_token,
    )


def _resolve_user_session_exchange(
    db: Session,
    *,
    user_id: int,
    session_data: schemas.UserSessionExchangeRequest,
    auth: AuthenticatedUserContext | None,
) -> tuple[models.User, models.UserInstallation]:
    """Разрешает, как именно обменять legacy installation-привязку на bearer session."""
    if auth is not None:
        ensure_authenticated_identity_matches(
            auth,
            user_id=user_id,
            installation_public_id=session_data.installation_public_id,
        )
        return auth.user, auth.installation

    if not session_data.installation_public_id:
        raise HTTPException(status_code=401, detail="Session token is required")

    installation = get_installation_by_public_id(db, session_data.installation_public_id)
    if installation is None or installation.user is None or installation.user_id is None:
        raise HTTPException(status_code=401, detail="Invalid session exchange credentials")
    if installation.user_id != user_id:
        raise HTTPException(status_code=403, detail="User identity mismatch")
    return installation.user, installation


def register_identity_routes(app):
    """Регистрирует HTTP-маршруты identity-домена на приложении."""

    @app.post("/api/v1/users", response_model=schemas.UserResponse)
    def create_user(user_data: schemas.UserCreate, db: Session = Depends(database.get_db)):
        """Создаёт профиль пользователя и при необходимости привязывает installation."""
        username = _clean_username(user_data.username)
        user = models.User(
            username=username,
            avatar_emoji=user_data.avatar_emoji,
            created_at=utc_now_naive(),
            updated_at=utc_now_naive(),
            last_login_at=utc_now_naive(),
        )
        session_token = None
        try:
            db.add(user)
            installation = ensure_installation(
                db,
                user=user,
                device=DevicePayload.from_api(
                    platform=_clean_optional_text(user_data.device_platform, 20),
                    brand=_clean_optional_text(user_data.device_brand, 50),
                    installation_public_id=user_data.installation_public_id or generate_public_id(),
                ),
            )
            if installation is None:
                installation = models.UserInstallation(user=user, public_id=generate_public_id())
                db.add(installation)
            session_token = issue_installation_session_token(installation)
            db.commit()
            db.refresh(user)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="User profile could not be saved") from exc
        return _build_user_response(user, session_token=session_token)

    @app.get("/api/v1/users/meta")
    def get_users_meta():
        """Возвращает UI-метаданные для экрана профиля пользователя."""
        return {"avatar_emojis": PLAYER_EMOJIS}

    @app.post("/api/v1/users/{user_id}/session", response_model=schemas.UserResponse)
    def exchange_user_session(
        user_id: int,
        session_data: schemas.UserSessionExchangeRequest,
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext | None = Depends(get_optional_authenticated_user),
    ):
        """Обменивает legacy installation binding на bearer session token."""
        user, installation = _resolve_user_session_exchange(
            db,
            user_id=user_id,
            session_data=session_data,
            auth=auth,
        )
        user.last_login_at = utc_now_naive()
        installation = ensure_installation(
            db,
            user=user,
            device=DevicePayload.from_api(
                platform=_clean_optional_text(session_data.device_platform, 20),
                brand=_clean_optional_text(session_data.device_brand, 50),
                installation_public_id=installation.public_id,
            ),
        ) or installation
        session_token = issue_installation_session_token(installation)
        db.commit()
        db.refresh(user)
        return _build_user_response(user, session_token=session_token)

    @app.get("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def get_user(
        user_id: int,
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Возвращает профиль пользователя по внутреннему id."""
        ensure_authenticated_identity_matches(auth, user_id=user_id)
        return _build_user_response(auth.user)

    @app.put("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
    def update_user(
        user_id: int,
        user_data: schemas.UserUpdate,
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Обновляет профиль пользователя без смены identity."""
        ensure_authenticated_identity_matches(
            auth,
            user_id=user_id,
            installation_public_id=user_data.installation_public_id,
        )
        user = auth.user
        user.username = _clean_username(user_data.username)
        user.avatar_emoji = user_data.avatar_emoji
        user.updated_at = utc_now_naive()
        installation = ensure_installation(
            db,
            user=user,
            device=DevicePayload.from_api(
                platform=_clean_optional_text(user_data.device_platform, 20),
                brand=_clean_optional_text(user_data.device_brand, 50),
                installation_public_id=user_data.installation_public_id or auth.installation.public_id,
            ),
        )
        session_token = issue_installation_session_token(installation or auth.installation)

        try:
            db.commit()
            db.refresh(user)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="User profile could not be updated") from exc

        return _build_user_response(user, session_token=session_token)

    @app.post("/api/v1/users/{user_id}/touch", response_model=schemas.UserResponse)
    def touch_user(
        user_id: int,
        touch_data: schemas.UserTouch,
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Обновляет `last_login_at` и перепривязывает текущую installation к пользователю."""
        ensure_authenticated_identity_matches(
            auth,
            user_id=user_id,
            installation_public_id=touch_data.installation_public_id,
        )
        user = auth.user
        user.last_login_at = utc_now_naive()
        installation = ensure_installation(
            db,
            user=user,
            device=DevicePayload.from_api(
                platform=_clean_optional_text(touch_data.device_platform, 20),
                brand=_clean_optional_text(touch_data.device_brand, 50),
                installation_public_id=touch_data.installation_public_id or auth.installation.public_id,
            ),
        )
        session_token = issue_installation_session_token(installation or auth.installation)
        db.commit()
        db.refresh(user)
        return _build_user_response(user, session_token=session_token)
