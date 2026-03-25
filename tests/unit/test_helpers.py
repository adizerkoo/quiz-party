"""
Unit-тесты вспомогательных функций (helpers.py).

Покрывает: get_quiz_by_code (с кэшем и без), verify_host,
get_players_in_quiz — формат данных для фронтенда.
"""

import allure
import pytest
from datetime import datetime, timedelta

from backend.models import Quiz, Player
from backend.helpers import get_quiz_by_code, verify_host, get_players_in_quiz
from backend.cache import _quiz_cache, cache_quiz


@allure.feature("Helpers")
@allure.story("get_quiz_by_code")
class TestGetQuizByCode:
    """Тесты поиска викторины по коду с кэшированием."""

    def setup_method(self):
        _quiz_cache.clear()

    @allure.title("Находит викторину по коду в БД")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_finds_quiz_by_code(self, db_session, sample_quiz):
        """Существующий код возвращает Quiz-объект."""
        with allure.step("Ищем викторину по коду PARTY-TEST1"):
            result = get_quiz_by_code(db_session, "PARTY-TEST1")
        with allure.step("Проверяем, что найдена правильная викторина"):
            assert result is not None
            assert result.id == sample_quiz.id

    @allure.title("Возвращает None для несуществующего кода")
    @allure.severity(allure.severity_level.NORMAL)
    def test_returns_none_for_missing(self, db_session):
        """Несуществующий код → None."""
        result = get_quiz_by_code(db_session, "PARTY-NOPE")
        assert result is None

    @allure.title("Кэширует викторину после первого запроса")
    @allure.severity(allure.severity_level.NORMAL)
    def test_caches_quiz_after_lookup(self, db_session, sample_quiz):
        """После первого вызова код появляется в _quiz_cache."""
        with allure.step("Выполняем первый запрос по коду"):
            get_quiz_by_code(db_session, "PARTY-TEST1")
        with allure.step("Проверяем, что код закэширован"):
            assert "PARTY-TEST1" in _quiz_cache

    @allure.title("Использует данные из кэша при повторном запросе")
    @allure.severity(allure.severity_level.NORMAL)
    def test_uses_cached_data(self, db_session, sample_quiz):
        """Если кэш содержит запись, повторный запрос не делает query по code."""
        with allure.step("Предзаполняем кэш"):
            cache_quiz("PARTY-TEST1", sample_quiz.id, [], 0)
        with allure.step("Запрашиваем викторину — должна прийти из кэша"):
            result = get_quiz_by_code(db_session, "PARTY-TEST1")
        with allure.step("Проверяем результат"):
            assert result.id == sample_quiz.id

    @allure.title("Инвалидирует кэш с несуществующим id")
    @allure.severity(allure.severity_level.NORMAL)
    def test_invalidates_stale_cache(self, db_session):
        """Кэш с несуществующим id инвалидируется и делается fallback на БД."""
        with allure.step("Заполняем кэш устаревшими данными"):
            cache_quiz("PARTY-STALE", 99999, [], 0)
        with allure.step("Запрашиваем по коду"):
            result = get_quiz_by_code(db_session, "PARTY-STALE")
        with allure.step("Проверяем инвалидацию и результат"):
            assert result is None
            assert "PARTY-STALE" not in _quiz_cache


@allure.feature("Helpers")
@allure.story("verify_host")
class TestVerifyHost:
    """Тесты проверки прав хоста."""

    @allure.title("Валидный хост подтверждается")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_valid_host(self, db_session, sample_quiz, sample_host):
        """Хост с правильным quiz_id и sid → True."""
        assert verify_host(db_session, sample_quiz.id, "host-sid-001") is True

    @allure.title("Обычный игрок не проходит проверку хоста")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_non_host_player(self, db_session, sample_quiz, sample_player):
        """Игрок с is_host=False → False."""
        assert verify_host(db_session, sample_quiz.id, "player-sid-001") is False

    @allure.title("Неизвестный sid не проходит проверку")
    @allure.severity(allure.severity_level.NORMAL)
    def test_unknown_sid(self, db_session, sample_quiz, sample_host):
        """Несуществующий sid → False."""
        assert verify_host(db_session, sample_quiz.id, "unknown-sid") is False

    @allure.title("Неверный quiz_id не проходит проверку")
    @allure.severity(allure.severity_level.NORMAL)
    def test_wrong_quiz_id(self, db_session, sample_quiz, sample_host):
        """Хост привязан к другой викторине → False."""
        assert verify_host(db_session, 99999, "host-sid-001") is False


