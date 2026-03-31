"""Тесты на отсутствие import-time side effects в инфраструктурных пакетах."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_backend_packages_do_not_bootstrap_runtime_on_import() -> None:
    """Импорт backend-пакетов не должен настраивать логирование или создавать engine."""
    script = """
import logging

root_logger = logging.getLogger()
initial_handlers = len(root_logger.handlers)

import backend  # noqa: F401
assert len(root_logger.handlers) == initial_handlers

import backend.app  # noqa: F401
assert len(root_logger.handlers) == initial_handlers

import backend.app.database as database
assert len(root_logger.handlers) == initial_handlers
assert database.engine is None
assert database.SessionLocal is None
assert database.DATABASE_URL is None
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout
