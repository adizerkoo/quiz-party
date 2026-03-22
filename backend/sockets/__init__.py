"""Пакет Socket.IO обработчиков событий (лобби, игра, синхронизация, результаты)."""

from .lobby import register_lobby_handlers
from .game import register_game_handlers
from .sync import register_sync_handlers
from .results import register_results_handlers


def register_socket_handlers(sio_manager):
    """Регистрирует все группы сокет-обработчиков на экземпляре SocketManager."""
    register_lobby_handlers(sio_manager)
    register_game_handlers(sio_manager)
    register_sync_handlers(sio_manager)
    register_results_handlers(sio_manager)