@allure.feature("Helpers")
@allure.story("get_players_in_quiz")
class TestGetPlayersInQuiz:
    """Тесты формирования списка игроков для фронтенда."""

    @allure.title("Возвращает список словарей")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_returns_list_of_dicts(self, db_session, sample_quiz, sample_player, sample_host):
        """Результат — list[dict] с данными всех игроков."""
        with allure.step("Получаем список игроков"):
            players = get_players_in_quiz(db_session, sample_quiz.id)
        with allure.step("Проверяем тип и количество"):
            assert isinstance(players, list)
            assert len(players) >= 2

    @allure.title("Словарь игрока содержит все необходимые ключи")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_player_dict_keys(self, db_session, sample_quiz, sample_player):
        """Каждый dict содержит name, is_host, score, emoji и т.д."""
        with allure.step("Получаем данные игрока"):
            players = get_players_in_quiz(db_session, sample_quiz.id)
            player = next(p for p in players if p["name"] == "Игрок1")

        with allure.step("Проверяем набор ключей в словаре"):
            expected_keys = {
                "name", "is_host", "score", "emoji",
                "answers_history", "scores_history",
                "answer_times", "connected",
            }
            assert set(player.keys()) == expected_keys

    @allure.title("Игрок с sid отображается как connected=True")
    @allure.severity(allure.severity_level.NORMAL)
    def test_connected_status(self, db_session, sample_quiz, sample_player):
        """Игрок с sid != None отображается как connected=True."""
        players = get_players_in_quiz(db_session, sample_quiz.id)
        player = next(p for p in players if p["name"] == "Игрок1")
        assert player["connected"] is True

    @allure.title("Игрок без sid отображается как connected=False")
    @allure.severity(allure.severity_level.NORMAL)
    def test_disconnected_status(self, db_session, sample_quiz, sample_player):
        """Игрок с sid=None отображается как connected=False."""
        sample_player.sid = None
        db_session.commit()

        players = get_players_in_quiz(db_session, sample_quiz.id)
        player = next(p for p in players if p["name"] == "Игрок1")
        assert player["connected"] is False

    @allure.title("Пустая викторина возвращает пустой список")
    @allure.severity(allure.severity_level.MINOR)
    def test_empty_quiz(self, db_session):
        """Викторина без игроков → пустой список."""
        quiz = Quiz(title="Empty", code="PARTY-EMPTY")
        db_session.add(quiz)
        db_session.commit()

        players = get_players_in_quiz(db_session, quiz.id)
        assert players == []

    @allure.title("Игрок без emoji получает '👤' по умолчанию")
    @allure.severity(allure.severity_level.MINOR)
    def test_default_emoji(self, db_session, sample_quiz):
        """Игрок без emoji получает '👤'."""
        with allure.step("Создаём игрока без emoji"):
            p = Player(name="NoEmoji", sid="s-ne", quiz_id=sample_quiz.id, emoji=None)
            db_session.add(p)
            db_session.commit()

        with allure.step("Получаем список игроков"):
            players = get_players_in_quiz(db_session, sample_quiz.id)
            no_emoji = next(p for p in players if p["name"] == "NoEmoji")

        with allure.step("Проверяем emoji по умолчанию"):
            assert no_emoji["emoji"] == "👤"

    @allure.title("Null JSON-поля возвращаются как пустые словари")
    @allure.severity(allure.severity_level.MINOR)
    def test_null_history_defaults(self, db_session, sample_quiz):
        """Null JSON-поля возвращаются как пустые словари."""
        with allure.step("Создаём игрока с NULL-историями"):
            p = Player(
                name="NullHist", sid="s-nh", quiz_id=sample_quiz.id,
                answers_history=None, scores_history=None, answer_times=None,
            )
            db_session.add(p)
            db_session.commit()

        with allure.step("Получаем список игроков"):
            players = get_players_in_quiz(db_session, sample_quiz.id)
            nh = next(p for p in players if p["name"] == "NullHist")

        with allure.step("Проверяем, что NULL стали пустыми словарями"):
            assert nh["answers_history"] == {}
            assert nh["scores_history"] == {}
            assert nh["answer_times"] == {}

    @allure.title("Players are returned in join order")
    @allure.severity(allure.severity_level.NORMAL)
    def test_players_are_sorted_by_join_order(self, db_session):
        """get_players_in_quiz keeps a stable join-order response."""
        quiz = Quiz(title="Order", code="PARTY-ORDER")
        db_session.add(quiz)
        db_session.commit()
        db_session.refresh(quiz)

        base = datetime(2025, 1, 1, 12, 0, 0)
        db_session.add_all([
            Player(
                name="Bob",
                sid="sid-bob",
                quiz_id=quiz.id,
                joined_at=base + timedelta(seconds=2),
            ),
            Player(
                name="Host",
                sid="sid-host",
                quiz_id=quiz.id,
                is_host=True,
                joined_at=base,
            ),
            Player(
                name="Alice",
                sid="sid-alice",
                quiz_id=quiz.id,
                joined_at=base + timedelta(seconds=1),
            ),
        ])
        db_session.commit()

        ordered_names = [player["name"] for player in get_players_in_quiz(db_session, quiz.id)]

        assert ordered_names == ["Host", "Alice", "Bob"]
