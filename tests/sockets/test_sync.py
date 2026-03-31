"""
РўРµСЃС‚С‹ Socket.IO вЂ” РѕР±СЂР°Р±РѕС‚С‡РёРєРё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё (sync.py).

РўРµСЃС‚РёСЂСѓРµС‚ request_sync Рё get_update вЂ” РѕС‚РїСЂР°РІРєСѓ СЃРѕСЃС‚РѕСЏРЅРёСЏ РїСЂРё СЂРµРєРѕРЅРЅРµРєС‚Рµ.
"""

from datetime import timedelta

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.games.friends_game.cache import _quiz_cache
from backend.games.friends_game.runtime_state import connection_registry
from backend.games.friends_game.models import Player
from backend.games.friends_game.sockets.sync import register_sync_handlers
from backend.shared.utils import utc_now_naive


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
    mock = patch("backend.games.friends_game.sockets.sync.database.get_db_session")
    ctx = mock.start()
    ctx.return_value.__enter__ = MagicMock(return_value=db_session)
    ctx.return_value.__exit__ = MagicMock(return_value=False)
    return mock

@allure.feature("Socket.IO")
@allure.story("Request Sync")
class TestRequestSync:
    """РўРµСЃС‚С‹ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё СЃРѕСЃС‚РѕСЏРЅРёСЏ РїСЂРё СЂРµРєРѕРЅРЅРµРєС‚Рµ."""

    @allure.title("Sync РґР»СЏ waiting-РІРёРєС‚РѕСЂРёРЅС‹ РІРѕР·РІСЂР°С‰Р°РµС‚ Р±Р°Р·РѕРІРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_waiting_quiz(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """status=waiting в†’ sync_state СЃ currentQuestion=0."""
        with allure.step("РћС‚РїСЂР°РІР»СЏРµРј request_sync"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": "PARTY-TEST1"})
            finally:
                mock.stop()

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј sync_state РґР»СЏ waiting"):
            sio.emit.assert_called()
            call = sio.emit.call_args_list[0]
            assert call.args[0] == "sync_state"

            state = call.args[1]
            assert state["status"] == "waiting"
            assert state["currentQuestion"] == 0

    @allure.title("Sync РґР»СЏ playing-РІРёРєС‚РѕСЂРёРЅС‹ РѕС‚РїСЂР°РІР»СЏРµС‚ С‚РµРєСѓС‰РёР№ РІРѕРїСЂРѕСЃ")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_playing_quiz(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """status=playing в†’ sync_state СЃ currentQuestion=1."""
        with allure.step("РћС‚РїСЂР°РІР»СЏРµРј request_sync РґР»СЏ РёРґСѓС‰РµР№ РёРіСЂС‹"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј С‚РµРєСѓС‰РёР№ РІРѕРїСЂРѕСЃ"):
            call = sio.emit.call_args_list[0]
            state = call.args[1]
            assert state["status"] == "playing"
            assert state["currentQuestion"] == 1

    @allure.title("Sync РґР»СЏ finished-РІРёРєС‚РѕСЂРёРЅС‹ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ РѕС‚РїСЂР°РІР»СЏРµС‚ show_results")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_finished_sends_results(self, sio, db_session, finished_quiz, sample_host, sample_player):
        """status=finished в†’ sync_state + show_results."""
        with allure.step("РћС‚РїСЂР°РІР»СЏРµРј request_sync РґР»СЏ Р·Р°РІРµСЂС€С‘РЅРЅРѕР№ РёРіСЂС‹"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": finished_quiz.code})
            finally:
                mock.stop()

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј РЅР°Р»РёС‡РёРµ sync_state Рё show_results"):
            events = [c.args[0] for c in sio.emit.call_args_list]
            assert "sync_state" in events
            assert "show_results" in events

            sync_call = next(call for call in sio.emit.call_args_list if call.args[0] == "sync_state")
            assert sync_call.args[1]["status"] == "finished"
            assert sync_call.args[1]["questions"] is None

            show_call = next(call for call in sio.emit.call_args_list if call.args[0] == "show_results")
            assert show_call.args[1] == {"code": finished_quiz.code, "status": "finished"}

    @allure.title("Sync СЃРѕРґРµСЂР¶РёС‚ РґР°РЅРЅС‹Рµ РєРѕРЅРєСЂРµС‚РЅРѕРіРѕ РёРіСЂРѕРєР°")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_sync_includes_player_data(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """РћС‚РІРµС‚ СЃРѕРґРµСЂР¶РёС‚ score, emoji, answersHistory РєРѕРЅРєСЂРµС‚РЅРѕРіРѕ РёРіСЂРѕРєР°."""
        with allure.step("РЈСЃС‚Р°РЅР°РІР»РёРІР°РµРј РґР°РЅРЅС‹Рµ РёРіСЂРѕРєР°"):
            sample_player.scores_history = {"1": 1}
            sample_player.score = 1
            sample_player.emoji = "рџђ±"
            sample_player.answers_history = {"1": "test"}
            db_session.commit()

        with allure.step("РћС‚РїСЂР°РІР»СЏРµРј request_sync"):
            mock = _patch_db(db_session)
            try:
                await sio.call("request_sync", "player-sid-001", {"room": playing_quiz.code})
            finally:
                mock.stop()

        with allure.step("РџСЂРѕРІРµСЂСЏРµРј РґР°РЅРЅС‹Рµ РёРіСЂРѕРєР° РІ sync_state"):
            state = sio.emit.call_args_list[0].args[1]
            assert state["score"] == 1
            assert state["emoji"] == "рџђ±"
            assert state["answersHistory"] == {"1": "test"}

    @allure.title("РҐРѕСЃС‚ РїСЂРё sync РїРѕР»СѓС‡Р°РµС‚ СЃРїРёСЃРѕРє РѕС‚РєР»СЋС‡С‘РЅРЅС‹С… РёРіСЂРѕРєРѕРІ")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_sync_host_gets_disconnected_list(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """РҐРѕСЃС‚ РїРѕР»СѓС‡Р°РµС‚ emit('init_disconnected') СЃРѕ СЃРїРёСЃРєРѕРј РѕС„Р»Р°Р№РЅ-РёРіСЂРѕРєРѕРІ."""
        sample_player.sid = None
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "host-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        events = [c.args[0] for c in sio.emit.call_args_list]
        assert "init_disconnected" in events

    @allure.title("Sync РґР»СЏ РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РµР№ РєРѕРјРЅР°С‚С‹ вЂ” РЅРёС‡РµРіРѕ РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    @allure.title("Sync for player includes host offline flag")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_for_player_includes_host_offline_flag(self, sio, db_session, playing_quiz, sample_host, sample_player):
        sample_host.sid = None
        sample_host.status = "disconnected"
        connection_registry.unbind_sid("host-sid-001")
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "player-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        sync_call = next(call for call in sio.emit.call_args_list if call.args[0] == "sync_state")
        assert sync_call.args[1]["hostOffline"] is True

    @allure.title("Sync missing quiz emits nothing")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_sync_missing_quiz(self, sio, db_session):
        """РќРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ room в†’ emit РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ."""
        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "sid-x", {"room": "PARTY-NOPE0"})
        finally:
            mock.stop()

        sio.emit.assert_not_called()

    @allure.title("РџСѓСЃС‚РѕР№ РєРѕРґ РєРѕРјРЅР°С‚С‹ вЂ” РЅРёС‡РµРіРѕ РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_sync_ignored_without_active_participant(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """Р—Р°С‰РёС‰Р°РµС‚ РѕС‚ С„Р°РЅС‚РѕРјРЅРѕР№ РєРѕРјРЅР°С‚С‹, РµСЃР»Рё join_room Р±С‹Р» РѕС‚РєР»РѕРЅС‘РЅ РёР»Рё РµС‰С‘ РЅРµ Р·Р°РІРµСЂС€РёР»СЃСЏ."""
        sample_player.sid = None
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "ghost-sid", {"room": sample_quiz.code})
        finally:
            mock.stop()

        sio.emit.assert_not_called()

    @allure.title("Sync РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ, РµСЃР»Рё sid РЅРµ РїСЂРёРІСЏР·Р°РЅ Рє СѓС‡Р°СЃС‚РЅРёРєСѓ РєРѕРјРЅР°С‚С‹")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_invalid_room(self, sio):
        """РџСѓСЃС‚РѕР№ room в†’ emit РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ."""
        await sio.call("request_sync", "sid-x", {"room": ""})
        sio.emit.assert_not_called()

    @allure.title("Sync lazy-cancels game after host timeout")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_sync_cancels_game_after_host_timeout(self, sio, db_session, playing_quiz, sample_host, sample_player):
        sample_host.sid = None
        playing_quiz.host_left_at = utc_now_naive() - timedelta(minutes=16)
        connection_registry.unbind_sid("host-sid-001")
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("request_sync", "player-sid-001", {"room": playing_quiz.code})
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.status == "cancelled"
        assert playing_quiz.cancel_reason == "host_timeout"

        events = [c.args[0] for c in sio.emit.call_args_list]
        assert "game_cancelled" in events


@allure.feature("Socket.IO")
@allure.story("Get Update")
class TestGetUpdate:
    """РўРµСЃС‚С‹ РїРѕР»СѓС‡РµРЅРёСЏ РѕР±РЅРѕРІР»РµРЅРёР№ СЃРѕСЃС‚РѕСЏРЅРёСЏ."""

    @allure.title("get_update РѕС‚РїСЂР°РІР»СЏРµС‚ update_answers СЃ РґР°РЅРЅС‹РјРё РёРіСЂРѕРєРѕРІ")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_get_update_returns_players(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """get_update в†’ emit('update_answers') СЃ РїРѕР»СЏРјРё РёРіСЂРѕРєРѕРІ."""
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

