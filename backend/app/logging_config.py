"""Центральная настройка логирования и вспомогательные logging-утилиты."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4


_LOG_CONTEXT: ContextVar[dict[str, Any]] = ContextVar(
    "quizparty_log_context",
    default={},
)
_LOGGING_CONFIGURED = False
_QUIZPARTY_HANDLER_FLAG = "_quizparty_handler"
_LOG_CHANNEL_GAME_EVENTS = "game_events"
_STANDARD_RECORD_KEYS = set(logging.makeLogRecord({}).__dict__.keys()) | {
    "message",
    "asctime",
}
_EXTRA_KEY_ORDER = (
    "event",
    "request_id",
    "method",
    "path",
    "status_code",
    "duration_ms",
    "client",
    "room",
    "quiz_id",
    "player",
    "role",
    "question",
    "sid",
    "database",
)


def _is_meaningful(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value != ""
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _normalize_channels(channels: Iterable[str] | str | None) -> tuple[str, ...]:
    if channels is None:
        return ()
    if isinstance(channels, str):
        return (channels,) if channels else ()
    return tuple(channel for channel in channels if channel)


class QuizPartyFormatter(logging.Formatter):
    """Formatter that appends contextual key=value pairs to every log record."""

    def format(self, record: logging.LogRecord) -> str:
        record.message = record.getMessage()
        record.asctime = self.formatTime(record, self.datefmt)

        line = (
            f"{record.asctime} | {record.levelname:<8} | "
            f"{record.name:<28} | {record.message}"
        )

        extras = self._collect_extras(record)
        if extras:
            line = f"{line} | {extras}"

        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            line = f"{line}\n{record.exc_text}"
        if record.stack_info:
            line = f"{line}\n{self.formatStack(record.stack_info)}"

        return line

    def _collect_extras(self, record: logging.LogRecord) -> str:
        merged = dict(_LOG_CONTEXT.get())
        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_KEYS or key.startswith("_"):
                continue
            merged[key] = value

        ordered_keys: list[str] = []
        seen: set[str] = set()

        for key in _EXTRA_KEY_ORDER:
            if key in merged and _is_meaningful(merged[key]):
                ordered_keys.append(key)
                seen.add(key)

        for key in sorted(merged):
            if key in seen or not _is_meaningful(merged[key]):
                continue
            ordered_keys.append(key)

        return " ".join(
            f"{key}={self._serialize_value(merged[key])}"
            for key in ordered_keys
        )

    @staticmethod
    def _serialize_value(value: Any) -> str:
        if isinstance(value, str):
            if any(char.isspace() for char in value) or any(
                char in value for char in ('"', "=", "|")
            ):
                return json.dumps(value, ensure_ascii=False)
            return value
        if isinstance(value, (dict, list, tuple, set)):
            return json.dumps(value, ensure_ascii=False, default=str)
        return str(value)


class ChannelFilter(logging.Filter):
    """Routes log records to handlers based on explicit internal channels."""

    def __init__(self, channel: str):
        super().__init__()
        self.channel = channel

    def filter(self, record: logging.LogRecord) -> bool:
        channels = getattr(record, "_quizparty_channels", ())
        return self.channel in channels


def _resolve_level(value: str | None, default: str) -> str:
    candidate = (value or default).upper()
    if candidate not in logging._nameToLevel:  # type: ignore[attr-defined]
        return default
    return candidate


def _level_number(level_name: str) -> int:
    return int(logging._nameToLevel[level_name])  # type: ignore[attr-defined]


def _default_log_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "logs"


def generate_request_id(value: str | None = None) -> str:
    """Returns a stable request id or generates a new one."""
    if value:
        normalized = str(value).strip()
        if normalized:
            return normalized[:64]
    return uuid4().hex[:12]


def mask_database_url(database_url: str | None) -> str | None:
    """Masks database credentials before writing the URL to logs."""
    if not database_url:
        return None

    parsed = urlsplit(database_url)
    hostname = parsed.hostname or ""
    if parsed.port:
        hostname = f"{hostname}:{parsed.port}"

    auth_prefix = ""
    if parsed.username:
        auth_prefix = f"{parsed.username}:***@"

    masked_netloc = f"{auth_prefix}{hostname}" if hostname else auth_prefix.rstrip("@")
    return urlunsplit(
        (
            parsed.scheme,
            masked_netloc,
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )


@contextmanager
def bind_log_context(**context: Any):
    """Temporarily merges contextual values into the current logging scope."""
    current = dict(_LOG_CONTEXT.get())
    merged = current.copy()
    merged.update({key: value for key, value in context.items() if _is_meaningful(value)})
    token = _LOG_CONTEXT.set(merged)
    try:
        yield merged
    finally:
        _LOG_CONTEXT.reset(token)


def build_log_extra(
    *,
    room: str | None = None,
    quiz: Any | None = None,
    quiz_id: Any | None = None,
    participant: Any | None = None,
    player: str | None = None,
    role: str | None = None,
    question: Any | None = None,
    sid: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Builds consistent logging extras from Quiz Party domain objects."""
    if quiz is not None:
        room = room or getattr(quiz, "code", None)
        quiz_id = quiz_id or getattr(quiz, "id", None)

    if participant is not None:
        player = player or getattr(participant, "name", None)
        role = role or (
            "host"
            if bool(getattr(participant, "is_host", False))
            else getattr(participant, "role", None)
        )

    if question is not None and not isinstance(question, (int, str)):
        question = getattr(question, "position", question)

    payload = {
        "room": room,
        "quiz_id": quiz_id,
        "player": player,
        "role": role,
        "question": question,
        "sid": sid,
    }
    payload.update(extra)
    return {key: value for key, value in payload.items() if _is_meaningful(value)}


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    message: str | None = None,
    *,
    exc_info: Any = False,
    stack_info: bool = False,
    channels: Iterable[str] | str | None = None,
    **context: Any,
) -> None:
    """Writes a log record with the unified event field and contextual extras."""
    extra = {"event": event}
    normalized_channels = _normalize_channels(channels)
    if normalized_channels:
        extra["_quizparty_channels"] = normalized_channels
    extra.update({key: value for key, value in context.items() if _is_meaningful(value)})
    logger.log(
        level,
        message or event,
        extra=extra,
        exc_info=exc_info,
        stack_info=stack_info,
    )


