"""
Инициализация подключения к PostgreSQL и управление сессиями.

Создаёт SQLAlchemy engine с пулом соединений, предоставляет
контекстные менеджеры для сокет-обработчиков и HTTP-маршрутов.
"""

import os
import logging
from contextlib import contextmanager
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from .models import Base

logger = logging.getLogger(__name__)

# Явно указываем путь к файлу .env
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

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Создаёт таблицы в БД (если отсутствуют) и применяет миграции."""
    logger.info("Running init_db — creating tables and migrations")
    Base.metadata.create_all(bind=engine)
    _migrate()
    logger.info("init_db complete")

def _migrate():
    """Применяет инкрементальные миграции: добавляет колонки, индексы, обновляет данные.

    Безопасна при повторном запуске — каждая миграция обёрнута в try/except.
    """
    from sqlalchemy import text
    new_columns = [
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS device VARCHAR",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS browser VARCHAR",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS browser_version VARCHAR",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS winner_id INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS device_model VARCHAR",
        "ALTER TABLE quizzes RENAME COLUMN current_step TO current_question",
        "UPDATE quizzes SET current_question = 0 WHERE current_question = -1",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0",
        "UPDATE quizzes SET total_questions = jsonb_array_length(questions_data) WHERE total_questions = 0 AND questions_data IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_players_quiz_id_name ON players (quiz_id, name)",
    ]
    with engine.connect() as conn:
        for sql in new_columns:
            try:
                conn.execute(text(sql))
                conn.commit()
                logger.info("Migration applied: %s", sql)
            except Exception as e:
                conn.rollback()
                logger.debug("Migration skipped: %s — %s", sql, e)

@contextmanager
def get_db_session():
    """Контекстный менеджер для сокет-обработчиков — гарантирует закрытие сессии."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db():
    """Генератор для FastAPI Depends() — используется в HTTP-маршрутах."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()