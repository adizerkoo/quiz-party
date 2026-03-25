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
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS owner_id INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS device_model VARCHAR",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS user_id INTEGER",
        "ALTER TABLE quizzes RENAME COLUMN current_step TO current_question",
        "UPDATE quizzes SET current_question = 0 WHERE current_question = -1",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0",
        "UPDATE quizzes SET total_questions = jsonb_array_length(questions_data) WHERE total_questions = 0 AND questions_data IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_players_quiz_id_name ON players (quiz_id, name)",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS answer_times JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_emoji VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS device_platform VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS device_brand VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP",
        "UPDATE users SET created_at = COALESCE(created_at, NOW()), last_login_at = COALESCE(last_login_at, NOW())",
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_username",
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key",
        "DROP INDEX IF EXISTS uq_users_username",
        "DROP INDEX IF EXISTS ix_users_username",
        "DROP INDEX IF EXISTS users_username_key",
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'users'
            ) AND NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
                ALTER TABLE users DROP COLUMN IF EXISTS email;
                ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
                ALTER TABLE users DROP COLUMN IF EXISTS first_name;
                ALTER TABLE users DROP COLUMN IF EXISTS last_name;
                ALTER TABLE users DROP COLUMN IF EXISTS last_logout_at;
                ALTER TABLE users ALTER COLUMN username SET NOT NULL;
                ALTER TABLE users ALTER COLUMN avatar_emoji SET NOT NULL;
                ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();
                ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
                ALTER TABLE users ALTER COLUMN last_login_at SET DEFAULT NOW();
                ALTER TABLE users ALTER COLUMN last_login_at SET NOT NULL;
            END IF;
        END
        $$;
        """,
        """
        DO $$
        DECLARE
            constraint_name TEXT;
            index_name TEXT;
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'users'
            ) THEN
                FOR constraint_name IN
                    SELECT con.conname
                    FROM pg_constraint con
                    JOIN pg_class rel ON rel.oid = con.conrelid
                    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
                    JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = cols.attnum
                    WHERE nsp.nspname = 'public'
                      AND rel.relname = 'users'
                      AND con.contype = 'u'
                    GROUP BY con.conname
                    HAVING array_agg(attr.attname ORDER BY cols.ord) = ARRAY['username']
                LOOP
                    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', constraint_name);
                END LOOP;

                FOR index_name IN
                    SELECT index_rel.relname
                    FROM pg_index idx
                    JOIN pg_class index_rel ON index_rel.oid = idx.indexrelid
                    JOIN pg_class table_rel ON table_rel.oid = idx.indrelid
                    JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
                    JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
                    JOIN pg_attribute attr ON attr.attrelid = table_rel.oid AND attr.attnum = cols.attnum
                    WHERE table_ns.nspname = 'public'
                      AND table_rel.relname = 'users'
                      AND idx.indisunique = TRUE
                      AND idx.indisprimary = FALSE
                    GROUP BY index_rel.relname
                    HAVING array_agg(attr.attname ORDER BY cols.ord) = ARRAY['username']
                LOOP
                    EXECUTE format('DROP INDEX IF EXISTS public.%I', index_name);
                END LOOP;
            END IF;
        END
        $$;
        """,
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