def log_game_event(
    logger: logging.Logger,
    level: int,
    event: str,
    message: str | None = None,
    *,
    exc_info: Any = False,
    stack_info: bool = False,
    **context: Any,
) -> None:
    """Writes an explicitly marked gameplay event for game-events.log routing."""
    log_event(
        logger,
        level,
        event,
        message,
        exc_info=exc_info,
        stack_info=stack_info,
        channels=(_LOG_CHANNEL_GAME_EVENTS,),
        **context,
    )


def _extract_socket_context(sid: str, payload: Any) -> dict[str, Any]:
    context: dict[str, Any] = {"sid": sid}

    if isinstance(payload, Mapping):
        room = payload.get("room")
        if _is_meaningful(room):
            context["room"] = room

        player = payload.get("name") or payload.get("playerName")
        if _is_meaningful(player):
            context["player"] = player

        role = payload.get("role")
        if _is_meaningful(role):
            context["role"] = role

        question = (
            payload.get("questionIndex")
            if "questionIndex" in payload
            else payload.get("question")
        )
        if question is None:
            question = payload.get("expectedQuestion")
        if _is_meaningful(question):
            context["question"] = question

    elif isinstance(payload, str) and payload:
        context["room"] = payload

    return context


def logged_socket_handler(sio_manager, event_name: str, logger: logging.Logger):
    """Registers a socket handler wrapped with contextual logging and crash logs."""

    def decorator(func):
        @sio_manager.on(event_name)
        @wraps(func)
        async def wrapper(sid, *args, **kwargs):
            payload = args[0] if args else None
            with bind_log_context(**_extract_socket_context(sid, payload)):
                log_event(
                    logger,
                    logging.DEBUG,
                    f"socket.{event_name}.received",
                    "Socket event received",
                )
                try:
                    return await func(sid, *args, **kwargs)
                except Exception:
                    log_event(
                        logger,
                        logging.ERROR,
                        f"socket.{event_name}.failed",
                        "Socket event failed with unexpected exception",
                        exc_info=True,
                    )
                    raise

        return wrapper

    return decorator


def _has_handler(root: logging.Logger, handler_flag: str) -> bool:
    return any(
        getattr(handler, _QUIZPARTY_HANDLER_FLAG, "") == handler_flag
        for handler in root.handlers
    )


def _build_file_handler(
    *,
    path: Path,
    level_name: str,
    formatter: logging.Formatter,
    handler_flag: str,
    rotation_bytes: int,
    backup_count: int,
    filters: Iterable[logging.Filter] | None = None,
) -> RotatingFileHandler:
    path.parent.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        filename=str(path),
        maxBytes=rotation_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    handler.setLevel(_level_number(level_name))
    handler.setFormatter(formatter)
    setattr(handler, _QUIZPARTY_HANDLER_FLAG, handler_flag)
    for log_filter in filters or ():
        handler.addFilter(log_filter)
    return handler


