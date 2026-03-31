"""
РўРµСЃС‚С‹ Socket.IO - РѕР±СЂР°Р±РѕС‚С‡РёРєРё Р·Р°РІРµСЂС€РµРЅРёСЏ РёРіСЂС‹.

Р¤РѕРєСѓСЃ РЅР° finish_game_signal: СЃС‚Р°С‚СѓСЃ РёРіСЂС‹, final_rank,
show_results Рё РѕС‚РєР»СЋС‡РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РїРѕСЃР»Рµ РїСѓР±Р»РёРєР°С†РёРё РёС‚РѕРіРѕРІ.
"""

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.games.friends_game.cache import _quiz_cache, cache_quiz
from backend.games.friends_game.models import Player
from backend.games.friends_game.sockets.results import register_results_handlers


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
    mock = patch("backend.games.friends_game.sockets.results.database.get_db_session")
    ctx = mock.start()
    ctx.return_value.__enter__ = MagicMock(return_value=db_session)
    ctx.return_value.__exit__ = MagicMock(return_value=False)
    return mock


@allure.feature("Socket.IO")
@allure.story("Finish Game")
class TestFinishGame:
    """РўРµСЃС‚С‹ Р·Р°РІРµСЂС€РµРЅРёСЏ РёРіСЂС‹ Рё С„РѕСЂРјРёСЂРѕРІР°РЅРёСЏ С„РёРЅР°Р»СЊРЅС‹С… СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ."""

    @allure.title("finish_game_signal СѓСЃС‚Р°РЅР°РІР»РёРІР°РµС‚ status=finished")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_finish_sets_status(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """РҐРѕСЃС‚ Р·Р°РІРµСЂС€Р°РµС‚ РёРіСЂСѓ -> status=finished Рё filled finished_at."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.status == "finished"
        assert playing_quiz.finished_at is not None

    @allure.title("РРіСЂРѕРє СЃ РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј score РїРѕР»СѓС‡Р°РµС‚ final_rank=1")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_finish_assigns_first_rank_to_leader(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Р›РёРґРµСЂ РїРѕ РѕС‡РєР°Рј РїРѕР»СѓС‡Р°РµС‚ РёС‚РѕРіРѕРІС‹Р№ СЂР°РЅРі 1."""
        sample_player.score = 5
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.final_rank == 1

    @allure.title("РџСЂРё РЅРёС‡СЊРµР№ РѕР±Р° Р»РёРґРµСЂР° РїРѕР»СѓС‡Р°СЋС‚ final_rank=1")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_finish_assigns_same_rank_to_tied_winners(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """РќРёС‡СЊСЏ С„РёРєСЃРёСЂСѓРµС‚СЃСЏ РІ Р‘Р” С‡РµСЂРµР· РѕРґРёРЅР°РєРѕРІС‹Р№ final_rank Сѓ РІСЃРµС… Р»РёРґРµСЂРѕРІ."""
        sample_player.score = 5
        tied_player = Player(
            name="TieMate",
            sid="sid-tie",
            quiz_id=playing_quiz.id,
            score=5,
            emoji="рџ¦Љ",
            answers_history={"1": "РћС‚РІРµС‚"},
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

    @allure.title("show_results СЃРѕРґРµСЂР¶РёС‚ final_rank РІ payload")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_finish_emits_show_results(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """emit('show_results') СЃРѕРґРµСЂР¶РёС‚ results Рё questions, РІРєР»СЋС‡Р°СЏ final_rank."""
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

    @allure.title("РџРѕСЃР»Рµ finish РІСЃРµ РїРѕРґРєР»СЋС‡С‘РЅРЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё РѕС‚РєР»СЋС‡Р°СЋС‚СЃСЏ")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_disconnects_all(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """РџРѕСЃР»Рµ РїСѓР±Р»РёРєР°С†РёРё СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ СЃРѕРєРµС‚С‹ СЂР°Р·СЂС‹РІР°СЋС‚СЃСЏ."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        sio.disconnect.assert_called()

    @allure.title("РљСЌС€ РІРёРєС‚РѕСЂРёРЅС‹ РёРЅРІР°Р»РёРґРёСЂСѓРµС‚СЃСЏ РїРѕСЃР»Рµ Р·Р°РІРµСЂС€РµРЅРёСЏ")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_invalidates_cache(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Р—Р°РєСЌС€РёСЂРѕРІР°РЅРЅР°СЏ Р·Р°РїРёСЃСЊ СѓРґР°Р»СЏРµС‚СЃСЏ РїРѕСЃР»Рµ finish."""
        cache_quiz(playing_quiz.code, playing_quiz.id, [], 0)

        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        assert playing_quiz.code not in _quiz_cache

    @allure.title("РћР±С‹С‡РЅС‹Р№ РёРіСЂРѕРє РЅРµ РјРѕР¶РµС‚ Р·Р°РІРµСЂС€РёС‚СЊ РёРіСЂСѓ")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_non_host_cannot_finish(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """finish_game_signal РѕС‚ РёРіСЂРѕРєР° РЅРµ РґРѕР»Р¶РµРЅ РјРµРЅСЏС‚СЊ СЃС‚Р°С‚СѓСЃ СЃРµСЃСЃРёРё."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "player-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.status == "playing"

    @allure.title("РќРµРІР°Р»РёРґРЅС‹Р№ РєРѕРґ РєРѕРјРЅР°С‚С‹ РёРіРЅРѕСЂРёСЂСѓРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_finish_invalid_room(self, sio):
        """Р•СЃР»Рё room РЅРµРІР°Р»РёРґРµРЅ, show_results РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ."""
        await sio.call("finish_game_signal", "sid", {"room": "<bad>"})
        sio.emit.assert_not_called()

    @allure.title("РҐРѕСЃС‚ РЅРµ РїРѕРїР°РґР°РµС‚ РІ СЂРµР·СѓР»СЊС‚Р°С‚С‹")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_results_exclude_host(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """РњР°СЃСЃРёРІ results РЅРµ СЃРѕРґРµСЂР¶РёС‚ С…РѕСЃС‚Р°."""
        mock = _patch_db(db_session)
        try:
            await sio.call("finish_game_signal", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        names = [item["name"] for item in playing_quiz.results_snapshot["results"]]
        assert sample_host.name not in names

    @allure.title("РќРµСЃРєРѕР»СЊРєРѕ РёРіСЂРѕРєРѕРІ РѕС‚СЃРѕСЂС‚РёСЂРѕРІР°РЅС‹ РїРѕ score DESC")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_finish_multiple_players_sorted(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Р РµР·СѓР»СЊС‚Р°С‚С‹ РѕС‚СЃРѕСЂС‚РёСЂРѕРІР°РЅС‹ РїРѕ СѓР±С‹РІР°РЅРёСЋ РѕС‡РєРѕРІ."""
        strong_player = Player(
            name="Pro",
            sid="sid-pro",
            quiz_id=playing_quiz.id,
            score=10,
            emoji="рџ¦‰",
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

