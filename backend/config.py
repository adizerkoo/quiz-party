"""
Конфигурация приложения Quiz Party.

Загружает переменные окружения из .env, настраивает логирование,
определяет CORS-origins, пути к статике и игровые константы.
"""

import os
import logging
import socket as py_socket
from pathlib import Path
from dotenv import load_dotenv

from .logging_config import setup_logging

# ── Bootstrap ─────────────────────────────────────────────────────────
# 1) env  2) logging  — before anything else touches logger
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, verbose=True)
setup_logging()

logger = logging.getLogger(__name__)

# ── Database URL check ────────────────────────────────────────────────
db_url = os.getenv("DATABASE_URL", "not configured")
if "postgresql" in db_url:
    logger.info("Using PostgreSQL database")
else:
    logger.warning("DATABASE_URL not configured or not PostgreSQL")

# ── Constants ─────────────────────────────────────────────────────────
PLAYER_EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']

# CORS allowed origins
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost,http://localhost:3000").split(",")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS]

try:
    _, _, host_ips = py_socket.gethostbyname_ex(py_socket.gethostname())
    for ip in host_ips:
        if ip and not ip.startswith("127."):
            ALLOWED_ORIGINS.extend([f"http://{ip}", f"http://{ip}:8000"])
except Exception:
    pass

ALLOWED_ORIGINS = sorted(set(ALLOWED_ORIGINS))
logger.info("CORS origins: %s", ALLOWED_ORIGINS)

# ── Paths ─────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
FRONTEND_PATH = Path(BASE_DIR) / "frontend"
DATA_PATH = Path(BASE_DIR) / "data"
logger.debug("Frontend path: %s", FRONTEND_PATH)
logger.debug("Data path: %s", DATA_PATH)
