"""Утилиты безопасности и валидации для backend Quiz Party."""

from collections import defaultdict
from dataclasses import dataclass
from hashlib import sha256
import logging
import re
import secrets
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from . import database, models

logger = logging.getLogger(__name__)
BEARER_AUTH_HEADERS = {"WWW-Authenticate": "Bearer"}


class RateLimiter:
    """Простой in-memory rate limiter для HTTP/socket-событий.

    Лимитер умеет маппить временный `sid` на более стабильный ключ участника.
    Это позволяет не сбрасывать лимит полностью при реконнекте.
    """

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        """Создаёт лимитер с ограничением по числу запросов в окне времени."""
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = defaultdict(list)
        self._sid_to_key = {}
        self._call_count = 0

    def register_identity(self, sid: str, persistent_key: str) -> None:
        """Привязывает socket sid к более стабильному identity-ключу участника."""
        self._sid_to_key[sid] = persistent_key

    def is_allowed(self, identifier: str) -> bool:
        """Проверяет, можно ли принять ещё один запрос от данного источника."""
        key = self._sid_to_key.get(identifier, identifier)
        now = time.time()

        # Перед проверкой лимита вычищаем старые отметки вне текущего окна.
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.time_window
        ]

        if len(self.requests[key]) >= self.max_requests:
            logger.warning(
                "Rate limit exceeded  identifier=%s  requests=%d/%d",
                key,
                len(self.requests[key]),
                self.max_requests,
            )
            return False

        self.requests[key].append(now)

        # Полную уборку делаем лениво, чтобы не платить её цену на каждый вызов.
        self._call_count += 1
        if self._call_count >= 500:
            self._call_count = 0
            self._cleanup(now)

        return True

    def _cleanup(self, now: float) -> None:
        """Удаляет устаревшие записи и orphaned sid из внутренних индексов."""
        stale = [
            key
            for key, values in self.requests.items()
            if not values or now - values[-1] > self.time_window * 2
        ]
        for key in stale:
            del self.requests[key]

        active_keys = set(self.requests.keys())
        orphaned = [
            sid
            for sid, key in self._sid_to_key.items()
            if key not in active_keys
        ]
        for sid in orphaned:
            del self._sid_to_key[sid]


rate_limiter = RateLimiter(max_requests=100, time_window=60)


@dataclass(slots=True)
class AuthenticatedUserContext:
    """Authenticated profile context resolved from the bearer session token."""

    user: models.User
    installation: models.UserInstallation


def hash_session_token(token: str) -> str:
    """Returns a SHA-256 hash of the opaque profile session token."""
    return sha256(token.encode("utf-8")).hexdigest()


def issue_session_token() -> str:
    """Generates a new opaque bearer token for profile-related API calls."""
    return secrets.token_urlsafe(32)


def issue_installation_session_token(installation: models.UserInstallation) -> str:
    """Rotates the session token bound to a concrete user installation."""
    token = issue_session_token()
    installation.session_token_hash = hash_session_token(token)
    installation.session_token_issued_at = models._utc_now()
    return token


def _parse_bearer_token(authorization: str | None) -> str | None:
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
    """Returns the authenticated profile context or None when no bearer token is provided."""
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
    """FastAPI dependency that requires a valid bearer token."""
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
    """Rejects attempts to use a valid token against another user's identity."""
    if user_id is not None and auth.user.id != user_id:
        raise HTTPException(status_code=403, detail="User identity mismatch")
    if installation_public_id and auth.installation.public_id != installation_public_id:
        raise HTTPException(status_code=403, detail="Installation identity mismatch")


def validate_quiz_code(code: str) -> bool:
    """Проверяет, что код комнаты не пустой и содержит только безопасные символы."""
    if not code or len(code) > 20:
        return False
    return all(char.isalnum() or char == "-" for char in code)


def validate_player_name(name: str) -> bool:
    """Проверяет длину имени игрока без попытки задавать identity по username."""
    if not name or len(name) < 1 or len(name) > 15:
        return False
    return True


def validate_answer(answer: str) -> bool:
    """Проверяет, что ответ не пустой и не превышает допустимую длину."""
    if not answer or len(str(answer)) > 500:
        return False
    return True


def sanitize_text(text: str) -> str:
    """Удаляет HTML-теги из пользовательского текста как базовую защиту от XSS."""
    if not text:
        return text
    return re.sub(r"<[^>]*?>", "", str(text))
