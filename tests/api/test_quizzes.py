"""
API tests for quiz creation and quiz retrieval.
"""

import allure


VALID_QUIZ_PAYLOAD = {
    "title": "API Test Quiz",
    "questions": [
        {"text": "Q1?", "type": "text", "correct": "A1"},
        {"text": "Q2?", "type": "options", "correct": "B", "options": ["A", "B", "C"]},
    ],
}


def _auth_headers(session_token: str | None) -> dict[str, str]:
    assert session_token
    return {"Authorization": f"Bearer {session_token}"}


def _create_user_via_api(client, **overrides) -> dict:
    response = client.post(
        "/api/v1/users",
        json={
            "username": "Organizer",
            "avatar_emoji": "\U0001F436",
            "device_platform": "android",
            "device_brand": "Samsung",
            **overrides,
        },
    )
    assert response.status_code == 200
    return response.json()


@allure.feature("API")
@allure.story("Create Quiz")
class TestCreateQuiz:
    @allure.title("Successful quiz creation")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_create_quiz_success(self, client):
        response = client.post("/api/v1/quizzes", json=VALID_QUIZ_PAYLOAD)

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "API Test Quiz"
        assert data["code"].startswith("PARTY-")
        assert len(data["code"]) == 11
        assert data["status"] == "waiting"
        assert data["id"] > 0
        assert data["host_token"]

    @allure.title("Each quiz gets a unique code")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_quiz_returns_unique_codes(self, client):
        codes = set()
        for _ in range(5):
            response = client.post("/api/v1/quizzes", json=VALID_QUIZ_PAYLOAD)
            assert response.status_code == 200
            codes.add(response.json()["code"])

        assert len(codes) == 5

    @allure.title("Quiz can be created with owner_id when bearer auth matches")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_quiz_with_owner_id(self, client):
        owner = _create_user_via_api(client, username="OwnerUser")

        response = client.post(
            "/api/v1/quizzes",
            headers=_auth_headers(owner["session_token"]),
            json={**VALID_QUIZ_PAYLOAD, "owner_id": owner["id"]},
        )

        assert response.status_code == 200

    @allure.title("Owner-bound quiz creation requires bearer auth")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_quiz_with_owner_id_requires_token(self, client):
        owner = _create_user_via_api(client)

        response = client.post("/api/v1/quizzes", json={**VALID_QUIZ_PAYLOAD, "owner_id": owner["id"]})

        assert response.status_code == 401

    @allure.title("Quiz owner cannot be spoofed with another user's token")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_quiz_with_owner_id_rejects_foreign_token(self, client):
        alice = _create_user_via_api(client, username="Alice Owner", avatar_emoji="\U0001F431")
        bob = _create_user_via_api(client, username="Bob Owner", avatar_emoji="\U0001F436")

        response = client.post(
            "/api/v1/quizzes",
            headers=_auth_headers(bob["session_token"]),
            json={**VALID_QUIZ_PAYLOAD, "owner_id": alice["id"]},
        )

        assert response.status_code == 403

    @allure.title("Empty title is rejected")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_empty_title(self, client):
        response = client.post("/api/v1/quizzes", json={**VALID_QUIZ_PAYLOAD, "title": ""})
        assert response.status_code == 422

    @allure.title("Empty questions list is rejected")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_no_questions(self, client):
        response = client.post("/api/v1/quizzes", json={"title": "Empty", "questions": []})
        assert response.status_code == 422

    @allure.title("Invalid question type is rejected")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_invalid_question_type(self, client):
        response = client.post(
            "/api/v1/quizzes",
            json={"title": "Bad", "questions": [{"text": "Q", "type": "multi", "correct": "A"}]},
        )
        assert response.status_code == 422

    @allure.title("Too long title is rejected")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_title_too_long(self, client):
        response = client.post("/api/v1/quizzes", json={**VALID_QUIZ_PAYLOAD, "title": "x" * 101})
        assert response.status_code == 422

    @allure.title("Missing body is rejected")
    @allure.severity(allure.severity_level.MINOR)
    def test_create_quiz_missing_body(self, client):
        response = client.post("/api/v1/quizzes")
        assert response.status_code == 422


@allure.feature("API")
@allure.story("Get Quiz")
class TestGetQuiz:
    def _create_quiz(self, client) -> str:
        response = client.post("/api/v1/quizzes", json=VALID_QUIZ_PAYLOAD)
        assert response.status_code == 200
        return response.json()["code"]

    @allure.title("Player does not see correct answers")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_quiz_player_no_correct(self, client):
        code = self._create_quiz(client)

        response = client.get(f"/api/v1/quizzes/{code}")

        assert response.status_code == 200
        for question in response.json()["questions_data"]:
            assert "correct" not in question

    @allure.title("Host sees correct answers")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_quiz_host_sees_correct(self, client):
        code = self._create_quiz(client)

        response = client.get(f"/api/v1/quizzes/{code}", params={"role": "host"})

        assert response.status_code == 200
        for question in response.json()["questions_data"]:
            assert "correct" in question

    @allure.title("Unknown quiz code returns 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_not_found(self, client):
        response = client.get("/api/v1/quizzes/PARTY-NOPE0")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @allure.title("Quiz response contains expected fields")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_response_fields(self, client):
        code = self._create_quiz(client)

        response = client.get(f"/api/v1/quizzes/{code}")
        data = response.json()

        expected_fields = {
            "id",
            "code",
            "title",
            "questions_data",
            "total_questions",
            "current_question",
            "status",
            "created_at",
            "started_at",
            "finished_at",
            "last_activity_at",
            "cancelled_at",
            "cancel_reason",
        }
        assert set(data.keys()) == expected_fields

    @allure.title("Question count matches total_questions")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_correct_question_count(self, client):
        code = self._create_quiz(client)

        response = client.get(f"/api/v1/quizzes/{code}")
        data = response.json()

        assert data["total_questions"] == 2
        assert len(data["questions_data"]) == 2

    @allure.title("New quiz starts in waiting state")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_initial_state(self, client):
        code = self._create_quiz(client)

        response = client.get(f"/api/v1/quizzes/{code}")
        data = response.json()

        assert data["status"] == "waiting"
        assert data["current_question"] == 0
