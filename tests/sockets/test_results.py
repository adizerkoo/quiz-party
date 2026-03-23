"""
Тесты Socket.IO — обработчики завершения игры (results.py).

Тестирует finish_game_signal — фиксацию результатов, определение победителя,
отправку show_results и отключение игроков.
"""

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.models import Quiz, Player
from backend.sockets.results import register_results_handlers
from backend.cache import _quiz_cache, cache_quiz


class FakeSioManager:
    def __init__(self):
        self._handlers = {}
        self.emit = AsyncMock()
        self.disconnect = AsyncMock()

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
    register_results_handlers(manager)
    return manager


@pytest.fixture(autouse=True)
def clear_cache():
    _quiz_cache.clear()
    yield
    _quiz_cache.clear()


def _patch_db(db_session):
    mock = patch("backend.sockets.results.database.get_db_session")
    ctx = mock.start()
    ctx.return_value.__enter__ = MagicMock(return_value=db_session)
    ctx.return_value.__exit__ = MagicMock(return_value=False)
    return mock


@allure.feature("Socket.IO")
@allure.story("Finish Game")
class TestFinishGame:
    """Тесты завершения игры и формирования результатов."""

    @allure.title("finish_game_signal устанавливает status=finished")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_finish_sets_status(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Хост завершает игру → status=finished, finished_at заполнен."""
        with allure.step("Хост отправляет finish_game_signal"):
            mock = _patch_db(db_session)
            try:
                await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем статус и время завершения"):
            db_session.refresh(playing_quiz)
            assert playing_quiz.status == "finished"
            assert playing_quiz.finished_at is not None

    @allure.title("Победитель — игрок с максимальным score")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_finish_determines_winner(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Игрок с наибольшим score записывается в winner_id."""
        with allure.step("Устанавливаем score=5 игроку"):
            sample_player.score = 5
            db_session.commit()

        with allure.step("Завершаем игру"):
            mock = _patch_db(db_session)
            try:
                await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем победителя"):
            db_session.refresh(playing_quiz)
            assert playing_quiz.winner_id == sample_player.id

    @allure.title("Отправляется событие show_results с данными")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_finish_emits_show_results(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """emit('show_results') содержит results (массив игроков) и questions."""
        with allure.step("Подготавливаем данные игрока"):
            sample_player.score = 3
            sample_player.answers_history = {"1": "A"}
            db_session.commit()

        with allure.step("Завершаем игру"):
            mock = _patch_db(db_session)
            try:
                await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем содержимое show_results"):
            events = [c.args[0] for c in sio.emit.call_args_list]
            assert "show_results" in events

            show_call = next(c for c in sio.emit.call_args_list if c.args[0] == "show_results")
            data = show_call.args[1]
            assert "results" in data
            assert "questions" in data
            assert len(data["results"]) >= 1
            assert data["results"][0]["name"] == sample_player.name

    @allure.title("После finish все игроки отключаются")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_disconnects_all(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """sio.disconnect вызывается для всех участников."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        sio.disconnect.assert_called()

    @allure.title("Кэш викторины инвалидируется после завершения")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_invalidates_cache(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Закэшированная запись удаляется при finish."""
        with allure.step("Кэшируем викторину"):
            cache_quiz(playing_quiz.code, playing_quiz.id, [], 0)

        with allure.step("Завершаем игру"):
            mock = _patch_db(db_session)
            try:
                await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем инвалидацию кэша"):
            assert playing_quiz.code not in _quiz_cache

    @allure.title("Обычный игрок не может завершить игру")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_non_host_cannot_finish(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """finish_game_signal от игрока → status остаётся playing."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "player-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.status == "playing"  # не изменился

    @allure.title("Невалидный код комнаты — ничего не происходит")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_finish_invalid_room(self, sio):
        """XSS в room → emit не вызывается."""
        await sio.call("finish_game_signal", "sid", {"room": "<bad>"})
        sio.emit.assert_not_called()

    @allure.title("В результатах нет хоста")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_results_exclude_host(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Массив results в show_results не содержит хоста."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        show_call = next(c for c in sio.emit.call_args_list if c.args[0] == "show_results")
        names = [r["name"] for r in show_call.args[1]["results"]]
        assert sample_host.name not in names

    @allure.title("Несколько игроков сортируются по score DESC")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_multiple_players_sorted(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Игроки в results отсортированы по убыванию очков."""
        with allure.step("Добавляем игрока с высоким score"):
            p2 = Player(
                name="Pro", sid="sid-pro", quiz_id=playing_quiz.id,
                score=10, emoji="🦊", answers_history={},
            )
            db_session.add(p2)
            db_session.commit()

        with allure.step("Завершаем игру"):
            mock = _patch_db(db_session)
            try:
                await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("Проверяем сортировку по убыванию"):
            show_call = next(c for c in sio.emit.call_args_list if c.args[0] == "show_results")
            scores = [r["score"] for r in show_call.args[1]["results"]]
            assert scores == sorted(scores, reverse=True)
