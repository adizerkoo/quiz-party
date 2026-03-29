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

    @allure.title("CORS preflight allows write methods used by the clients")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_cors_preflight_allows_put_and_delete(self, client):
        response = client.options(
            "/api/v1/users/1",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "PUT",
            },
        )

        assert response.status_code == 200
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        assert "PUT" in allowed_methods
        assert "DELETE" in allowed_methods
