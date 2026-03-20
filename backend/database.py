import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from .models import Base

# Явно указываем путь к файлу .env
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./birthday_quiz.db"
)

print(f"DEBUG DATABASE.PY: Подключаюсь к {DATABASE_URL}") # Временный принт для проверки

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("postgresql://"):
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate()

def _migrate():
    """Добавляет новые колонки в существующие таблицы (безопасно при повторном запуске)."""
    from sqlalchemy import text
    new_columns = [
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS device VARCHAR",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS browser VARCHAR",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS browser_version VARCHAR",
        "ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS winner_id INTEGER",
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS device_model VARCHAR",
    ]
    with engine.connect() as conn:
        for sql in new_columns:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()
                pass  # колонка уже существует — игнорируем

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()