"""SQLAlchemy-движок, сессии и инициализация схемы для Quiz Party."""

from __future__ import annotations

from contextlib import contextmanager
import logging
import os
from uuid import uuid4

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .logging_config import log_event, mask_database_url


logger = logging.getLogger(__name__)
Base = declarative_base()
_MODELS_LOADED = False

DATABASE_URL: str | None = None
engine = None
SessionLocal = None

_ENGINE_SETTINGS = {
    "pool_pre_ping": True,
    "pool_size": 5,
    "max_overflow": 10,
    "pool_recycle": 300,
}


def load_model_modules() -> None:
    """Загружает все ORM-модули новой структуры, чтобы заполнить `Base.metadata`."""
    global _MODELS_LOADED
    if _MODELS_LOADED:
        return

    from backend.games.friends_game import models as _friends_game_models  # noqa: F401
    from backend.platform.content import models as _content_models  # noqa: F401
    from backend.platform.identity import models as _identity_models  # noqa: F401

    _MODELS_LOADED = True


def _normalize_database_url(database_url: str | None) -> str:
    """Проверяет и нормализует строку подключения к PostgreSQL."""
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is required. Set a PostgreSQL connection string in backend/.env"
        )

    normalized_url = database_url
    if normalized_url.startswith("postgres://"):
        normalized_url = normalized_url.replace("postgres://", "postgresql://", 1)

    if not normalized_url.startswith("postgresql://"):
        raise RuntimeError(f"Only PostgreSQL is supported. Got: {normalized_url}")

    return normalized_url


def configure_database_runtime(database_url: str | None = None) -> str:
    """Лениво создаёт engine и session factory только во время реального bootstrap backend."""
    global DATABASE_URL
    global SessionLocal
    global engine

    resolved_url = _normalize_database_url(database_url or os.getenv("DATABASE_URL"))
    if DATABASE_URL == resolved_url and engine is not None and SessionLocal is not None:
        return resolved_url

    if engine is not None and DATABASE_URL != resolved_url:
        engine.dispose()

    DATABASE_URL = resolved_url
    engine = create_engine(DATABASE_URL, **_ENGINE_SETTINGS)
    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=engine,
    )
    log_event(
        logger,
        logging.INFO,
        "db.engine.created",
        "Database engine configured",
        database=mask_database_url(DATABASE_URL),
        pool_size=_ENGINE_SETTINGS["pool_size"],
        max_overflow=_ENGINE_SETTINGS["max_overflow"],
        pool_recycle=_ENGINE_SETTINGS["pool_recycle"],
    )
    return DATABASE_URL


def _require_database_runtime():
    """Гарантирует, что engine и session factory уже инициализированы перед использованием БД."""
    configure_database_runtime()
    if engine is None or SessionLocal is None:
        raise RuntimeError("Database runtime is not configured")
    return engine, SessionLocal


