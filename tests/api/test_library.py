"""API tests for the server-side question library, favorites, and repeat drafts."""

from datetime import datetime, timedelta

import allure

from backend.models import Player, QuestionBankQuestion, Quiz, User, UserFavoriteQuestion


def _create_user_via_api(client, username: str, *, avatar_emoji: str = "\U0001F431") -> dict:
    response = client.post(
        "/api/v1/users",
        json={
            "username": username,
            "avatar_emoji": avatar_emoji,
            "device_platform": "android",
            "device_brand": "Pixel",
        },
    )
    assert response.status_code == 200
    return response.json()


def _get_seeded_public_question(client) -> dict:
    response = client.get("/api/v1/library/questions")
    assert response.status_code == 200
    payload = response.json()
    assert payload
    return payload[0]


def _create_user_record(db_session, *, username: str, avatar_emoji: str = "\U0001F431") -> User:
    user = User(username=username, avatar_emoji=avatar_emoji)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@allure.feature("API")
@allure.story("Question Library")
class TestQuestionLibraryApi:
    @allure.title("Library categories and public questions are loaded from the seeded database")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_library_endpoints_seed_and_return_public_questions(self, client):
        categories_response = client.get("/api/v1/library/categories")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        assert categories
        assert any(item["slug"] == "about-me" for item in categories)

        questions_response = client.get(
            "/api/v1/library/questions",
            params={"search": "Венера", "origin_screen": "create"},
        )
        assert questions_response.status_code == 200
        questions = questions_response.json()
        assert questions
        assert all(item["source"] == "system" for item in questions)
        assert all(item["visibility"] == "public" for item in questions)
        assert all("Венера" in f"{item['text']} {item['correct']}" for item in questions)


@allure.feature("API")
@allure.story("Favorites")
class TestFavoriteQuestionsApi:
    @allure.title("User can favorite an existing public question and remove it later")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_add_and_remove_existing_public_favorite(self, client):
        user = _create_user_via_api(client, "FavExisting")
        public_question = _get_seeded_public_question(client)

        add_response = client.post(
            "/api/v1/me/favorites/questions",
            json={
                "user_id": user["id"],
                "origin_screen": "create",
                "source_question_public_id": public_question["public_id"],
            },
        )
        assert add_response.status_code == 200
        added_question = add_response.json()
        assert added_question["public_id"] == public_question["public_id"]
        assert added_question["is_favorite"] is True

        favorites_response = client.get(
            "/api/v1/me/favorites/questions",
            params={"user_id": user["id"], "origin_screen": "profile"},
        )
        assert favorites_response.status_code == 200
        favorites = favorites_response.json()
        assert len(favorites) == 1
        assert favorites[0]["public_id"] == public_question["public_id"]

        delete_response = client.delete(
            f"/api/v1/me/favorites/questions/{public_question['public_id']}",
            params={"user_id": user["id"], "origin_screen": "profile"},
        )
        assert delete_response.status_code == 204

        favorites_after_delete = client.get(
            "/api/v1/me/favorites/questions",
            params={"user_id": user["id"]},
        )
        assert favorites_after_delete.status_code == 200
        assert favorites_after_delete.json() == []

    @allure.title("Custom favorite questions are deduplicated per user")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_add_custom_favorite_reuses_existing_private_question(self, client, db_session):
        user = _create_user_via_api(client, "FavCustom")
        payload = {
            "user_id": user["id"],
            "origin_screen": "profile",
            "question": {
                "text": "Какой цвет неба в ясную погоду?",
                "type": "options",
                "correct": "Синий",
                "options": ["Красный", "Синий", "Зеленый"],
            },
        }

        first_response = client.post("/api/v1/me/favorites/questions", json=payload)
        second_response = client.post("/api/v1/me/favorites/questions", json=payload)

        assert first_response.status_code == 200
        assert second_response.status_code == 200
        assert first_response.json()["public_id"] == second_response.json()["public_id"]

        private_questions = (
            db_session.query(QuestionBankQuestion)
            .filter(
                QuestionBankQuestion.owner_id == user["id"],
                QuestionBankQuestion.visibility == "private",
            )
            .all()
        )
        favorites = (
            db_session.query(UserFavoriteQuestion)
            .filter(UserFavoriteQuestion.user_id == user["id"])
            .all()
        )
        assert len(private_questions) == 1
        assert len(favorites) == 1


