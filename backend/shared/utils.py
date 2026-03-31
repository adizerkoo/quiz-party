"""Небольшие универсальные утилиты backend без доменной логики."""

from __future__ import annotations

from datetime import UTC, datetime
import re
import uuid


def utc_now_naive() -> datetime:
    """Возвращает текущее UTC-время без tzinfo для naive-полей БД."""
    return datetime.now(UTC).replace(tzinfo=None)


def generate_public_id() -> str:
    """Генерирует внешний UUID-идентификатор для публичных ссылок и токенов."""
    return str(uuid.uuid4())


def normalize_answer(value: str) -> str:
    """Нормализует ответ для case-insensitive сравнения."""
    return str(value).strip().lower()


def sanitize_text(value: str) -> str:
    """Удаляет HTML-теги из пользовательского текста как базовую защиту от XSS."""
    if not value:
        return value
    return re.sub(r"<[^>]*?>", "", str(value))
