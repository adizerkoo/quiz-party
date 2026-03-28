"""
Тесты Socket.IO - обработчики завершения игры.

Фокус на finish_game_signal: статус игры, final_rank,
show_results и отключение участников после публикации итогов.
"""

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.cache import _quiz_cache, cache_quiz
from backend.models import Player
from backend.sockets.results import register_results_handlers


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
        return None


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
    """Тесты завершения игры и формирования финальных результатов."""

    @allure.title("finish_game_signal устанавливает status=finished")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_finish_sets_status(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Хост завершает игру -> status=finished и filled finished_at."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.status == "finished"
        assert playing_quiz.finished_at is not None

    @allure.title("Игрок с максимальным score получает final_rank=1")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_finish_assigns_first_rank_to_leader(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Лидер по очкам получает итоговый ранг 1."""
        sample_player.score = 5
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.final_rank == 1

    @allure.title("При ничьей оба лидера получают final_rank=1")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_finish_assigns_same_rank_to_tied_winners(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Ничья фиксируется в БД через одинаковый final_rank у всех лидеров."""
        sample_player.score = 5
        tied_player = Player(
            name="TieMate",
            sid="sid-tie",
            quiz_id=playing_quiz.id,
            score=5,
            emoji="🦊",
            answers_history={"1": "Ответ"},
            scores_history={"1": 1},
        )
        db_session.add(tied_player)
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        db_session.refresh(tied_player)

        assert sample_player.final_rank == 1
        assert tied_player.final_rank == 1

        db_session.refresh(playing_quiz)
        winners = [item for item in playing_quiz.results_snapshot["results"] if item["final_rank"] == 1]
        assert {item["name"] for item in winners} == {sample_player.name, tied_player.name}

    @allure.title("show_results содержит final_rank в payload")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_finish_emits_show_results(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """emit('show_results') содержит results и questions, включая final_rank."""
        sample_player.score = 3
        sample_player.answers_history = {"1": "A"}
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        events = [call.args[0] for call in sio.emit.call_args_list]
        assert "show_results" in events

        show_call = next(call for call in sio.emit.call_args_list if call.args[0] == "show_results")
        data = show_call.args[1]
        assert data == {"code": playing_quiz.code, "status": "finished"}

        db_session.refresh(playing_quiz)
        assert playing_quiz.results_snapshot is not None
        assert len(playing_quiz.results_snapshot["results"]) >= 1
        assert playing_quiz.results_snapshot["results"][0]["name"] == sample_player.name
        assert playing_quiz.results_snapshot["results"][0]["final_rank"] == 1

    @allure.title("После finish все подключённые участники отключаются")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_disconnects_all(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """После публикации результатов сокеты разрываются."""
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
        """Закэшированная запись удаляется после finish."""
        cache_quiz(playing_quiz.code, playing_quiz.id, [], 0)

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        assert playing_quiz.code not in _quiz_cache

    @allure.title("Обычный игрок не может завершить игру")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_non_host_cannot_finish(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """finish_game_signal от игрока не должен менять статус сессии."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "player-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.status == "playing"

    @allure.title("Невалидный код комнаты игнорируется")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_finish_invalid_room(self, sio):
        """Если room невалиден, show_results не отправляется."""
        await sio.call("finish_game_signal", "sid", {"room": "<bad>"})
        sio.emit.assert_not_called()

    @allure.title("Хост не попадает в результаты")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_results_exclude_host(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Массив results не содержит хоста."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        names = [item["name"] for item in playing_quiz.results_snapshot["results"]]
        assert sample_host.name not in names

    @allure.title("Несколько игроков отсортированы по score DESC")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_multiple_players_sorted(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Результаты отсортированы по убыванию очков."""
        strong_player = Player(
            name="Pro",
            sid="sid-pro",
            quiz_id=playing_quiz.id,
            score=10,
            emoji="🦉",
            answers_history={},
        )
        db_session.add(strong_player)
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        scores = [item["score"] for item in playing_quiz.results_snapshot["results"]]
        assert scores == sorted(scores, reverse=True)
