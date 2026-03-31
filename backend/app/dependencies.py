"""Общие инфраструктурные зависимости FastAPI для backend."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db


DatabaseSession = Annotated[Session, Depends(get_db)]
"""Типизированная зависимость SQLAlchemy-сессии для HTTP-обработчиков."""
