#!/usr/bin/env python3
"""Утилита ручной инициализации схемы через тот же путь, что и у приложения."""

import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

from backend.database import init_db
from backend.logging_config import setup_logging

setup_logging()

logger = logging.getLogger(__name__)

logger.info("Initialising database…")
logger.info("DATABASE_URL: %s", os.getenv("DATABASE_URL"))

try:
    init_db()
    logger.info("Database initialised via Alembic or compatibility fallback")
except Exception as exc:
    logger.error("Database initialisation failed: %s", exc, exc_info=True)
    raise SystemExit(1) from exc
