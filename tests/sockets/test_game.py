"""
Тесты Socket.IO — обработчики игрового процесса (game.py).

Тестирует start_game, send_answer, next_question, override_score
и check_answers_before_next.
"""

import allure
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.games.friends_game.cache import _quiz_cache
from backend.games.friends_game.models import Player, Quiz
from backend.games.friends_game.sockets.game import register_game_handlers


class FakeSioManager:
    """Простой mock Socket.IO manager для прямого вызова зарегистрированных handlers."""

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
    register_game_handlers(manager)
    return manager


@pytest.fixture(autouse=True)
def clear_cache():
    _quiz_cache.clear()
    yield
    _quiz_cache.clear()


def _patch_db(db_session):
    mock = patch("backend.games.friends_game.sockets.game.database.get_db_session")
    ctx = mock.start()
    ctx.return_value.__enter__ = MagicMock(return_value=db_session)
    ctx.return_value.__exit__ = MagicMock(return_value=False)
    return mock


@allure.feature("Socket.IO")
@allure.story("Start Game")
class TestStartGame:
    """Тесты запуска игры хостом."""

    @allure.title("Хост запускает игру — статус меняется на playing")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_host_starts_game(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """start_game_signal от хоста меняет статус на playing и отправляет game_started."""
        with allure.step("Хост отправляет start_game_signal"):
            mock = _patch_db(db_session)
            try:
                await sio.call("start_game_signal", "host-sid-001", {"room": "PARTY-TEST1"})
            finally:
                mock.stop()

        with allure.step("Проверяем статус викторины"):
            db_session.refresh(sample_quiz)
            assert sample_quiz.status == "playing"
            assert sample_quiz.current_question == 1
            assert sample_quiz.started_at is not None

        with allure.step("Проверяем событие game_started"):
            events = [call.args[0] for call in sio.emit.call_args_list]
            assert "game_started" in events

    @allure.title("Обычный игрок не может стартовать игру")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_non_host_cannot_start(self, sio, db_session, sample_quiz, sample_host, sample_player):
        """start_game_signal от игрока не должен менять статус викторины."""
        mock = _patch_db(db_session)
        try:
            await sio.call("start_game_signal", "player-sid-001", {"room": "PARTY-TEST1"})
        finally:
            mock.stop()

        db_session.refresh(sample_quiz)
        assert sample_quiz.status == "waiting"

    @allure.title("Пустой код комнаты игнорируется")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_invalid_room_ignored(self, sio):
        """Пустой room не приводит ни к каким событиям."""
        await sio.call("start_game_signal", "sid", {"room": ""})
        sio.emit.assert_not_called()


@allure.feature("Socket.IO")
@allure.story("Send Answer")
class TestSendAnswer:
    """Тесты отправки ответа игроком."""

    @allure.title("Правильный ответ увеличивает score")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_correct_answer(self, sio, db_session, playing_quiz, sample_player):
        """Ответ 'Париж' засчитывается как правильный."""
        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "Париж",
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.score == 1
        assert sample_player.answers_history["1"] == "Париж"
        assert sample_player.scores_history["1"] == 1

    @allure.title("Неправильный ответ не увеличивает score")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_wrong_answer(self, sio, db_session, playing_quiz, sample_player):
        """Ответ 'Лондон' не даёт очков."""
        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "Лондон",
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.score == 0
        assert sample_player.scores_history["1"] == 0

    @allure.title("Сравнение ответа регистронезависимо")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_case_insensitive_comparison(self, sio, db_session, playing_quiz, sample_player):
        """Нижний регистр всё равно считается правильным ответом."""
        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "париж",
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.scores_history["1"] == 1

    @allure.title("Повторный ответ на тот же вопрос игнорируется")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_duplicate_answer_rejected(self, sio, db_session, playing_quiz, sample_player):
        """Если answers_history уже содержит ключ, ответ не перезаписывается."""
        sample_player.answers_history = {"1": "Лондон"}
        sample_player.scores_history = {"1": 0}
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "Париж",
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.answers_history["1"] == "Лондон"

    @allure.title("Время ответа сохраняется в answer_times")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_answer_time_recorded(self, sio, db_session, playing_quiz, sample_player):
        """answerTime=3.5 записывается в историю времени ответа."""
        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "Париж",
                "questionIndex": 1,
                "answerTime": 3.5,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.answer_times["1"] == 3.5

    @allure.title("Недопустимый индекс вопроса не ломает обработчик")
    @allure.severity(allure.severity_level.MINOR)
    @pytest.mark.asyncio
    async def test_invalid_question_index(self, sio, db_session, playing_quiz, sample_player):
        """questionIndex=999 не должен вызывать исключение."""
        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "Test",
                "questionIndex": 999,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.score == 0

    @allure.title("HTML-теги в ответе удаляются")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_xss_in_answer_sanitized(self, sio, db_session, playing_quiz, sample_player):
        """Скрипт в ответе не должен сохраняться как HTML."""
        mock = _patch_db(db_session)
        try:
            await sio.call("send_answer", "player-sid-001", {
                "room": playing_quiz.code,
                "answer": "<script>alert(1)</script>",
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        if "1" in (sample_player.answers_history or {}):
            assert "<script>" not in sample_player.answers_history["1"]


@allure.feature("Socket.IO")
@allure.story("Next Question")
class TestNextQuestion:
    """Тесты переключения на следующий вопрос."""

    @allure.title("Хост переключает на следующий вопрос")
    @allure.severity(allure.severity_level.BLOCKER)
    @pytest.mark.asyncio
    async def test_host_advances_question(self, sio, db_session, playing_quiz, sample_host):
        """next_question_signal увеличивает current_question и шлёт move_to_next."""
        mock = _patch_db(db_session)
        try:
            await sio.call("next_question_signal", "host-sid-001", {
                "room": playing_quiz.code,
                "expectedQuestion": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.current_question == 2

        events = [call.args[0] for call in sio.emit.call_args_list]
        assert "move_to_next" in events

    @allure.title("Обычный игрок не может переключить вопрос")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_non_host_cannot_advance(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """next_question_signal от игрока не должен менять current_question."""
        mock = _patch_db(db_session)
        try:
            await sio.call("next_question_signal", "player-sid-001", {
                "room": playing_quiz.code,
            })
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.current_question == 1

    @allure.title("Устаревший expectedQuestion не двигает игру")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_stale_expected_question(self, sio, db_session, playing_quiz, sample_host):
        """Если expectedQuestion не совпадает, перехода не происходит."""
        mock = _patch_db(db_session)
        try:
            await sio.call("next_question_signal", "host-sid-001", {
                "room": playing_quiz.code,
                "expectedQuestion": 5,
            })
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.current_question == 1

    @allure.title("Нельзя перейти за последний вопрос")
    @allure.severity(allure.severity_level.NORMAL)
    @pytest.mark.asyncio
    async def test_cannot_go_past_last_question(self, sio, db_session, playing_quiz, sample_host):
        """На последнем вопросе current_question не увеличивается."""
        playing_quiz.current_question = len(playing_quiz.questions_data)
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("next_question_signal", "host-sid-001", {
                "room": playing_quiz.code,
                "expectedQuestion": len(playing_quiz.questions_data),
            })
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.current_question == len(playing_quiz.questions_data)

    @allure.title("Host jump broadcasts the target question to all clients")
    @allure.severity(allure.severity_level.CRITICAL)
    @pytest.mark.asyncio
    async def test_move_to_step_broadcasts_question_change(self, sio, db_session, playing_quiz, sample_host):
        mock = _patch_db(db_session)
        try:
            await sio.call("move_to_step", "host-sid-001", {
                "room": playing_quiz.code,
                "question": 3,
            })
        finally:
            mock.stop()

        db_session.refresh(playing_quiz)
        assert playing_quiz.current_question == 3

        move_events = [
            call for call in sio.emit.call_args_list
            if call.args and call.args[0] == "move_to_next"
        ]
        assert move_events
        assert move_events[-1].args[1]["question"] == 3


class TestOverrideScore:
    """Тесты ручной корректировки очков хостом."""

    @pytest.mark.asyncio
    async def test_host_approves_answer(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Хост засчитывает ответ игроку."""
        sample_player.scores_history = {"1": 0}
        sample_player.score = 0
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("override_score", "host-sid-001", {
                "room": playing_quiz.code,
                "playerName": "Игрок1",
                "points": 1,
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.scores_history["1"] == 1
        assert sample_player.score == 1

    @pytest.mark.asyncio
    async def test_host_rejects_answer(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Хост снимает ранее начисленный балл."""
        sample_player.scores_history = {"1": 1}
        sample_player.score = 1
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("override_score", "host-sid-001", {
                "room": playing_quiz.code,
                "playerName": "Игрок1",
                "points": -1,
                "questionIndex": 1,
            })
        finally:
            mock.stop()

        db_session.refresh(sample_player)
        assert sample_player.scores_history["1"] == 0
        assert sample_player.score == 0


class TestCheckAnswers:
    """Тесты предварительной проверки, все ли игроки ответили."""

    @pytest.mark.asyncio
    async def test_all_answered(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Если все ответили, allAnswered=True."""
        sample_player.answers_history = {"1": "Ответ"}
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("check_answers_before_next", "host-sid-001", {
                "room": playing_quiz.code,
                "question": 1,
            })
        finally:
            mock.stop()

        call_data = sio.emit.call_args_list[-1]
        assert call_data.args[0] == "answers_check_result"
        assert call_data.args[1]["allAnswered"] is True

    @pytest.mark.asyncio
    async def test_not_all_answered(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Если не все ответили, allAnswered=False."""
        sample_player.answers_history = {}
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("check_answers_before_next", "host-sid-001", {
                "room": playing_quiz.code,
                "question": 1,
            })
        finally:
            mock.stop()

        call_data = sio.emit.call_args_list[-1]
        assert call_data.args[1]["allAnswered"] is False

    @pytest.mark.asyncio
    async def test_disconnected_player_skipped(self, sio, db_session, playing_quiz, sample_host, sample_player):
        """Отключённые игроки не должны блокировать переход к следующему вопросу."""
        sample_player.sid = None
        sample_player.answers_history = {}
        db_session.commit()

        mock = _patch_db(db_session)
        try:
            await sio.call("check_answers_before_next", "host-sid-001", {
                "room": playing_quiz.code,
                "question": 1,
            })
        finally:
            mock.stop()

        call_data = sio.emit.call_args_list[-1]
        assert call_data.args[1]["allAnswered"] is True
