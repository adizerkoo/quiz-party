"""
API-тесты эндпоинта результатов.

GET /api/v1/quizzes/{code}/results
"""

import allure

from backend.models import Player


@allure.feature("API")
@allure.story("Quiz Results")
class TestGetQuizResults:
    """GET /api/v1/quizzes/{code}/results — получение итогов викторины."""

    @allure.title("Результаты доступны для завершённой викторины")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_results_finished_quiz(self, client, finished_quiz):
        """status=finished -> 200, ответ содержит code, results и questions."""
        response = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == finished_quiz.code
        assert data["status"] == "finished"
        assert data["total_questions"] == finished_quiz.total_questions
        assert isinstance(data["results"], list)
        assert isinstance(data["questions"], list)

    @allure.title("Результаты содержат данные игрока и итоговый ранг")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_results_contain_player_data(self, client, finished_quiz):
        """Каждый элемент results содержит name, score, final_rank, emoji, answers и answer_times."""
        response = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) >= 1

        player = results[0]
        assert "name" in player
        assert "score" in player
        assert "final_rank" in player
        assert "emoji" in player
        assert "answers" in player
        assert "answer_times" in player

    @allure.title("Хост не попадает в список результатов")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_excludes_host(self, client, finished_quiz, sample_host):
        """Хост не должен попадать в публичный leaderboard результатов."""
        response = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")

        names = [item["name"] for item in response.json()["results"]]
        assert sample_host.name not in names

    @allure.title("Игроки отсортированы по убыванию очков")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_sorted_by_score(self, client, db_session, finished_quiz):
        """Результаты отсортированы score DESC."""
        low_score_player = Player(
            name="Noob",
            sid="sid-n",
            quiz_id=finished_quiz.id,
            score=0,
            emoji="🐸",
            answers_history={"1": "Лондон"},
            scores_history={"1": 0},
        )
        db_session.add(low_score_player)
        db_session.commit()

        response = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")
        scores = [item["score"] for item in response.json()["results"]]
        assert scores == sorted(scores, reverse=True)

    @allure.title("Ничья отдаёт обоим лидерам final_rank=1")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_results_tie_returns_same_first_rank(self, client, db_session, finished_quiz, sample_player):
        """При одинаковом score оба лидера имеют final_rank=1."""
        tied_player = Player(
            name="TieMate",
            sid="sid-tie",
            quiz_id=finished_quiz.id,
            score=sample_player.score,
            final_rank=1,
            emoji="🦊",
            answers_history={"1": "Париж"},
            scores_history={"1": 1},
        )
        sample_player.final_rank = 1
        db_session.add(tied_player)
        db_session.commit()

        response = client.get(f"/api/v1/quizzes/{finished_quiz.code}/results")
        assert response.status_code == 200

        winners = [item for item in response.json()["results"] if item["final_rank"] == 1]
        assert {item["name"] for item in winners} == {sample_player.name, tied_player.name}

    @allure.title("Незавершённая викторина -> 400")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_not_finished_returns_400(self, client, sample_quiz):
        """status != finished -> 400."""
        response = client.get(f"/api/v1/quizzes/{sample_quiz.code}/results")
        assert response.status_code == 400
        assert "not finished" in response.json()["detail"].lower()

    @allure.title("Несуществующий код -> 404")
    @allure.severity(allure.severity_level.NORMAL)
    def test_results_not_found(self, client):
        """Запрос результатов по несуществующему коду возвращает 404."""
        response = client.get("/api/v1/quizzes/PARTY-NOPE0/results")
        assert response.status_code == 404