def _seed_system_question_bank() -> None:
    """Гарантирует наличие системных вопросов библиотеки в базе данных."""
    from backend.platform.content.service import ensure_system_question_bank_seed

    _, session_factory = _require_database_runtime()
    db = session_factory()
    try:
        ensure_system_question_bank_seed(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _verify_database_connection() -> None:
    """Выполняет лёгкую проверку доступности БД перед миграциями и трафиком."""
    database_url = configure_database_runtime()
    active_engine, _ = _require_database_runtime()
    try:
        with active_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        log_event(
            logger,
            logging.INFO,
            "db.connection.ready",
            "Database connection verified",
            database=mask_database_url(database_url),
        )
    except Exception:
        log_event(
            logger,
            logging.ERROR,
            "db.connection.failed",
            "Database connection check failed",
            database=mask_database_url(database_url),
            exc_info=True,
        )
        raise


def _repair_schema_after_fallback():
    """Чинит PostgreSQL-схему, если локальный fallback использовал create_all()."""
    active_engine, _ = _require_database_runtime()
    with active_engine.begin() as connection:
        inspector = inspect(connection)
        repaired_columns: dict[str, list[str]] = {}

        if inspector.has_table("users"):
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            missing_user_columns = []

            if "public_id" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN public_id VARCHAR(36)"))
                missing_user_columns.append("public_id")
            if "updated_at" not in user_columns:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE")
                )
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

        if inspector.has_table("user_installations"):
            installation_columns = {
                column["name"] for column in inspector.get_columns("user_installations")
            }
            missing_installation_columns = []

            if "session_token_hash" not in installation_columns:
                connection.execute(
                    text("ALTER TABLE user_installations ADD COLUMN session_token_hash VARCHAR(128)")
                )
                missing_installation_columns.append("session_token_hash")
            if "session_token_issued_at" not in installation_columns:
                connection.execute(
                    text(
                        """
                        ALTER TABLE user_installations
                        ADD COLUMN session_token_issued_at TIMESTAMP WITHOUT TIME ZONE
                        """
                    )
                )
                missing_installation_columns.append("session_token_issued_at")

            if missing_installation_columns:
                repaired_columns["user_installations"] = missing_installation_columns

            connection.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS ix_user_installations_session_token_hash
                    ON user_installations (session_token_hash)
                    """
                )
            )

        if inspector.has_table("session_participants"):
            participant_columns = {
                column["name"] for column in inspector.get_columns("session_participants")
            }
            participant_checks = {
                constraint["name"]
                for constraint in inspector.get_check_constraints("session_participants")
                if constraint.get("name")
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
            if "left_at" not in participant_columns:
                connection.execute(
                    text(
                        "ALTER TABLE session_participants ADD COLUMN left_at TIMESTAMP WITHOUT TIME ZONE"
                    )
                )
                missing_participant_columns.append("left_at")

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
            if "ck_session_participants_status" in participant_checks:
                connection.execute(
                    text("ALTER TABLE session_participants DROP CONSTRAINT ck_session_participants_status")
                )
            connection.execute(
                text(
                    """
                    ALTER TABLE session_participants
                    ADD CONSTRAINT ck_session_participants_status
                    CHECK (status IN ('joined', 'disconnected', 'kicked', 'left', 'finished'))
                    """
                )
            )

        if inspector.has_table("game_sessions"):
            session_columns = {column["name"] for column in inspector.get_columns("game_sessions")}
            missing_session_columns = []

            if "last_activity_at" not in session_columns:
                connection.execute(
                    text("ALTER TABLE game_sessions ADD COLUMN last_activity_at TIMESTAMP WITHOUT TIME ZONE")
                )
                missing_session_columns.append("last_activity_at")
            if "cancelled_at" not in session_columns:
                connection.execute(
                    text("ALTER TABLE game_sessions ADD COLUMN cancelled_at TIMESTAMP WITHOUT TIME ZONE")
                )
                missing_session_columns.append("cancelled_at")
            if "cancel_reason" not in session_columns:
                connection.execute(
                    text("ALTER TABLE game_sessions ADD COLUMN cancel_reason VARCHAR(40)")
                )
                missing_session_columns.append("cancel_reason")

            if missing_session_columns:
                repaired_columns.setdefault("game_sessions", []).extend(missing_session_columns)

            connection.execute(
                text(
                    """
                    UPDATE game_sessions
                    SET last_activity_at = COALESCE(last_activity_at, updated_at, started_at, created_at)
                    WHERE last_activity_at IS NULL
                    """
                )
            )
            connection.execute(
                text(
                    """
                    UPDATE game_sessions
                    SET cancelled_at = COALESCE(cancelled_at, updated_at, finished_at, started_at, created_at)
                    WHERE status = 'cancelled' AND cancelled_at IS NULL
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_game_sessions_status_activity
                    ON game_sessions (status, last_activity_at)
                    """
                )
            )

            if "winner_id" in session_columns:
                connection.execute(
                    text("ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS fk_game_sessions_winner_id")
                )
                connection.execute(text("ALTER TABLE game_sessions DROP COLUMN IF EXISTS winner_id"))
                repaired_columns.setdefault("game_sessions", []).append("winner_id(dropped)")

        if inspector.has_table("quiz_questions"):
            question_columns = {column["name"] for column in inspector.get_columns("quiz_questions")}
            if "source_question_id" not in question_columns:
                connection.execute(
                    text(
                        """
                        ALTER TABLE quiz_questions
                        ADD COLUMN source_question_id INTEGER REFERENCES question_bank_questions(id)
                        """
                    )
                )
                repaired_columns.setdefault("quiz_questions", []).append("source_question_id")

            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_quiz_questions_source_question
                    ON quiz_questions (source_question_id)
                    """
                )
            )

        for table_name, columns in repaired_columns.items():
            log_event(
                logger,
                logging.WARNING,
                "db.schema.repaired",
                "Database schema repaired via fallback",
                table=table_name,
                columns=columns,
            )


def init_db():
    """Применяет миграции и fallback-инициализацию при старте приложения."""
    if os.getenv("QUIZPARTY_SKIP_DB_INIT") == "1":
        log_event(
            logger,
            logging.INFO,
            "db.init.skipped",
            "Database initialisation skipped by environment flag",
        )
        return

    load_model_modules()
    database_url = configure_database_runtime()
    log_event(
        logger,
        logging.INFO,
        "db.init.started",
        "Database initialisation started",
        database=mask_database_url(database_url),
    )
    _verify_database_connection()

    from pathlib import Path

    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    if alembic_ini.exists():
        try:
            from alembic import command
            from alembic.config import Config

            config = Config(str(alembic_ini))
            config.set_main_option("sqlalchemy.url", database_url)
            log_event(
                logger,
                logging.INFO,
                "db.migrations.started",
                "Applying Alembic migrations",
            )
            command.upgrade(config, "head")
            log_event(
                logger,
                logging.INFO,
                "db.migrations.completed",
                "Alembic migrations applied successfully",
            )
            _seed_system_question_bank()
            return
        except Exception as exc:  # pragma: no cover - exercised in real env
            log_event(
                logger,
                logging.WARNING,
                "db.migrations.failed",
                "Alembic upgrade failed, falling back to create_all",
                error=str(exc),
                exc_info=True,
            )

    active_engine, _ = _require_database_runtime()
    Base.metadata.create_all(bind=active_engine)
    _repair_schema_after_fallback()
    _seed_system_question_bank()
    log_event(
        logger,
        logging.WARNING,
        "db.fallback.completed",
        "Database schema created or repaired via create_all fallback",
    )


@contextmanager
def get_db_session():
    """Открывает короткоживущую SQLAlchemy-сессию для внутреннего backend-кода."""
    _, session_factory = _require_database_runtime()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


def get_db():
    """FastAPI-зависимость, которая отдаёт сессию БД для текущего запроса."""
    _, session_factory = _require_database_runtime()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