def setup_logging() -> None:
    """Configures console and rotating file logging for the backend."""
    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    console_level_name = _resolve_level(
        os.getenv("LOG_CONSOLE_LEVEL") or os.getenv("LOG_LEVEL"),
        "INFO",
    )
    app_log_level_name = _resolve_level(
        os.getenv("APP_LOG_LEVEL") or os.getenv("LOG_FILE_LEVEL"),
        "DEBUG",
    )
    error_log_level_name = _resolve_level(os.getenv("ERROR_LOG_LEVEL"), "ERROR")
    game_events_log_level_name = _resolve_level(os.getenv("GAME_EVENTS_LOG_LEVEL"), "INFO")
    sqlalchemy_level_name = _resolve_level(
        os.getenv("LOG_SQLALCHEMY_LEVEL"),
        "WARNING",
    )

    log_dir = Path(os.getenv("LOG_DIR", str(_default_log_dir())))
    app_log_file = Path(
        os.getenv("APP_LOG_FILE", os.getenv("LOG_FILE", str(log_dir / "app.log")))
    )
    error_log_file = Path(os.getenv("ERROR_LOG_FILE", str(log_dir / "error.log")))
    game_events_log_file = Path(
        os.getenv("GAME_EVENTS_LOG_FILE", str(log_dir / "game-events.log"))
    )

    rotation_bytes = int(
        os.getenv("LOG_ROTATION_BYTES", os.getenv("LOG_FILE_MAX", str(5 * 1024 * 1024)))
    )
    backup_count = int(os.getenv("LOG_BACKUP_COUNT", os.getenv("LOG_FILE_COUNT", "5")))

    formatter = QuizPartyFormatter(datefmt="%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    root.setLevel(
        min(
            _level_number(console_level_name),
            _level_number(app_log_level_name),
            _level_number(game_events_log_level_name),
        )
    )

    if not _has_handler(root, "console"):
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(_level_number(console_level_name))
        console_handler.setFormatter(formatter)
        setattr(console_handler, _QUIZPARTY_HANDLER_FLAG, "console")
        root.addHandler(console_handler)

    logger = logging.getLogger(__name__)

    try:
        if not _has_handler(root, "app_file"):
            root.addHandler(
                _build_file_handler(
                    path=app_log_file,
                    level_name=app_log_level_name,
                    formatter=formatter,
                    handler_flag="app_file",
                    rotation_bytes=rotation_bytes,
                    backup_count=backup_count,
                )
            )
    except Exception:
        log_event(
            logger,
            logging.WARNING,
            "logging.app_file.failed",
            "Failed to enable app.log handler",
            exc_info=True,
        )

    try:
        if not _has_handler(root, "error_file"):
            root.addHandler(
                _build_file_handler(
                    path=error_log_file,
                    level_name=error_log_level_name,
                    formatter=formatter,
                    handler_flag="error_file",
                    rotation_bytes=rotation_bytes,
                    backup_count=backup_count,
                )
            )
    except Exception:
        log_event(
            logger,
            logging.WARNING,
            "logging.error_file.failed",
            "Failed to enable error.log handler",
            exc_info=True,
        )

    try:
        if not _has_handler(root, "game_events_file"):
            root.addHandler(
                _build_file_handler(
                    path=game_events_log_file,
                    level_name=game_events_log_level_name,
                    formatter=formatter,
                    handler_flag="game_events_file",
                    rotation_bytes=rotation_bytes,
                    backup_count=backup_count,
                    filters=(ChannelFilter(_LOG_CHANNEL_GAME_EVENTS),),
                )
            )
    except Exception:
        log_event(
            logger,
            logging.WARNING,
            "logging.game_events_file.failed",
            "Failed to enable game-events.log handler",
            exc_info=True,
        )

    logging.captureWarnings(True)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(_level_number(sqlalchemy_level_name))
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("engineio").setLevel(logging.WARNING)
    logging.getLogger("socketio").setLevel(logging.WARNING)

    _LOGGING_CONFIGURED = True
    log_event(
        logger,
        logging.INFO,
        "logging.configured",
        "Logging configured",
        app_log_file=str(app_log_file),
        error_log_file=str(error_log_file),
        game_events_log_file=str(game_events_log_file),
        console_level=console_level_name,
        app_log_level=app_log_level_name,
        error_log_level=error_log_level_name,
        game_events_log_level=game_events_log_level_name,
        rotation_bytes=rotation_bytes,
        backups=backup_count,
    )
