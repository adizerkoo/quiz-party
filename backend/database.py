"""Настройка SQLAlchemy engine, сессий и первичной инициализации схемы."""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from .models import Base

logger = logging.getLogger(__name__)

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required. Set a PostgreSQL connection string in backend/.env"
    )

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL.startswith("postgresql://"):
    raise RuntimeError(f"Only PostgreSQL is supported. Got: {DATABASE_URL}")

logger.info("Database engine created  pool_size=5 max_overflow=10")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)


def _repair_schema_after_fallback():
    """Доводит существующую PostgreSQL-схему до состояния, нужного текущему ORM.

    Эта функция нужна только как аварийный мост для локальной разработки, когда
    Alembic недоступен и приложение было вынуждено уйти в `create_all()`.
    Она добавляет только отсутствующие колонки и заполняет безопасные значения,
    не помечая миграцию как выполненную. Благодаря этому полноценный Alembic
    backfill можно будет запустить позже без потери данных.
    """
    with engine.begin() as connection:
        inspector = inspect(connection)
        repaired_columns: dict[str, list[str]] = {}

        if inspector.has_table("users"):
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            missing_user_columns = []

            if "public_id" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN public_id VARCHAR(36)"))
                missing_user_columns.append("public_id")
            if "updated_at" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE"))
                missing_user_columns.append("updated_at")
            if "profile_metadata" not in user_columns:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN profile_metadata JSON DEFAULT '{}' NOT NULL")
                )
                missing_user_columns.append("profile_metadata")

            if missing_user_columns:
                repaired_columns["users"] = missing_user_columns

            user_ids_without_public_id = connection.execute(
                text("SELECT id FROM users WHERE public_id IS NULL")
            ).scalars().all()
            for user_id in user_ids_without_public_id:
                connection.execute(
                    text("UPDATE users SET public_id = :public_id WHERE id = :user_id"),
                    {"public_id": str(uuid4()), "user_id": user_id},
                )

            connection.execute(
                text(
                    """
                    UPDATE users
                    SET updated_at = COALESCE(updated_at, created_at, last_login_at)
                    WHERE updated_at IS NULL
                    """
                )
            )
            connection.execute(
                text("UPDATE users SET profile_metadata = '{}' WHERE profile_metadata IS NULL")
            )
            connection.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id)")
            )

        if inspector.has_table("session_participants"):
            participant_columns = {
                column["name"] for column in inspector.get_columns("session_participants")
            }
            missing_participant_columns = []

            if "device" not in participant_columns:
                connection.execute(
                    text("ALTER TABLE session_participants ADD COLUMN device VARCHAR(20)")
                )
                missing_participant_columns.append("device")
            if "browser" not in participant_columns:
                connection.execute(
                    text("ALTER TABLE session_participants ADD COLUMN browser VARCHAR(40)")
                )
                missing_participant_columns.append("browser")
            if "browser_version" not in participant_columns:
                connection.execute(
                    text("ALTER TABLE session_participants ADD COLUMN browser_version VARCHAR(20)")
                )
                missing_participant_columns.append("browser_version")
            if "device_model" not in participant_columns:
                connection.execute(
                    text("ALTER TABLE session_participants ADD COLUMN device_model VARCHAR(120)")
                )
                missing_participant_columns.append("device_model")
            if "participant_metadata" not in participant_columns:
                connection.execute(
                    text(
                        """
                        ALTER TABLE session_participants
                        ADD COLUMN participant_metadata JSON DEFAULT '{}' NOT NULL
                        """
                    )
                )
                missing_participant_columns.append("participant_metadata")
            if "final_rank" not in participant_columns:
                connection.execute(
                    text("ALTER TABLE session_participants ADD COLUMN final_rank INTEGER")
                )
                missing_participant_columns.append("final_rank")

            if missing_participant_columns:
                repaired_columns["session_participants"] = missing_participant_columns

            connection.execute(
                text(
                    """
                    UPDATE session_participants
                    SET participant_metadata = '{}'
                    WHERE participant_metadata IS NULL
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_session_participants_quiz_final_rank
                    ON session_participants (quiz_id, final_rank)
                    """
                )
            )

        if inspector.has_table("game_sessions"):
            session_columns = {column["name"] for column in inspector.get_columns("game_sessions")}
            if "winner_id" in session_columns:
                # winner_id больше не используется: победители определяются через session_participants.final_rank.
                connection.execute(
                    text("ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS fk_game_sessions_winner_id")
                )
                connection.execute(text("ALTER TABLE game_sessions DROP COLUMN IF EXISTS winner_id"))
                repaired_columns.setdefault("game_sessions", []).append("winner_id(dropped)")

        for table_name, columns in repaired_columns.items():
            logger.warning(
                "Schema fallback repaired missing columns  table=%s  columns=%s",
                table_name,
                ", ".join(columns),
            )


def init_db():
    """Применяет миграции при старте приложения.

    В штатном сценарии используется Alembic. Резервный `create_all` оставлен
    только как безопасный локальный fallback, чтобы разработчик не оставался
    без схемы БД в пустом окружении.
    """
    if os.getenv("QUIZPARTY_SKIP_DB_INIT") == "1":
        logger.info("Database init skipped by QUIZPARTY_SKIP_DB_INIT")
        return

    alembic_ini = Path(__file__).with_name("alembic.ini")
    if alembic_ini.exists():
        try:
            from alembic import command
            from alembic.config import Config

            config = Config(str(alembic_ini))
            config.set_main_option("sqlalchemy.url", DATABASE_URL)
            command.upgrade(config, "head")
            logger.info("Alembic migrations applied successfully")
            return
        except Exception as exc:  # pragma: no cover - exercised in real env
            # Если Alembic временно недоступен, не роняем локальную разработку.
            logger.warning("Alembic upgrade failed, falling back to create_all: %s", exc)

    Base.metadata.create_all(bind=engine)
    _repair_schema_after_fallback()
    logger.warning("Database schema created/repaired via create_all fallback")


@contextmanager
def get_db_session():
    """Открывает короткоживущую SQLAlchemy-сессию для внутреннего кода backend."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db():
    """FastAPI dependency, отдающая сессию БД на время одного HTTP-запроса."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
