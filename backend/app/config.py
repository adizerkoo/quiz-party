"""Инфраструктурная runtime-конфигурация приложения Quiz Party."""

from __future__ import annotations

import logging
import os
import socket as py_socket
from pathlib import Path

from .logging_config import log_event, mask_database_url


logger = logging.getLogger(__name__)

db_url = os.getenv("DATABASE_URL", "")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

if db_url.startswith("postgresql://"):
    log_event(
        logger,
        logging.INFO,
        "config.database.detected",
        "Database configuration detected",
        database=mask_database_url(db_url),
    )
else:
    log_event(
        logger,
        logging.WARNING,
        "config.database.missing",
        "DATABASE_URL is missing or does not point to PostgreSQL",
        database=mask_database_url(db_url) or "not-configured",
    )

PLAYER_EMOJIS = [
    "🐶",
    "🐱",
    "🐭",
    "🐹",
    "🐰",
    "🦊",
    "🐻",
    "🐼",
    "🐨",
    "🐯",
    "🦁",
    "🐮",
    "🐷",
    "🐸",
    "🐵",
]

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost,http://localhost:3000",
).split(",")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]

try:
    _, _, host_ips = py_socket.gethostbyname_ex(py_socket.gethostname())
    for ip in host_ips:
        if ip and not ip.startswith("127."):
            ALLOWED_ORIGINS.extend([f"http://{ip}", f"http://{ip}:8000"])
except Exception:
    pass

ALLOWED_ORIGINS = sorted(set(ALLOWED_ORIGINS))
log_event(
    logger,
    logging.INFO,
    "config.cors.loaded",
    "CORS origins configured",
    origins=ALLOWED_ORIGINS,
)

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_PATH = BASE_DIR / "frontend"
DATA_PATH = BASE_DIR / "data"
log_event(
    logger,
    logging.DEBUG,
    "config.paths.loaded",
    "Backend paths resolved",
    frontend=str(FRONTEND_PATH),
    data=str(DATA_PATH),
)
