"""
Централизованная настройка логирования Quiz Party.

Использование в любом модуле::

    import logging
    logger = logging.getLogger(__name__)

Уровни логирования::

    DEBUG   — SQL-запросы, сырые пакеты сокетов, внутреннее состояние
    INFO    — События жизненного цикла: старт, вход/выход, создание/завершение игры
    WARNING — Восстановимые проблемы: rate-limit, ошибки валидации, реконнекты
    ERROR   — Непредвиденные сбои: ошибки БД, необработанные исключения

Переменные окружения::

    LOG_LEVEL      — уровень логирования (умолчание: INFO)
    LOG_FORMAT     — формат строк в консоли
    LOG_FILE       — путь к файлу лога (умолчание: logs/quiz-party.log)
    LOG_FILE_MAX   — максимальный размер файла до ротации (умолчание: 5 MB)
    LOG_FILE_COUNT — количество ротируемых копий (умолчание: 5)
"""

import os
import sys
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

# ---------------------------------------------------------------------------
#  Constants
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv(
    "LOG_FORMAT",
    "%(asctime)s | %(levelname)-7s | %(name)-28s | %(message)s",
)
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# File handler settings
_DEFAULT_LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_FILE = os.getenv("LOG_FILE", str(_DEFAULT_LOG_DIR / "quiz-party.log"))
LOG_FILE_MAX = int(os.getenv("LOG_FILE_MAX", str(5 * 1024 * 1024)))   # 5 MB
LOG_FILE_COUNT = int(os.getenv("LOG_FILE_COUNT", "5"))


def setup_logging() -> None:
    """Инициализирует логирование: консоль + ротируемый файл.

    Вызывается один раз при старте приложения, до любых импортов,
    которые могут использовать logger.
    """
    root = logging.getLogger()

    # Avoid adding duplicate handlers on reload / re-import
    if root.handlers:
        return

    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)

    # ── Console handler — stdout (plays nice with docker / heroku logs) ──
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    console.setFormatter(formatter)
    root.addHandler(console)

    # ── File handler — RotatingFileHandler ───────────────────────────────
    try:
        log_path = Path(LOG_FILE)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = RotatingFileHandler(
            filename=str(log_path),
            maxBytes=LOG_FILE_MAX,
            backupCount=LOG_FILE_COUNT,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)   # file always captures everything
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
    except Exception as exc:  # noqa: BLE001
        # If file logging fails (read-only FS, permissions) — continue with console only
        root.warning("Could not set up file logging: %s", exc)

    # Silence noisy third-party loggers
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
