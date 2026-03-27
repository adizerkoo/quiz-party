"""Quiz Party backend package bootstrap."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

from .logging_config import setup_logging


_ENV_PATH = Path(__file__).with_name(".env")

load_dotenv(dotenv_path=_ENV_PATH, verbose=False)
setup_logging()
