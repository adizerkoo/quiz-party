from .lobby import register_lobby_handlers
from .game import register_game_handlers
from .sync import register_sync_handlers
from .results import register_results_handlers


def register_socket_handlers(sio_manager):
    register_lobby_handlers(sio_manager)
    register_game_handlers(sio_manager)
    register_sync_handlers(sio_manager)
    register_results_handlers(sio_manager)
