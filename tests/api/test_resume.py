from datetime import timedelta

import allure

from backend import models
from backend.runtime_state import connection_registry
from backend.services import hash_secret


@allure.feature("API")
@allure.story("Resume Check")
class TestResumeCheck:
    @allure.title("Resume check returns active player resume candidate")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_resume_check_returns_resumable_player_session(self, client, db_session, playing_quiz, sample_player):
        sample_player.sid = None
        sample_player.reconnect_token_hash = hash_secret("player-secret")
        playing_quiz.last_activity_at = models._utc_now()
        connection_registry.unbind_sid("player-sid-001")
        db_session.commit()

        response = client.post(
            "/api/v1/resume/check",
            json={
                "sessions": [
                    {
                        "room_code": playing_quiz.code,
                        "role": "player",
                        "participant_token": "player-secret",
                    }
                ]
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["has_resume_game"] is True
        assert data["resume_game"]["room_code"] == playing_quiz.code
        assert data["resume_game"]["role"] == "player"
        assert data["resume_game"]["can_resume"] is True

    @allure.title("Resume is suppressed after more than 10 minutes without activity")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_resume_check_suppresses_expired_resume_window(self, client, db_session, playing_quiz):
        playing_quiz.last_activity_at = models._utc_now() - timedelta(minutes=11)
        db_session.commit()

        response = client.post(
            "/api/v1/resume/check",
            json={
                "sessions": [
                    {
                        "room_code": playing_quiz.code,
                        "role": "player",
                    }
                ]
            },
        )

        assert response.status_code == 200
        session = response.json()["sessions"][0]
        assert session["can_resume"] is False
        assert session["reason"] == "resume_window_expired"
        assert session["clear_credentials"] is True

    @allure.title("Cancelled game blocks resume for both host and player")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_resume_check_blocks_cancelled_game(self, client, db_session, sample_quiz, sample_player):
        sample_quiz.status = "cancelled"
        sample_quiz.cancel_reason = "host_timeout"
        sample_quiz.cancelled_at = models._utc_now()
        sample_quiz.host_secret_hash = hash_secret("host-secret")
        sample_player.reconnect_token_hash = hash_secret("player-secret")
        db_session.commit()

        response = client.post(
            "/api/v1/resume/check",
            json={
                "sessions": [
                    {
                        "room_code": sample_quiz.code,
                        "role": "host",
                        "host_token": "host-secret",
                    },
                    {
                        "room_code": sample_quiz.code,
                        "role": "player",
                        "participant_token": "player-secret",
                    },
                ]
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["has_resume_game"] is False
        assert all(item["can_resume"] is False for item in data["sessions"])
        assert all(item["cancel_reason"] == "host_timeout" for item in data["sessions"])
        assert all(item["clear_credentials"] is True for item in data["sessions"])

    @allure.title("Kicked and left players do not receive resume")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_resume_check_blocks_left_and_kicked_player_statuses(self, client, db_session, playing_quiz, sample_player):
        sample_player.sid = None
        sample_player.reconnect_token_hash = hash_secret("player-secret")
        playing_quiz.last_activity_at = models._utc_now()
        connection_registry.unbind_sid("player-sid-001")
        db_session.commit()

        scenarios = [
            ("left", "participant_left"),
            ("kicked", "participant_kicked"),
        ]

        for status, expected_reason in scenarios:
            sample_player.status = status
            db_session.commit()

            response = client.post(
                "/api/v1/resume/check",
                json={
                    "sessions": [
                        {
                            "room_code": playing_quiz.code,
                            "role": "player",
                            "participant_token": "player-secret",
                        }
                    ]
                },
            )

            assert response.status_code == 200
            session = response.json()["sessions"][0]
            assert session["can_resume"] is False
            assert session["reason"] == expected_reason
            assert session["clear_credentials"] is True

    @allure.title("Finished game is excluded from resume flow")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_resume_check_blocks_finished_game(self, client, finished_quiz):
        response = client.post(
            "/api/v1/resume/check",
            json={
                "sessions": [
                    {
                        "room_code": finished_quiz.code,
                        "role": "player",
                    }
                ]
            },
        )

        assert response.status_code == 200
        session = response.json()["sessions"][0]
        assert session["can_resume"] is False
        assert session["reason"] == "finished"
        assert session["clear_credentials"] is True
