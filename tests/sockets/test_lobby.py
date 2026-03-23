"""
Тесты Socket.IO — обработчики лобби (lobby.py).

Тестирует join_room, disconnect, kick_player через прямой вызов
зарегистрированных обработчиков с mock sio_manager.
"""

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.models import Quiz, Player
from backend.sockets.lobby import register_lobby_handlers
from backend.cache import _quiz_cache


class FakeSioManager:
    """Мок Socket.IO менеджера — записывает вызовы emit / enter_room / leave_room."""

    def __init__(self):
        self._handlers = {}
        self.emit = AsyncMock()
        self.enter_room = AsyncMock()
        self.leave_room = AsyncMock()
        self.disconnect = AsyncMock()

    def on(self, event):
        def decorator(fn):
            self._handlers[event] = fn
            return fn
        return decorator

    async def call(self, event, *args, **kwargs):
        handler = self._handlers.get(event)
        if handler:
            return await handler(*args, **kwargs)


@pytest.fixture()
def sio():
    manager = FakeSioManager()
    register_lobby_handlers(manager)
    return manager


@pytest.fixture(autouse=True)
def clear_cache():
    _quiz_cache.clear()
    yield
    _quiz_cache.clear()


@allure.feature("Socket.IO")
@allure.story("Join Room")
class TestJoinRoom:
    """Тесты события join_room — подключение к комнате."""

    @allure.title("Новый игрок успешно входит в комнату")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_new_player_joins(self, sio, db_session, sample_quiz, sample_host):
        """Новый игрок создаётся в БД, получает sid и emoji, emit вызывается."""
        with allure.step("Отправляем join_room от нового игрока"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("join_room", "new-sid-100", {
                    "room": "PARTY-TEST1",
                    "name": "Алиса",
                    "role": "player",
                })

        with allure.step("Проверяем, что emit и enter_room вызваны"):
            sio.enter_room.assert_called()
            sio.emit.assert_called()

        with allure.step("Проверяем игрока в БД"):
            player = db_session.query(Player).filter(Player.name == "Алиса").first()
            assert player is not None
            assert player.sid == "new-sid-100"
            assert player.is_host is False
            assert player.emoji is not None

    @allure.title("Хост подключается к комнате")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_host_joins(self, sio, db_session, sample_quiz):
        """Подключение с role=host создаёт игрока с is_host=True."""
        with allure.step("Отправляем join_room с role=host"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("join_room", "host-new", {
                    "room": "PARTY-TEST1",
                    "name": "Host",
                    "role": "host",
                })

        with allure.step("Проверяем, что хост создан в БД"):
            player = db_session.query(Player).filter(Player.name == "Host").first()
            assert player is not None
            assert player.is_host is True

    @allure.title("Второй хост блокируется если первый онлайн")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_duplicate_host_blocked(self, sio, db_session, sample_quiz, sample_host):
        """Попытка подключения второго хоста → emit('host_already_connected')."""
        with allure.step("Пытаемся подключить второго хоста"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("join_room", "host-dup", {
                    "room": "PARTY-TEST1",
                    "name": "Host2",
                    "role": "host",
                })

        with allure.step("Проверяем событие host_already_connected"):
            events = [call.args[0] for call in sio.emit.call_args_list]
            assert "host_already_connected" in events

    @allure.title("Конфликт имени разрешается суффиксом")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_name_conflict_resolved(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """Дублирующееся имя → emit('name_assigned') с изменённым именем."""
        with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
            mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
            mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

            await sio.call("join_room", "dup-sid", {
                "room": "PARTY-TEST1",
                "name": "Игрок1",  # уже занято sample_player
                "role": "player",
            })

        events = [call.args[0] for call in sio.emit.call_args_list]
        assert "name_assigned" in events

    @allure.title("Реконнект восстанавливает sid отключённого игрока")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_reconnect_restores_sid(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """Игрок с sid=None получает новый sid при повторном подключении."""
        with allure.step("Отключаем игрока (sid=None)"):
            sample_player.sid = None
            db_session.commit()

        with allure.step("Повторно подключаем игрока"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("join_room", "reconnect-sid", {
                    "room": "PARTY-TEST1",
                    "name": "Игрок1",
                    "role": "player",
                })

        with allure.step("Проверяем восстановление sid"):
            db_session.refresh(sample_player)
            assert sample_player.sid == "reconnect-sid"

    @allure.title("Невалидный код комнаты отклоняется")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_invalid_room_code_rejected(self, sio):
        """XSS-код в room → enter_room не вызывается."""
        await sio.call("join_room", "sid-x", {
            "room": "<script>alert(1)</script>",
            "name": "Hacker",
        })
        sio.enter_room.assert_not_called()

    @allure.title("Вход в уже идущую игру блокируется")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_late_join_blocked(self, sio, db_session, playing_quiz):
        """status=playing → emit('game_already_started')."""
        with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
            mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
            mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

            await sio.call("join_room", "late-sid", {
                "room": playing_quiz.code,
                "name": "Опоздавший",
                "role": "player",
            })

        events = [call.args[0] for call in sio.emit.call_args_list]
        assert "game_already_started" in events

    @allure.title("HTML-теги в имени удаляются (XSS-защита)")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_name_sanitized(self, sio, db_session, sample_quiz, sample_host):
        """Имя '<b>Evil</b>' санитизируется — теги удаляются."""
        with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
            mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
            mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

            await sio.call("join_room", "xss-sid", {
                "room": "PARTY-TEST1",
                "name": "<b>Evil</b>",
                "role": "player",
            })

        player = db_session.query(Player).filter(Player.sid == "xss-sid").first()
        if player:
            assert "<" not in player.name


@allure.feature("Socket.IO")
@allure.story("Disconnect")
class TestDisconnect:
    """Тесты события disconnect — отключение игрока."""

    @allure.title("При отключении sid игрока обнуляется")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_disconnect_clears_sid(self, sio, db_session, sample_quiz, sample_player):
        """disconnect → player.sid = None в БД."""
        with allure.step("Отправляем событие disconnect"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("disconnect", "player-sid-001")

        with allure.step("Проверяем, что sid обнулился"):
            db_session.refresh(sample_player)
            assert sample_player.sid is None

    @allure.title("Отключение неизвестного sid безопасно")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_disconnect_unknown_sid(self, sio, db_session):
        """disconnect с несуществующим sid не вызывает ошибок."""
        with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
            mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
            mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

            await sio.call("disconnect", "ghost-sid")  # no exception


@allure.feature("Socket.IO")
@allure.story("Kick Player")
class TestKickPlayer:
    """Тесты события kick_player — исключение игрока хостом."""

    @allure.title("Хост может исключить игрока из лобби")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_host_kicks_player(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """Хост кикает игрока → игрок удаляется из БД."""
        with allure.step("Хост отправляет kick_player"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("kick_player", "host-sid-001", {
                    "room": "PARTY-TEST1",
                    "playerName": "Игрок1",
                })

        with allure.step("Проверяем, что игрок удалён из БД"):
            kicked = db_session.query(Player).filter(Player.name == "Игрок1").first()
            assert kicked is None

    @allure.title("Обычный игрок не может кикнуть другого")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_non_host_cannot_kick(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """Попытка кика от обычного игрока — жертва остаётся в БД."""
        with allure.step("Добавляем второго игрока"):
            p2 = Player(name="P2", sid="sid-p2", quiz_id=sample_quiz.id, emoji="🐸")
            db_session.add(p2)
            db_session.commit()

        with allure.step("Обычный игрок пытается кикнуть P2"):
            with patch("backend.sockets.lobby.database.get_db_session") as mock_ctx:
                mock_ctx.return_value.__enter__ = MagicMock(return_value=db_session)
                mock_ctx.return_value.__exit__ = MagicMock(return_value=False)

                await sio.call("kick_player", "player-sid-001", {
                    "room": "PARTY-TEST1",
                    "playerName": "P2",
                })

        with allure.step("Проверяем, что P2 остался в БД"):
            still_there = db_session.query(Player).filter(Player.name == "P2").first()
            assert still_there is not None
