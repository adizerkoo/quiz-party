"""Модели домена identity платформенного слоя Quiz Party."""

from __future__ import annotations

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from backend.app.database import Base
from backend.shared.utils import generate_public_id, utc_now_naive

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_public_id", "public_id", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    username = Column(String(15), nullable=False)
    avatar_emoji = Column(String(16), nullable=False)
    device_platform = Column(String(20), nullable=True)
    device_brand = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)
    last_login_at = Column(DateTime, nullable=False, default=utc_now_naive)
    profile_metadata = Column(JSON, nullable=False, default=dict)

    installations = relationship(
        "UserInstallation",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(UserInstallation.last_seen_at)",
    )
    owned_quizzes = relationship(
        "Quiz",
        back_populates="owner",
        foreign_keys="Quiz.owner_id",
    )
    owned_templates = relationship(
        "QuizTemplate",
        back_populates="owner",
        foreign_keys="QuizTemplate.owner_id",
    )
    owned_bank_questions = relationship(
        "QuestionBankQuestion",
        back_populates="owner",
        foreign_keys="QuestionBankQuestion.owner_id",
    )
    favorite_questions = relationship(
        "UserFavoriteQuestion",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(UserFavoriteQuestion.created_at)",
    )
    players = relationship(
        "Player",
        back_populates="user",
        foreign_keys="Player.user_id",
    )

    @property
    def latest_installation(self) -> UserInstallation | None:
        """Возвращает самую свежую installation-запись пользователя."""
        return self.installations[0] if self.installations else None

    @property
    def installation_public_id(self) -> str | None:
        """Возвращает public_id последней известной установки пользователя."""
        installation = self.latest_installation
        return installation.public_id if installation else None


class UserInstallation(Base):
    __tablename__ = "user_installations"
    __table_args__ = (
        Index("ix_user_installations_public_id", "public_id", unique=True),
        Index("ix_user_installations_user_last_seen", "user_id", "last_seen_at"),
        Index("ix_user_installations_client_key", "client_installation_key"),
        Index("ix_user_installations_session_token_hash", "session_token_hash", unique=True),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    client_installation_key = Column(String(80), nullable=True)
    platform = Column(String(20), nullable=False, default="unknown")
    device_family = Column(String(20), nullable=True)
    device_brand = Column(String(50), nullable=True)
    device_model = Column(String(120), nullable=True)
    browser = Column(String(40), nullable=True)
    browser_version = Column(String(20), nullable=True)
    app_version = Column(String(40), nullable=True)
    session_token_hash = Column(String(128), nullable=True)
    session_token_issued_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    last_seen_at = Column(DateTime, nullable=False, default=utc_now_naive)
    installation_metadata = Column(JSON, nullable=False, default=dict)

    user = relationship("User", back_populates="installations")
    players = relationship("Player", back_populates="installation")
    session_events = relationship("SessionEvent", back_populates="installation")

