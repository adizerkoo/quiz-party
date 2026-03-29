"""
API tests for persistent user profiles and protected history endpoints.
"""

from datetime import datetime, timedelta
from uuid import uuid4

import allure

from backend.models import Player, Quiz, User, UserInstallation
from backend.security import issue_installation_session_token


VALID_USER_PAYLOAD = {
    "username": "Alice",
    "avatar_emoji": "\U0001F431",
    "device_platform": "android",
    "device_brand": "Samsung",
}

HISTORY_QUESTIONS = [
    {
        "text": "2 + 2 = ?",
        "type": "text",
        "correct": "4",
        "options": None,
    }
]


def _auth_headers(session_token: str | None) -> dict[str, str]:
    assert session_token
    return {"Authorization": f"Bearer {session_token}"}


def _create_user_via_api(client, **overrides) -> dict:
    response = client.post("/api/v1/users", json={**VALID_USER_PAYLOAD, **overrides})
    assert response.status_code == 200
    return response.json()


def _create_user_record(db_session, *, username="History User", avatar_emoji="\U0001F431"):
    user = User(username=username, avatar_emoji=avatar_emoji)
    installation = UserInstallation(
        user=user,
        public_id=str(uuid4()),
        platform="web",
    )
    session_token = issue_installation_session_token(installation)
    db_session.add_all([user, installation])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(installation)
    return user, session_token


def _create_history_quiz(
    db_session,
    *,
    user,
    code,
    title,
    status,
    participant_status,
    started_at,
    ended_at=None,
    cancel_reason=None,
    score=0,
    final_rank=None,
    extra_players=None,
):
    quiz = Quiz(
        title=title,
        code=code,
        questions_data=HISTORY_QUESTIONS,
        total_questions=len(HISTORY_QUESTIONS),
        current_question=len(HISTORY_QUESTIONS),
        status=status,
    )
    quiz.started_at = started_at
    if status == "finished":
        quiz.finished_at = ended_at or (started_at + timedelta(minutes=10))
    if status == "cancelled":
        quiz.cancelled_at = ended_at or (started_at + timedelta(minutes=10))
        quiz.cancel_reason = cancel_reason

    host = Player(
        name=f"Host-{code[-4:]}",
        sid=f"host-{code}",
        quiz=quiz,
        is_host=True,
        status="finished" if status == "finished" else "joined",
        score=0,
        emoji="\U0001F436",
    )
    participant = Player(
        name=user.username,
        sid=f"player-{code}",
        quiz=quiz,
        user_id=user.id,
        is_host=False,
        status=participant_status,
        score=score,
        final_rank=final_rank,
        emoji=user.avatar_emoji,
        answers_history={"1": "4"},
        scores_history={"1": score},
        answer_times={"1": 1.2},
    )

    db_session.add_all([quiz, host, participant])

    for index, extra in enumerate(extra_players or [], start=1):
        db_session.add(
            Player(
                name=extra["name"],
                sid=f"extra-{code}-{index}",
                quiz=quiz,
                is_host=False,
                status=extra.get("status", "finished"),
                score=extra.get("score", 0),
                final_rank=extra.get("final_rank"),
                emoji=extra.get("emoji", "\U0001F98A"),
                answers_history={"1": extra.get("answer", "4")},
                scores_history={"1": extra.get("score", 0)},
            )
        )

    db_session.commit()
    db_session.refresh(quiz)
    db_session.refresh(participant)
    return quiz, participant


