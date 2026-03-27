"""
API tests for persistent mobile users.
"""

import allure


VALID_USER_PAYLOAD = {
    "username": "Alice",
    "avatar_emoji": "\U0001F431",
    "device_platform": "android",
    "device_brand": "Samsung",
}


@allure.feature("API")
@allure.story("Users")
class TestUsersApi:
    """Checks for the persistent user-profile API."""

    @allure.title("Create user returns a stored profile")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_create_user_success(self, client):
        resp = client.post("/api/v1/users", json=VALID_USER_PAYLOAD)
        assert resp.status_code == 200

        data = resp.json()
        assert data["id"] > 0
        assert data["username"] == "Alice"
        assert data["avatar_emoji"] == "\U0001F431"
        assert data["device_platform"] == "android"
        assert data["device_brand"] == "Samsung"
        assert data["created_at"] is not None
        assert data["last_login_at"] is not None
        assert data["public_id"]

    @allure.title("Create user returns installation public id when provided")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_user_returns_installation_public_id(self, client):
        installation_public_id = "install-test-0001"
        resp = client.post(
            "/api/v1/users",
            json={**VALID_USER_PAYLOAD, "installation_public_id": installation_public_id},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["installation_public_id"] == installation_public_id

    @allure.title("Users meta returns available avatars")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_users_meta(self, client):
        resp = client.get("/api/v1/users/meta")
        assert resp.status_code == 200
        assert "avatar_emojis" in resp.json()
        assert "\U0001F431" in resp.json()["avatar_emojis"]

    @allure.title("User is available by id")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_by_id(self, client):
        created = client.post("/api/v1/users", json=VALID_USER_PAYLOAD).json()
        resp = client.get(f"/api/v1/users/{created['id']}")

        assert resp.status_code == 200
        assert resp.json()["username"] == "Alice"

    @allure.title("Duplicate usernames are allowed in users")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_user_allows_duplicate_username(self, client):
        first = client.post("/api/v1/users", json=VALID_USER_PAYLOAD)
        assert first.status_code == 200

        resp = client.post(
            "/api/v1/users",
            json={
                **VALID_USER_PAYLOAD,
                "avatar_emoji": "\U0001F438",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == VALID_USER_PAYLOAD["username"]
        assert data["id"] != first.json()["id"]

    @allure.title("Touch updates last_login_at and device info")
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
        assert data["installation_public_id"] is not None

    @allure.title("User update changes the same row")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_update_user(self, client):
        created = client.post("/api/v1/users", json=VALID_USER_PAYLOAD).json()

        resp = client.put(
            f"/api/v1/users/{created['id']}",
            json={
                "username": "New Alice",
                "avatar_emoji": "\U0001F438",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == created["id"]
        assert data["username"] == "New Alice"
        assert data["avatar_emoji"] == "\U0001F438"
        assert data["device_platform"] == "ios"
        assert data["device_brand"] == "Apple"

    @allure.title("User update can reuse an existing username")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_update_user_allows_duplicate_username(self, client):
        first = client.post("/api/v1/users", json=VALID_USER_PAYLOAD).json()
        second = client.post(
            "/api/v1/users",
            json={
                "username": "Bob",
                "avatar_emoji": "\U0001F436",
                "device_platform": "android",
                "device_brand": "Xiaomi",
            },
        ).json()

        resp = client.put(
            f"/api/v1/users/{second['id']}",
            json={
                "username": first["username"],
                "avatar_emoji": "\U0001F436",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == second["id"]
        assert data["username"] == first["username"]

    @allure.title("Updating an unknown user returns 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_update_user_not_found(self, client):
        resp = client.put(
            "/api/v1/users/99999",
            json={
                "username": "New Alice",
                "avatar_emoji": "\U0001F438",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
        )
        assert resp.status_code == 404

    @allure.title("Invalid avatar is rejected")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_user_invalid_avatar(self, client):
        payload = {**VALID_USER_PAYLOAD, "avatar_emoji": "\U0001F916"}
        resp = client.post("/api/v1/users", json=payload)
        assert resp.status_code == 422

    @allure.title("Unknown user returns 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_user_not_found(self, client):
        resp = client.get("/api/v1/users/99999")
        assert resp.status_code == 404
