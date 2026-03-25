"""
API tests for persistent mobile users.
"""

import allure


VALID_USER_PAYLOAD = {
    "username": "Алиса",
    "avatar_emoji": "🐱",
    "device_platform": "android",
    "device_brand": "Samsung",
}


@allure.feature("API")
@allure.story("Users")
class TestUsersApi:
    """Проверки API профиля пользователя."""

    @allure.title("Создание пользователя возвращает профиль")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_create_user_success(self, client):
        resp = client.post("/api/v1/users", json=VALID_USER_PAYLOAD)
        assert resp.status_code == 200

        data = resp.json()
        assert data["id"] > 0
        assert data["username"] == "Алиса"
        assert data["avatar_emoji"] == "🐱"
        assert data["device_platform"] == "android"
        assert data["device_brand"] == "Samsung"
        assert data["created_at"] is not None
        assert data["last_login_at"] is not None

    @allure.title("Метаданные пользователей отдают доступные аватары")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_users_meta(self, client):
        resp = client.get("/api/v1/users/meta")
        assert resp.status_code == 200
        assert "avatar_emojis" in resp.json()
        assert "🐱" in resp.json()["avatar_emojis"]

    @allure.title("Пользователь доступен по id")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_by_id(self, client):
        created = client.post("/api/v1/users", json=VALID_USER_PAYLOAD).json()
        resp = client.get(f"/api/v1/users/{created['id']}")

        assert resp.status_code == 200
        assert resp.json()["username"] == "Алиса"

    @allure.title("touch обновляет last_login_at и устройство")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_touch_user(self, client):
        created = client.post("/api/v1/users", json=VALID_USER_PAYLOAD).json()

        resp = client.post(
            f"/api/v1/users/{created['id']}/touch",
            json={"device_platform": "ios", "device_brand": "Apple"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["device_platform"] == "ios"
        assert data["device_brand"] == "Apple"

    @allure.title("Профиль пользователя обновляется без создания новой записи")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_update_user(self, client):
        created = client.post("/api/v1/users", json=VALID_USER_PAYLOAD).json()

        resp = client.put(
            f"/api/v1/users/{created['id']}",
            json={
                "username": "Новая Алиса",
                "avatar_emoji": "🐸",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == created["id"]
        assert data["username"] == "Новая Алиса"
        assert data["avatar_emoji"] == "🐸"
        assert data["device_platform"] == "ios"
        assert data["device_brand"] == "Apple"

    @allure.title("Обновление неизвестного пользователя возвращает 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_update_user_not_found(self, client):
        resp = client.put(
            "/api/v1/users/99999",
            json={
                "username": "Новая Алиса",
                "avatar_emoji": "🐸",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
        )
        assert resp.status_code == 404

    @allure.title("Некорректный эмодзи отклоняется")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_user_invalid_avatar(self, client):
        payload = {**VALID_USER_PAYLOAD, "avatar_emoji": "🤖"}
        resp = client.post("/api/v1/users", json=payload)
        assert resp.status_code == 422

    @allure.title("Неизвестный пользователь возвращает 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_user_not_found(self, client):
        resp = client.get("/api/v1/users/99999")
        assert resp.status_code == 404
