"""Регресс-тесты для runtime fallback-строк lobby и sync flow."""

from __future__ import annotations

from backend.games.friends_game.service import DEFAULT_EMOJI
from backend.games.friends_game.sockets.lobby import (
    DEFAULT_HOST_NAME,
    DEFAULT_PLAYER_NAME,
    _is_placeholder_host_name,
    _normalized_name,
)


def test_normalized_name_uses_readable_player_fallback() -> None:
    """Пустое или некорректное имя должно заменяться на читаемый fallback."""
    assert _normalized_name("") == DEFAULT_PLAYER_NAME
    assert _normalized_name("   ") == DEFAULT_PLAYER_NAME


def test_placeholder_host_name_detection_accepts_legacy_placeholders() -> None:
    """Host flow должен узнавать технические и человекочитаемые placeholder-имена."""
    assert _is_placeholder_host_name("HOST") is True
    assert _is_placeholder_host_name(DEFAULT_HOST_NAME) is True
    assert _is_placeholder_host_name(DEFAULT_PLAYER_NAME) is True
    assert _is_placeholder_host_name("Настя") is False


def test_default_emoji_constant_remains_readable() -> None:
    """Fallback emoji должен быть стабильным и пригодным для клиентского UI."""
    assert DEFAULT_EMOJI == "👤"
