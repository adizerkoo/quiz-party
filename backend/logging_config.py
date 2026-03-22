"""
Centralised logging configuration for Quiz Party.

Usage in any module:
    import logging
    logger = logging.getLogger(__name__)

Log levels used across the project:
    DEBUG   — SQL queries, raw socket payloads, internal state (very verbose)
    INFO    — Normal lifecycle events: startup, join/leave, quiz created/started/finished
    WARNING — Recoverable problems: rate-limit hits, validation failures, reconnects
    ERROR   — Unexpected failures: DB errors, unhandled exceptions
"""

import os
import sys
import logging

# ---------------------------------------------------------------------------
#  Constants
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv(
    "LOG_FORMAT",
    "%(asctime)s | %(levelname)-7s | %(name)-28s | %(message)s",
)
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging() -> None:
    """Call once at application startup (before any other import that logs)."""
    root = logging.getLogger()

    # Avoid adding duplicate handlers on reload / re-import
    if root.handlers:
        return

    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    # Console handler — stdout (plays nice with docker / heroku logs)
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    console.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
    root.addHandler(console)

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.DEBUG if LOG_LEVEL == "DEBUG" else logging.WARNING
    )
    logging.getLogger("engineio").setLevel(logging.WARNING)
    logging.getLogger("socketio").setLevel(logging.WARNING)

    root.info(
        "Logging initialised  level=%s  format=%r",
        LOG_LEVEL,
        LOG_FORMAT,
    )
