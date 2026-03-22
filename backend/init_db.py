#!/usr/bin/env python3
"""
Скрипт для инициализации БД PostgreSQL
Запустите этот скрипт один раз для создания всех таблиц
"""

import logging
import os
import sys
from pathlib import Path

# Добавить текущую папку в sys.path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

# Загрузить переменные окружения
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

from .logging_config import setup_logging
setup_logging()

logger = logging.getLogger(__name__)

# Импортировать модели и БД
from .database import engine
from .models import Base

logger.info("Initialising database…")
logger.info("DATABASE_URL: %s", os.getenv("DATABASE_URL"))

try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialised — tables created: quizzes, players")
except Exception as e:
    logger.error("Database initialisation failed: %s", e, exc_info=True)
    exit(1)
