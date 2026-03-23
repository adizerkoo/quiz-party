"""
Тесты Socket.IO — обработчики синхронизации (sync.py).

Тестирует request_sync и get_update — отправку состояния при реконнекте.
"""

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.models import Player
from backend.sockets.sync import register_sync_handlers
from backend.cache import _quiz_cache


class FakeSioManager:
    def __init__(self):
        self._handlers = {}
        self.emit = AsyncMock()

    def on(self, event):
        def decorator(fn):
            self._handlers[event] = fn
            return fn
        return decorator

    async def call(self, event, *args):
        handler = self._handlers.get(event)
        if handler:
            return await handler(*args)


@pytest.fixture()
def sio():
    manager = FakeSioManager()
    register_sync_handlers(manager)
    return manager


@pytest.fixture(autouse=True)
def clear_cache():
    _quiz_cache.clear()
    yield
    _quiz_cache.clear()


def _patch_db(db_session):
    mock = patch("backend.sockets.sync.database.get_db_session")
    ctx = mock.start()
    ctx.return_value.__enter__ = MagicMock(return_value=db_session)
    ctx.return_value.__exit__ = MagicMock(return_value=False)
    return mock


@allure.feature("Socket.IO")
@allure.story("Request Sync")
class TestRequestSync:
    """Тесты синхронизации состояния при реконнекте."""

    @allure.title("Sync для waiting-викторины возвращает базовое состояние")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_waiting_quiz(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """status=waiting → sync_state с currentQuestion=0."""
        with allure.step("Отправляем request_sync"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": "PARTY-TEST1"})
            finally:
                mock.stop()

        with allure.step("Проверяем sync_state для waiting"):
            sio.emit.assert_called()
            call = sio.emit.call_args_list[0]
            assert call.args[0] == "sync_state"

            state = call.args[1]
            assert state["status"] == "waiting"
            assert state["currentQuestion"] == 0

    @allure.title("Sync для playing-викторины отправляет текущий вопрос")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_playing_quiz(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """status=playing → sync_state с currentQuestion=1."""
        with allure.step("Отправляем request_sync для идущей игры"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем текущий вопрос"):
            call = sio.emit.call_args_list[0]
            state = call.args[1]
            assert state["status"] == "playing"
            assert state["currentQuestion"] == 1

    @allure.title("Sync для finished-викторины дополнительно отправляет show_results")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_finished_sends_results(self, sio, db_session, finished_quiz, sample_host, sample_player):
        """status=finished → sync_state + show_results."""
        with allure.step("Отправляем request_sync для завершённой игры"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": finished_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем наличие sync_state и show_results"):
            events = [c.args[0] for c in sio.emit.call_args_list]
            assert "sync_state" in events
            assert "show_results" in events

    @allure.title("Sync содержит данные конкретного игрока")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_sync_includes_player_data(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Ответ содержит score, emoji, answersHistory конкретного игрока."""
        with allure.step("Устанавливаем данные игрока"):
            sample_player.score = 5
            sample_player.emoji = "🐱"
            sample_player.answers_history = {"1": "test"}
            db_session.commit()

        with allure.step("Отправляем request_sync"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем данные игрока в sync_state"):
            state = sio.emit.call_args_list[0].args[1]
            assert state["score"] == 5
            assert state["emoji"] == "🐱"
            assert state["answersHistory"] == {"1": "test"}

    @allure.title("Хост при sync получает список отключённых игроков")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_sync_host_gets_disconnected_list(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Хост получает emit('init_disconnected') со списком офлайн-игроков."""
        sample_player.sid = None
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        events = [c.args[0] for c in sio.emit.call_args_list]
        assert "init_disconnected" in events

    @allure.title("Sync для несуществующей комнаты — ничего не отправляется")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_sync_missing_quiz(self, sio, db_session):
        """Несуществующий room → emit не вызывается."""
        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "sid-x", {"room": "PARTY-NOPE0"})
        finally:
            mock.stop()

        sio.emit.assert_not_called()

    @allure.title("Пустой код комнаты — ничего не отправляется")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_sync_invalid_room(self, sio):
        """Пустой room → emit не вызывается."""
        await sio.call("request_sync", "sid-x", {"room": ""})
        sio.emit.assert_not_called()


@allure.feature("Socket.IO")
@allure.story("Get Update")
class TestGetUpdate:
    """Тесты получения обновлений состояния."""

    @allure.title("get_update отправляет update_answers с данными игроков")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_get_update_returns_players(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """get_update → emit('update_answers') с полями игроков."""
        mock = _patch_db(db_session)
        try:
            await sio.call("get_update", "host-sid-001", playing_quiz.code)
        finally:
            mock.stop()

        sio.emit.assert_called()
        call = sio.emit.call_args_list[0]
        assert call.args[0] == "update_answers"

    @pytest.mark.asyncio
    async def test_get_update_missing_quiz(self, sio, db_session):
        mock = _patch_db(db_session)
        try:
            await sio.call("get_update", "sid-x", "PARTY-NOPE0")
        finally:
            mock.stop()

        sio.emit.assert_not_called()
