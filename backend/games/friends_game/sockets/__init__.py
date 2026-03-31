"""Socket.IO-обработчики модуля текущей игры с друзьями."""

from __future__ import annotations

from .game import register_game_handlers
from .lobby import register_lobby_handlers
from .results import register_results_handlers
from .sync import register_sync_handlers


def register_socket_handlers(sio_manager):
    """Регистрирует все Socket.IO-обработчики игры с друзьями."""
    register_lobby_handlers(sio_manager)
    register_game_handlers(sio_manager)
    register_sync_handlers(sio_manager)
    register_results_handlers(sio_manager)
