"""Запросы и lookup-хелперы для платформенного identity-домена."""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.platform.identity import models


def get_user_by_id(db: Session, user_id: int) -> models.User | None:
    """Возвращает пользователя по внутреннему идентификатору."""
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_installation_by_public_id(
    db: Session,
    installation_public_id: str,
) -> models.UserInstallation | None:
    """Возвращает установку по внешнему публичному идентификатору."""
    return (
        db.query(models.UserInstallation)
        .filter(models.UserInstallation.public_id == installation_public_id)
        .first()
    )
