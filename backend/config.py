import os
import socket as py_socket
from pathlib import Path
from dotenv import load_dotenv
import logging

# Load environment variables from the backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, verbose=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info(f"Loading .env from: {env_path}")

# Log database configuration
db_url = os.getenv("DATABASE_URL", "not configured")
logger.info(f"DATABASE_URL: {db_url}")
if "postgresql" in db_url:
    logger.info("✅ Using PostgreSQL")
else:
    logger.warning("⚠️  DATABASE_URL not configured or not PostgreSQL")

PLAYER_EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']

# CORS allowed origins
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost,http://localhost:3000").split(",")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS]

# Добавляем локальные IP сервера, чтобы телефоны в одной Wi-Fi сети могли подключаться.
try:
    _, _, host_ips = py_socket.gethostbyname_ex(py_socket.gethostname())
    for ip in host_ips:
        if ip and not ip.startswith("127."):
            ALLOWED_ORIGINS.extend([f"http://{ip}", f"http://{ip}:8000"])
except Exception:
    pass

ALLOWED_ORIGINS = sorted(set(ALLOWED_ORIGINS))

logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")

# Paths
BASE_DIR = Path(__file__).parent.parent
FRONTEND_PATH = Path(BASE_DIR) / "frontend"
DATA_PATH = Path(BASE_DIR) / "data"

logger.info(f"Frontend path: {FRONTEND_PATH}")
logger.info(f"Data path: {DATA_PATH}")
