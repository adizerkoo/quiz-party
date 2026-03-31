"""Инфраструктурный пакет backend с явным runtime-bootstrap без side effects."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
_ENVIRONMENT_LOADED = False
_LOGGING_CONFIGURED = False


def bootstrap_runtime(*, configure_logging: bool = True) -> None:
    """Явно загружает `.env` и при необходимости настраивает логирование backend."""
    global _ENVIRONMENT_LOADED
    global _LOGGING_CONFIGURED

    if not _ENVIRONMENT_LOADED:
        load_dotenv(dotenv_path=_ENV_PATH, verbose=False)
        _ENVIRONMENT_LOADED = True

    if configure_logging and not _LOGGING_CONFIGURED:
        from .logging_config import setup_logging

        setup_logging()
        _LOGGING_CONFIGURED = True