@allure.feature("API")
@allure.story("Users")
class TestUsersApi:
    @allure.title("Create user returns a stored profile and bearer session token")
    @allure.severity(allure.severity_level.BLOCKER)
    def test_create_user_success(self, client):
        response = client.post("/api/v1/users", json=VALID_USER_PAYLOAD)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] > 0
        assert data["username"] == "Alice"
        assert data["avatar_emoji"] == "\U0001F431"
        assert data["device_platform"] == "android"
        assert data["device_brand"] == "Samsung"
        assert data["created_at"] is not None
        assert data["last_login_at"] is not None
        assert data["public_id"]
        assert data["session_token"]

    @allure.title("Create user returns installation public id when provided")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_user_returns_installation_public_id(self, client):
        installation_public_id = "install-test-0001"
        response = client.post(
            "/api/v1/users",
            json={**VALID_USER_PAYLOAD, "installation_public_id": installation_public_id},
        )

        assert response.status_code == 200
        assert response.json()["installation_public_id"] == installation_public_id

    @allure.title("Users meta returns available avatars")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_users_meta(self, client):
        response = client.get("/api/v1/users/meta")
        assert response.status_code == 200
        assert "\U0001F431" in response.json()["avatar_emojis"]

    @allure.title("User profile is available with the owner's bearer token")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_by_id(self, client):
        created = _create_user_via_api(client)

        response = client.get(
            f"/api/v1/users/{created['id']}",
            headers=_auth_headers(created["session_token"]),
        )

        assert response.status_code == 200
        assert response.json()["username"] == "Alice"

    @allure.title("User profile rejects missing and invalid session tokens")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_requires_session_token(self, client):
        created = _create_user_via_api(client)

        missing_token = client.get(f"/api/v1/users/{created['id']}")
        invalid_token = client.get(
            f"/api/v1/users/{created['id']}",
            headers=_auth_headers("invalid-token"),
        )

        assert missing_token.status_code == 401
        assert invalid_token.status_code == 401

    @allure.title("User profile cannot be read with another user's token")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_forbidden_for_other_user(self, client):
        alice = _create_user_via_api(client)
        bob = _create_user_via_api(
            client,
            username="Bob",
            avatar_emoji="\U0001F436",
            device_platform="ios",
            device_brand="Apple",
        )

        response = client.get(
            f"/api/v1/users/{alice['id']}",
            headers=_auth_headers(bob["session_token"]),
        )

        assert response.status_code == 403

    @allure.title("Duplicate usernames are allowed in users")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_create_user_allows_duplicate_username(self, client):
        first = _create_user_via_api(client)
        second = _create_user_via_api(
            client,
            avatar_emoji="\U0001F438",
            device_platform="ios",
            device_brand="Apple",
        )

        assert second["username"] == first["username"]
        assert second["id"] != first["id"]

    @allure.title("Touch updates last_login_at and device info")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_touch_user(self, client):
        created = _create_user_via_api(client)

        response = client.post(
            f"/api/v1/users/{created['id']}/touch",
            json={"device_platform": "ios", "device_brand": "Apple"},
            headers=_auth_headers(created["session_token"]),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["device_platform"] == "ios"
        assert data["device_brand"] == "Apple"
        assert data["installation_public_id"] is not None
        assert data["session_token"]

    @allure.title("Touch rejects missing and foreign session tokens")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_touch_user_rejects_missing_or_foreign_token(self, client):
        alice = _create_user_via_api(client)
        bob = _create_user_via_api(
            client,
            username="Bob",
            avatar_emoji="\U0001F436",
            device_platform="ios",
            device_brand="Apple",
        )

        missing_token = client.post(
            f"/api/v1/users/{alice['id']}/touch",
            json={"device_platform": "ios", "device_brand": "Apple"},
        )
        foreign_token = client.post(
            f"/api/v1/users/{alice['id']}/touch",
            json={"device_platform": "ios", "device_brand": "Apple"},
            headers=_auth_headers(bob["session_token"]),
        )

        assert missing_token.status_code == 401
        assert foreign_token.status_code == 403

    @allure.title("User update changes the same row")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_update_user(self, client):
        created = _create_user_via_api(client)

        response = client.put(
            f"/api/v1/users/{created['id']}",
            json={
                "username": "New Alice",
                "avatar_emoji": "\U0001F438",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
            headers=_auth_headers(created["session_token"]),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == created["id"]
        assert data["username"] == "New Alice"
        assert data["avatar_emoji"] == "\U0001F438"
        assert data["device_platform"] == "ios"
        assert data["device_brand"] == "Apple"
        assert data["session_token"]

    @allure.title("User update can reuse an existing username")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_update_user_allows_duplicate_username(self, client):
        first = _create_user_via_api(client)
        second = _create_user_via_api(
            client,
            username="Bob",
            avatar_emoji="\U0001F436",
            device_platform="android",
            device_brand="Xiaomi",
        )

        response = client.put(
            f"/api/v1/users/{second['id']}",
            json={
                "username": first["username"],
                "avatar_emoji": "\U0001F436",
                "device_platform": "ios",
                "device_brand": "Apple",
            },
            headers=_auth_headers(second["session_token"]),
        )

        assert response.status_code == 200
        assert response.json()["username"] == first["username"]

    @allure.title("User update rejects missing and foreign session tokens")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_update_user_rejects_missing_or_foreign_token(self, client):
        alice = _create_user_via_api(client)
        bob = _create_user_via_api(
            client,
            username="Bob",
            avatar_emoji="\U0001F436",
            device_platform="ios",
            device_brand="Apple",
        )
        payload = {
            "username": "New Alice",
            "avatar_emoji": "\U0001F438",
            "device_platform": "ios",
            "device_brand": "Apple",
        }

        missing_token = client.put(f"/api/v1/users/{alice['id']}", json=payload)
        foreign_token = client.put(
            f"/api/v1/users/{alice['id']}",
            json=payload,
            headers=_auth_headers(bob["session_token"]),
        )

        assert missing_token.status_code == 401
        assert foreign_token.status_code == 403

    @allure.title("Invalid avatar is rejected")
    @allure.severity(allure.severity_level.NORMAL)
    def test_create_user_invalid_avatar(self, client):
        payload = {**VALID_USER_PAYLOAD, "avatar_emoji": "\U0001F916"}
        response = client.post("/api/v1/users", json=payload)
        assert response.status_code == 422

    @allure.title("Legacy installation can exchange into a bearer session")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_exchange_user_session(self, client):
        created = _create_user_via_api(client, installation_public_id="install-test-0002")

        response = client.post(
            f"/api/v1/users/{created['id']}/session",
            json={
                "device_platform": "ios",
                "device_brand": "Apple",
                "installation_public_id": created["installation_public_id"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == created["id"]
        assert data["session_token"]

    @allure.title("Session exchange rejects another user's installation binding")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_exchange_user_session_forbidden_for_other_user(self, client):
        alice = _create_user_via_api(client, installation_public_id="install-test-0101")
        bob = _create_user_via_api(client, installation_public_id="install-test-0102")

        response = client.post(
            f"/api/v1/users/{alice['id']}/session",
            json={
                "device_platform": "ios",
                "device_brand": "Apple",
                "installation_public_id": bob["installation_public_id"],
            },
        )

        assert response.status_code == 403


@allure.feature("API")
@allure.story("User History")
class TestUserHistoryApi:
    @allure.title("User without games gets an empty history list")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_user_history_empty(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="No Games")

        response = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert response.status_code == 200
        assert response.json() == []

    @allure.title("History requires the owner's session token")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_history_requires_session_token(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="Guarded History")
        other_user, other_token = _create_user_record(db_session, username="Other History")

        missing_token = client.get(f"/api/v1/users/{user.id}/history")
        invalid_token = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers("invalid-token"),
        )
        foreign_token = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(other_token),
        )
        happy_path = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert missing_token.status_code == 401
        assert invalid_token.status_code == 401
        assert foreign_token.status_code == 403
        assert happy_path.status_code == 200
        assert other_user.id != user.id

    @allure.title("Finished game history includes winners, rank and open-results flag")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_history_finished_game(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="Champion")
        started_at = datetime(2026, 3, 1, 18, 0, 0)
        _create_history_quiz(
            db_session,
            user=user,
            code="PARTY-HFIN1",
            title="Friday Final",
            status="finished",
            participant_status="finished",
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=14),
            score=3,
            final_rank=1,
            extra_players=[
                {"name": "CoWinner", "score": 3, "final_rank": 1},
                {"name": "Runner", "score": 1, "final_rank": 2},
            ],
        )

        response = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert response.status_code == 200
        entry = response.json()[0]
        assert entry["quiz_code"] == "PARTY-HFIN1"
        assert entry["title"] == "Friday Final"
        assert entry["game_status"] == "finished"
        assert entry["participant_status"] == "finished"
        assert entry["score"] == 3
        assert entry["final_rank"] == 1
        assert entry["is_winner"] is True
        assert set(entry["winner_names"]) == {"Champion", "CoWinner"}
        assert entry["can_open_results"] is True

    @allure.title("Cancelled game history keeps the record but disables opening results")
    @allure.severity(allure.severity_level.CRITICAL)
    def test_get_user_history_cancelled_game(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="Cancelled User")
        started_at = datetime(2026, 3, 2, 19, 0, 0)
        _create_history_quiz(
            db_session,
            user=user,
            code="PARTY-HCAN1",
            title="Cancelled Room",
            status="cancelled",
            participant_status="joined",
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=5),
            cancel_reason="host_timeout",
        )

        response = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert response.status_code == 200
        entry = response.json()[0]
        assert entry["game_status"] == "cancelled"
        assert entry["cancel_reason"] == "host_timeout"
        assert entry["winner_names"] == []
        assert entry["can_open_results"] is False

    @allure.title("History is sorted from newest game to oldest")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_user_history_sorted_by_freshness(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="Sorted User")
        older_start = datetime(2026, 3, 1, 10, 0, 0)
        newer_start = datetime(2026, 3, 5, 10, 0, 0)
        _create_history_quiz(
            db_session,
            user=user,
            code="PARTY-HOLD1",
            title="Older Game",
            status="finished",
            participant_status="finished",
            started_at=older_start,
            ended_at=older_start + timedelta(minutes=8),
            score=1,
            final_rank=2,
            extra_players=[{"name": "Winner", "score": 2, "final_rank": 1}],
        )
        _create_history_quiz(
            db_session,
            user=user,
            code="PARTY-HNEW1",
            title="Newer Game",
            status="cancelled",
            participant_status="joined",
            started_at=newer_start,
            ended_at=newer_start + timedelta(minutes=6),
            cancel_reason="host_left",
        )

        response = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert response.status_code == 200
        codes = [entry["quiz_code"] for entry in response.json()]
        assert codes == ["PARTY-HNEW1", "PARTY-HOLD1"]

    @allure.title("History exposes the left status for participants who exited themselves")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_user_history_left_status(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="Left User")
        started_at = datetime(2026, 3, 3, 20, 0, 0)
        _create_history_quiz(
            db_session,
            user=user,
            code="PARTY-HLEFT",
            title="Left Early",
            status="finished",
            participant_status="left",
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=7),
            score=0,
            final_rank=None,
            extra_players=[{"name": "Winner", "score": 2, "final_rank": 1}],
        )

        response = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert response.status_code == 200
        entry = response.json()[0]
        assert entry["participant_status"] == "left"
        assert entry["is_winner"] is False
        assert entry["winner_names"] == ["Winner"]
        assert entry["can_open_results"] is True

    @allure.title("History exposes the kicked status for excluded participants")
    @allure.severity(allure.severity_level.NORMAL)
    def test_get_user_history_kicked_status(self, client, db_session):
        user, session_token = _create_user_record(db_session, username="Kicked User")
        started_at = datetime(2026, 3, 4, 21, 0, 0)
        _create_history_quiz(
            db_session,
            user=user,
            code="PARTY-HKICK",
            title="Kicked Room",
            status="finished",
            participant_status="kicked",
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=9),
            score=0,
            final_rank=None,
            extra_players=[{"name": "Winner", "score": 4, "final_rank": 1}],
        )

        response = client.get(
            f"/api/v1/users/{user.id}/history",
            headers=_auth_headers(session_token),
        )

        assert response.status_code == 200
        entry = response.json()[0]
        assert entry["participant_status"] == "kicked"
        assert entry["is_winner"] is False
        assert entry["winner_names"] == ["Winner"]
        assert entry["can_open_results"] is True
