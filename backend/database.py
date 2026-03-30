"""SQLAlchemy engine, sessions and schema initialisation for Quiz Party."""

from __future__ import annotations

from contextlib import contextmanager
import logging
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from .logging_config import log_event, mask_database_url
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

log_event(
    logger,
    logging.INFO,
    "db.engine.created",
    "Database engine configured",
    database=mask_database_url(DATABASE_URL),
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
)

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


def _seed_system_question_bank() -> None:
    """Ensures developer library questions are present in the database."""
    from .contexts.library import ensure_system_question_bank_seed

    db = SessionLocal()
    try:
        ensure_system_question_bank_seed(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _verify_database_connection() -> None:
    """Runs a lightweight connectivity check before migrations and traffic."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        log_event(
            logger,
            logging.INFO,
            "db.connection.ready",
            "Database connection verified",
            database=mask_database_url(DATABASE_URL),
        )
    except Exception:
        log_event(
            logger,
            logging.ERROR,
            "db.connection.failed",
            "Database connection check failed",
            database=mask_database_url(DATABASE_URL),
            exc_info=True,
        )
        raise


def _repair_schema_after_fallback():
    """Repairs the PostgreSQL schema when local fallback had to use create_all()."""
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
                    text("ALTER TABLE session_participants ADD COLUMN left_at TIMESTAMP WITHOUT TIME ZONE")
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
    """Applies migrations when the application starts."""
    if os.getenv("QUIZPARTY_SKIP_DB_INIT") == "1":
        log_event(
            logger,
            logging.INFO,
            "db.init.skipped",
            "Database initialisation skipped by environment flag",
        )
        return

    log_event(
        logger,
        logging.INFO,
        "db.init.started",
        "Database initialisation started",
        database=mask_database_url(DATABASE_URL),
    )
    _verify_database_connection()

    alembic_ini = Path(__file__).with_name("alembic.ini")
    if alembic_ini.exists():
        try:
            from alembic import command
            from alembic.config import Config

            config = Config(str(alembic_ini))
            config.set_main_option("sqlalchemy.url", DATABASE_URL)
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

    Base.metadata.create_all(bind=engine)
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
    """Opens a short-lived SQLAlchemy session for internal backend code."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db():
    """FastAPI dependency that yields a DB session for the current request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