@allure.feature("API")
@allure.story("Repeat Drafts")
class TestRepeatDraftApi:
    @allure.title("Template draft is available to the owner and preserves source-question links")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_template_draft_owner_only_and_preserves_source_question(self, client, db_session):
        owner = _create_user_via_api(client, "RepeatOwner")
        other_user = _create_user_via_api(client, "RepeatOther", avatar_emoji="\U0001F436")
        public_question = _get_seeded_public_question(client)

        create_response = client.post(
            "/api/v1/quizzes",
            json={
                "title": "Repeatable Quiz",
                "owner_id": owner["id"],
                "questions": [
                    {
                        "text": public_question["text"],
                        "type": public_question["type"],
                        "correct": public_question["correct"],
                        "options": public_question.get("options"),
                        "source_question_public_id": public_question["public_id"],
                    }
                ],
            },
        )
        assert create_response.status_code == 200
        create_payload = create_response.json()

        stored_quiz = (
            db_session.query(Quiz)
            .filter(Quiz.public_id == create_payload["public_id"])
            .first()
        )
        assert stored_quiz is not None
        assert stored_quiz.session_metadata["source_question_links"] == 1
        assert stored_quiz.questions[0].source_question is not None
        assert stored_quiz.questions[0].source_question.public_id == public_question["public_id"]

        owner_draft_response = client.get(
            f"/api/v1/templates/{create_payload['template_public_id']}/draft",
            params={"user_id": owner["id"], "origin_screen": "history"},
        )
        assert owner_draft_response.status_code == 200
        draft_payload = owner_draft_response.json()
        assert draft_payload["template_public_id"] == create_payload["template_public_id"]
        assert draft_payload["questions"][0]["source_question_public_id"] == public_question["public_id"]

        denied_response = client.get(
            f"/api/v1/templates/{create_payload['template_public_id']}/draft",
            params={"user_id": other_user["id"], "origin_screen": "history"},
        )
        assert denied_response.status_code == 403

    @allure.title("History exposes repeat metadata only for the host-owner entry")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_history_repeat_metadata_for_host_and_non_host(self, client, db_session):
        owner = _create_user_record(db_session, username="HistoryHost")
        guest = _create_user_record(db_session, username="HistoryGuest", avatar_emoji="\U0001F436")
        started_at = datetime(2026, 3, 12, 20, 0, 0)

        quiz = Quiz(
            title="History Repeat Quiz",
            code="PARTY-HRPT1",
            questions_data=[{"text": "2+2?", "type": "text", "correct": "4"}],
            total_questions=1,
            current_question=1,
            status="finished",
            owner_id=owner.id,
        )
        quiz.started_at = started_at
        quiz.finished_at = started_at + timedelta(minutes=12)
        quiz.template.owner_id = owner.id

        db_session.add(quiz)
        db_session.flush()

        host_participant = Player(
            name=owner.username,
            sid="host-history-repeat",
            quiz=quiz,
            user_id=owner.id,
            is_host=True,
            status="finished",
            score=1,
            final_rank=1,
            emoji=owner.avatar_emoji,
            answers_history={"1": "4"},
            scores_history={"1": 1},
        )
        guest_participant = Player(
            name=guest.username,
            sid="guest-history-repeat",
            quiz=quiz,
            user_id=guest.id,
            is_host=False,
            status="finished",
            score=1,
            final_rank=1,
            emoji=guest.avatar_emoji,
            answers_history={"1": "4"},
            scores_history={"1": 1},
        )
        db_session.add_all([host_participant, guest_participant])
        db_session.commit()

        owner_history_response = client.get(f"/api/v1/users/{owner.id}/history")
        guest_history_response = client.get(f"/api/v1/users/{guest.id}/history")

        assert owner_history_response.status_code == 200
        assert guest_history_response.status_code == 200

        owner_entry = owner_history_response.json()[0]
        guest_entry = guest_history_response.json()[0]

        assert owner_entry["template_public_id"] == quiz.template.public_id
        assert owner_entry["is_host_game"] is True
        assert owner_entry["can_repeat"] is True

        assert guest_entry["template_public_id"] == quiz.template.public_id
        assert guest_entry["is_host_game"] is False
        assert guest_entry["can_repeat"] is False
