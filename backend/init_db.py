#!/usr/bin/env python3
"""CLI-скрипт ручной инициализации базы данных через инфраструктуру приложения."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import bootstrap_runtime

bootstrap_runtime()

from backend.app.database import init_db
from backend.app.logging_config import log_event, mask_database_url

logger = logging.getLogger(__name__)

log_event(
    logger,
    logging.INFO,
    "db.init_cli.started",
    "Manual database initialisation started",
    database=mask_database_url(os.getenv("DATABASE_URL")),
)

try:
    init_db()
    log_event(
        logger,
        logging.INFO,
        "db.init_cli.completed",
        "Manual database initialisation completed",
    )
except Exception as exc:
    log_event(
        logger,
        logging.ERROR,
        "db.init_cli.failed",
        "Manual database initialisation failed",
        error=str(exc),
        exc_info=True,
    )
    raise SystemExit(1) from exc
