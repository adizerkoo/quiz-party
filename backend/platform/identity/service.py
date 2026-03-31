"""Сервисы identity-домена: auth, session token и user installations."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import logging
import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from backend.app import database
from backend.platform.identity import models
from backend.shared.utils import generate_public_id, utc_now_naive


logger = logging.getLogger(__name__)
BEARER_AUTH_HEADERS = {"WWW-Authenticate": "Bearer"}


@dataclass(slots=True)
class AuthenticatedUserContext:
    """Контекст аутентифицированного профиля, разрешённый из bearer-токена."""

    user: models.User
    installation: models.UserInstallation


@dataclass
class DevicePayload:
    """Нормализованный device/installations payload из HTTP и socket-входов."""

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
    def from_api(
        cls,
        platform: str | None,
        brand: str | None,
        installation_public_id: str | None = None,
    ) -> "DevicePayload":
        """Собирает минимальный device payload из HTTP API-запроса."""
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


def hash_session_token(token: str) -> str:
    """Возвращает SHA-256-хэш opaque session token профиля."""
    return sha256(token.encode("utf-8")).hexdigest()


def issue_session_token() -> str:
    """Генерирует новый opaque bearer token для profile-related API-вызовов."""
    return secrets.token_urlsafe(32)


def issue_installation_session_token(installation: models.UserInstallation) -> str:
    """Ротирует session token, привязанный к конкретной user installation."""
    token = issue_session_token()
    installation.session_token_hash = hash_session_token(token)
    installation.session_token_issued_at = utc_now_naive()
    return token


def _parse_bearer_token(authorization: str | None) -> str | None:
    """Разбирает заголовок Authorization и возвращает bearer credentials."""
    if authorization is None:
        return None

    scheme, _, credentials = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credentials.strip():
        raise HTTPException(
            status_code=401,
            detail="Invalid session token",
            headers=BEARER_AUTH_HEADERS,
        )
    return credentials.strip()


def _resolve_authenticated_user_context(
    db: Session,
    *,
    token: str,
) -> AuthenticatedUserContext | None:
    """Находит контекст пользователя по bearer token текущей installation."""
    installation = (
        db.query(models.UserInstallation)
        .filter(models.UserInstallation.session_token_hash == hash_session_token(token))
        .first()
    )
    if installation is None or installation.user is None or installation.user_id is None:
        return None
    return AuthenticatedUserContext(user=installation.user, installation=installation)


def get_optional_authenticated_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(database.get_db),
) -> AuthenticatedUserContext | None:
    """Возвращает аутентифицированный контекст или `None`, если токен не передан."""
    token = _parse_bearer_token(authorization)
    if token is None:
        return None

    auth = _resolve_authenticated_user_context(db, token=token)
    if auth is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid session token",
            headers=BEARER_AUTH_HEADERS,
        )
    return auth


def get_current_authenticated_user(
    auth: AuthenticatedUserContext | None = Depends(get_optional_authenticated_user),
) -> AuthenticatedUserContext:
    """FastAPI-зависимость, требующая валидный bearer token."""
    if auth is None:
        raise HTTPException(
            status_code=401,
            detail="Session token is required",
            headers=BEARER_AUTH_HEADERS,
        )
    return auth


def ensure_authenticated_identity_matches(
    auth: AuthenticatedUserContext,
    *,
    user_id: int | None = None,
    installation_public_id: str | None = None,
) -> None:
    """Запрещает использовать валидный токен против чужого user/install identity."""
    if user_id is not None and auth.user.id != user_id:
        raise HTTPException(status_code=403, detail="User identity mismatch")
    if installation_public_id and auth.installation.public_id != installation_public_id:
        raise HTTPException(status_code=403, detail="Installation identity mismatch")


def ensure_installation(
    db: Session,
    *,
    user: models.User | None,
    device: DevicePayload,
) -> models.UserInstallation | None:
    """Находит или создаёт installation/device-запись пользователя."""
    if not device.has_signal():
        return None

    installation = None
    requested_installation_public_id = device.installation_public_id
    requested_client_installation_key = device.client_installation_key
    if requested_installation_public_id:
        installation = (
            db.query(models.UserInstallation)
            .filter(models.UserInstallation.public_id == requested_installation_public_id)
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
            db.query(models.UserInstallation)
            .filter(models.UserInstallation.client_installation_key == requested_client_installation_key)
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
