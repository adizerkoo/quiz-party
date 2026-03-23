"""
API-тесты эндпоинта результатов.

GET /api/v1/quizzes/{code}/results
"""

import allure
import pytest
from backend.models import Quiz, Player


@allure.feature("API")
@allure.story("Quiz Results")
class TestGetQuizResults:
    """GET /api/v1/quizzes/{code}/results — получение результатов викторины."""

    @allure.title("Результаты доступны для завершённой викторины")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_results_finished_quiz(self, client, db_session, finished_quiz, sample_player):
        """status=finished → 200, данные содержат code, results, questions."""
        with allure.step("Запрашиваем результаты завершённой викторины"):
            resp = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")
        with allure.step("Проверяем структуру ответа"):
            assert resp.status_code == 200
            data = resp.json()
            assert data["code"] == finished_quiz.code
            assert data["status"] == "finished"
            assert data["total_questions"] == finished_quiz.total_questions
            assert isinstance(data["results"], list)
            assert isinstance(data["questions"], list)

    @allure.title("Результаты содержат данные игроков")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_results_contain_player_data(self, client, db_session, finished_quiz, sample_player):
        """Каждый элемент results содержит name, score, emoji, answers, answer_times."""
        with allure.step("Запрашиваем результаты"):
            resp = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")
            data = resp.json()
            results = data["results"]
        with allure.step("Проверяем наличие ключей в данных игрока"):
            assert len(results) >= 1
            p = results[0]
            assert "name" in p
            assert "score" in p
            assert "emoji" in p
            assert "answers" in p
            assert "answer_times" in p

    @allure.title("Хост не попадает в список результатов")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_excludes_host(self, client, db_session, finished_quiz, sample_host):
        """Хост (is_host=True) исключён из массива results."""
        resp = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")
        data = resp.json()
        names = [r["name"] for r in data["results"]]
        assert sample_host.name not in names

    @allure.title("Игроки отсортированы по убыванию очков")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_sorted_by_score(self, client, db_session, finished_quiz):
        """Результаты отсортированы score DESC."""
        with allure.step("Добавляем игрока с низким score"):
            p2 = Player(
                name="Noob", sid="sid-n", quiz_id=finished_quiz.id,
                score=0, emoji="🐸", answers_history={"1": "Лондон"},
                scores_history={"1": 0},
            )
            db_session.add(p2)
            db_session.commit()

        with allure.step("Запрашиваем результаты"):
            resp = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")
        with allure.step("Проверяем сортировку по убыванию"):
            scores = [r["score"] for r in resp.json()["results"]]
            assert scores == sorted(scores, reverse=True)

    @allure.title("Незавершённая викторина → 400")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_not_finished_returns_400(self, client, db_session, sample_quiz):
        """status != 'finished' → 400 с detail 'not finished'."""
        resp = client.get(f"/api/v1/quizzes/{sample_quiz.code}/results")
        assert resp.status_code == 400
        assert "not finished" in resp.json()["detail"].lower()

    @allure.title("Несуществующий код → 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_not_found(self, client):
        """Запрос результатов по несуществующему коду → 404."""
        resp = client.get("/api/v1/quizzes/PARTY-NOPE0/results")
        assert resp.status_code == 404
