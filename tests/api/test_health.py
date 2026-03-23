"""
API-тесты эндпоинта /api/health.

Проверяет доступность сервера и корректность ответа.
"""

import allure
import pytest


@allure.feature("API")
@allure.story("Health Check")
class TestHealthEndpoint:
    """Тесты эндпоинта проверки здоровья сервера."""

    @allure.title("Health-check возвращает 200 и status=ok")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_health_ok(self, client):
        """GET /api/health — сервер доступен, БД подключена."""
        with allure.step("Отправляем GET /api/health"):
            resp = client.get("/api/health")
        with allure.step("Проверяем ответ 200 и status=ok"):
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"
