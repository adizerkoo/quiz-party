"""
Unit-тесты in-memory кэша викторин (cache.py).

Покрывает: cache_quiz, get_cached_quiz, invalidate_quiz,
изоляцию по ключам и повторную инвалидацию.
"""

import allure

from backend.cache import (
    cache_quiz,
    get_cached_quiz,
    invalidate_quiz,
    _quiz_cache,
)


@allure.feature("Cache")
@allure.story("Quiz Cache")
class TestCache:
    """Тесты кэша викторин."""

    def setup_method(self):
        """Очищаем кэш перед каждым тестом."""
        _quiz_cache.clear()

    @allure.title("Кэширование и извлечение данных")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_cache_and_retrieve(self):
        """cache_quiz → get_cached_quiz возвращает сохранённые данные."""
        with allure.step("Кэшируем викторину"):
            cache_quiz("PARTY-AAA", 1, [{"q": "test"}], 1)
        with allure.step("Извлекаем из кэша"):
            cached = get_cached_quiz("PARTY-AAA")
        with allure.step("Проверяем корректность данных"):
            assert cached is not None
            assert cached["id"] == 1
            assert cached["questions_data"] == [{"q": "test"}]
            assert cached["total_questions"] == 1

    @allure.title("Промах кэша — отсутствующий ключ")
    @allure.severity(allure.severity_level.NORMAL)
    def test_cache_miss(self):
        """get_cached_quiz для несуществующего кода возвращает None."""
        assert get_cached_quiz("PARTY-NOPE") is None

    @allure.title("Инвалидация удаляет запись из кэша")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_invalidate(self):
        """invalidate_quiz удаляет ранее закэшированную запись."""
        with allure.step("Кэшируем викторину"):
            cache_quiz("PARTY-BBB", 2, [], 0)
            assert get_cached_quiz("PARTY-BBB") is not None
        with allure.step("Инвалидируем кэш"):
            invalidate_quiz("PARTY-BBB")
        with allure.step("Проверяем, что запись удалена"):
            assert get_cached_quiz("PARTY-BBB") is None

    @allure.title("Инвалидация несуществующего ключа безопасна")
    @allure.severity(allure.severity_level.MINOR)
    def test_invalidate_nonexistent_is_safe(self):
        """Инвалидация несуществующего ключа не вызывает ошибок."""
        invalidate_quiz("PARTY-GHOST")  # no exception

    @allure.title("Перезапись обновляет данные в кэше")
    @allure.severity(allure.severity_level.NORMAL)
    def test_overwrite_cache(self):
        """Повторный cache_quiz перезаписывает старые данные."""
        with allure.step("Кэшируем старые данные"):
            cache_quiz("PARTY-CCC", 1, [{"old": True}], 1)
        with allure.step("Перезаписываем новыми данными"):
            cache_quiz("PARTY-CCC", 1, [{"new": True}], 2)
        with allure.step("Проверяем актуальные данные"):
            cached = get_cached_quiz("PARTY-CCC")
            assert cached["questions_data"] == [{"new": True}]
            assert cached["total_questions"] == 2

    @allure.title("Изоляция между комнатами")
    @allure.severity(allure.severity_level.NORMAL)
    def test_isolation_between_rooms(self):
        """Инвалидация одной комнаты не затрагивает другую."""
        with allure.step("Кэшируем две комнаты"):
            cache_quiz("PARTY-R1", 10, [], 0)
            cache_quiz("PARTY-R2", 20, [], 0)

        with allure.step("Проверяем обе доступны"):
            assert get_cached_quiz("PARTY-R1")["id"] == 10
            assert get_cached_quiz("PARTY-R2")["id"] == 20

        with allure.step("Инвалидируем только R1"):
            invalidate_quiz("PARTY-R1")

        with allure.step("Проверяем изоляцию"):
            assert get_cached_quiz("PARTY-R1") is None
            assert get_cached_quiz("PARTY-R2") is not None
