"""Централизованная настройка логирования backend-приложения."""

import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv(
    "LOG_FORMAT",
    "%(asctime)s | %(levelname)-7s | %(name)-28s | %(message)s",
)
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_DEFAULT_LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_FILE = os.getenv("LOG_FILE", str(_DEFAULT_LOG_DIR / "quiz-party.log"))
LOG_FILE_MAX = int(os.getenv("LOG_FILE_MAX", str(5 * 1024 * 1024)))
LOG_FILE_COUNT = int(os.getenv("LOG_FILE_COUNT", "5"))


def setup_logging() -> None:
    """Инициализирует консольное и файловое логирование для backend.

    Функция безопасна к повторному вызову: если обработчики уже добавлены,
    она просто ничего не делает.
    """
    root = logging.getLogger()

    if root.handlers:
        return

    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    console.setFormatter(formatter)
    root.addHandler(console)

    try:
        log_path = Path(LOG_FILE)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = RotatingFileHandler(
            filename=str(log_path),
            maxBytes=LOG_FILE_MAX,
            backupCount=LOG_FILE_COUNT,
            encoding="utf-8",
        )
        # В файл пишем максимум деталей, даже если консоль работает на INFO.
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
    except Exception as exc:  # noqa: BLE001
        # Ошибка файлового логирования не должна ломать старт приложения.
        root.warning("Could not set up file logging: %s", exc)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.DEBUG if LOG_LEVEL == "DEBUG" else logging.WARNING
    )
    logging.getLogger("engineio").setLevel(logging.WARNING)
    logging.getLogger("socketio").setLevel(logging.WARNING)

    root.info(
        "Logging initialised  level=%s  file=%s  max=%dKB  backups=%d",
        LOG_LEVEL,
        LOG_FILE,
        LOG_FILE_MAX // 1024,
        LOG_FILE_COUNT,
    )
