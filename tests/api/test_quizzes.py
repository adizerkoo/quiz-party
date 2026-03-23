"""
API-тесты CRUD-операций с викторинами.

POST /api/v1/quizzes — создание
GET  /api/v1/quizzes/{code} — получение (host / player)
"""

import allure
import pytest


VALID_QUIZ_PAYLOAD = {
    "title": "API Test Quiz",
    "questions": [
        {"text": "Q1?", "type": "text", "correct": "A1"},
        {"text": "Q2?", "type": "options", "correct": "B", "options": ["A", "B", "C"]},
    ],
}


@allure.feature("API")
@allure.story("Create Quiz")
class TestCreateQuiz:
    """POST /api/v1/quizzes — создание новой викторины."""

    @allure.title("Успешное создание викторины")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_create_quiz_success(self, client):
        """Валидный payload → 200, code начинается с PARTY-, status=waiting."""
        with allure.step("Отправляем POST с валидным payload"):
            resp = client.post("/api/v1/quizzes", json=VALID_QUIZ_PAYLOAD)
        with allure.step("Проверяем успешное создание"):
            assert resp.status_code == 200
            data = resp.json()

            assert data["title"] == "API Test Quiz"
            assert data["code"].startswith("PARTY-")
            assert len(data["code"]) == 11
            assert data["status"] == "waiting"
            assert data["id"] > 0

    @allure.title("Каждая викторина получает уникальный код")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_quiz_returns_unique_codes(self, client):
        """5 созданных викторин → 5 разных кодов."""
        with allure.step("Создаём 5 викторин"):
            codes = set()
            for _ in range(5):
                resp = client.post("/api/v1/quizzes", json=VALID_QUIZ_PAYLOAD)
                assert resp.status_code == 200
                codes.add(resp.json()["code"])
        with allure.step("Проверяем уникальность кодов"):
            assert len(codes) == 5

    @allure.title("Пустой title → 422")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_empty_title(self, client):
        """Пустая строка в title отклоняется валидацией."""
        payload = {**VALID_QUIZ_PAYLOAD, "title": ""}
        resp = client.post("/api/v1/quizzes", json=payload)
        assert resp.status_code == 422

    @allure.title("Пустой список вопросов → 422")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_no_questions(self, client):
        """questions=[] отклоняется валидацией."""
        payload = {"title": "Empty", "questions": []}
        resp = client.post("/api/v1/quizzes", json=payload)
        assert resp.status_code == 422

    @allure.title("Невалидный тип вопроса → 422")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_invalid_question_type(self, client):
        """type='multi' не входит в допустимые значения."""
        payload = {
            "title": "Bad",
            "questions": [{"text": "Q", "type": "multi", "correct": "A"}],
        }
        resp = client.post("/api/v1/quizzes", json=payload)
        assert resp.status_code == 422

    @allure.title("Слишком длинный title (>100) → 422")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_quiz_title_too_long(self, client):
        """title длиннее 100 символов невалиден."""
        payload = {**VALID_QUIZ_PAYLOAD, "title": "x" * 101}
        resp = client.post("/api/v1/quizzes", json=payload)
        assert resp.status_code == 422

    @allure.title("Отсутствие тела запроса → 422")
    @allure.severity(allure.severity_level.MINOR)
    def test_create_quiz_missing_body(self, client):
        """POST без JSON body отклоняется."""
        resp = client.post("/api/v1/quizzes")
        assert resp.status_code == 422


@allure.feature("API")
@allure.story("Get Quiz")
class TestGetQuiz:
    """GET /api/v1/quizzes/{code} — получение данных викторины."""

    def _create_quiz(self, client) -> str:
        resp = client.post("/api/v1/quizzes", json=VALID_QUIZ_PAYLOAD)
        return resp.json()["code"]

    @allure.title("Игрок не видит правильные ответы")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_quiz_player_no_correct(self, client):
        """Обычный игрок не видит правильные ответы в questions_data."""
        with allure.step("Создаём викторину"):
            code = self._create_quiz(client)
        with allure.step("Запрашиваем как игрок"):
            resp = client.get(f"/api/v1/quizzes/{code}")
        with allure.step("Проверяем, что правильные ответы скрыты"):
            assert resp.status_code == 200
            data = resp.json()
            for q in data["questions_data"]:
                assert "correct" not in q

    @allure.title("Хост видит правильные ответы")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_quiz_host_sees_correct(self, client):
        """С параметром role=host правильные ответы включены."""
        with allure.step("Создаём викторину"):
            code = self._create_quiz(client)
        with allure.step("Запрашиваем как хост"):
            resp = client.get(f"/api/v1/quizzes/{code}", params={"role": "host"})
        with allure.step("Проверяем, что правильные ответы видны"):
            assert resp.status_code == 200
            data = resp.json()
            for q in data["questions_data"]:
                assert "correct" in q

    @allure.title("Несуществующий код → 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_not_found(self, client):
        """Запрос по несуществующему коду → 404 с detail."""
        resp = client.get("/api/v1/quizzes/PARTY-NOPE0")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    @allure.title("Ответ содержит все ожидаемые поля")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_response_fields(self, client):
        """Ответ содержит id, code, title, questions_data, status и т.д."""
        with allure.step("Создаём и запрашиваем викторину"):
            code = self._create_quiz(client)
            resp = client.get(f"/api/v1/quizzes/{code}")
            data = resp.json()

        with allure.step("Проверяем наличие всех ожидаемых полей"):
            expected_fields = {
                "id", "code", "title", "questions_data",
                "total_questions", "current_question",
                "status", "created_at", "started_at",
                "finished_at", "winner_id",
            }
            assert set(data.keys()) == expected_fields

    @allure.title("total_questions совпадает с количеством вопросов")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_correct_question_count(self, client):
        """total_questions == len(questions_data)."""
        code = self._create_quiz(client)
        resp = client.get(f"/api/v1/quizzes/{code}")
        data = resp.json()

        assert data["total_questions"] == 2
        assert len(data["questions_data"]) == 2

    @allure.title("Начальное состояние викторины корректно")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_quiz_initial_state(self, client):
        """Новая викторина: status=waiting, current_question=0, winner_id=None."""
        code = self._create_quiz(client)
        resp = client.get(f"/api/v1/quizzes/{code}")
        data = resp.json()

        assert data["status"] == "waiting"
        assert data["current_question"] == 0
        assert data["winner_id"] is None
