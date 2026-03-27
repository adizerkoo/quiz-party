from datetime import timedelta
from unittest.mock import patch

from backend import models
from backend.runtime_state import connection_registry
from backend.services import (
    HOST_TIMEOUT,
    INACTIVITY_CANCEL_TIMEOUT,
    RESUME_WINDOW,
    evaluate_quiz_state,
    log_session_event,
    mark_participant_left,
)


def test_evaluate_quiz_state_cancels_after_host_timeout(db_session, playing_quiz, sample_host):
    sample_host.sid = None
    playing_quiz.host_left_at = models._utc_now() - HOST_TIMEOUT - timedelta(minutes=1)
    connection_registry.unbind_sid("host-sid-001")
    db_session.commit()

    state = evaluate_quiz_state(db_session, quiz=playing_quiz, now=models._utc_now())

    assert state.cancelled is True
    assert state.cancel_reason == "host_timeout"
    assert state.just_cancelled is True
    assert playing_quiz.status == "cancelled"
    assert playing_quiz.cancel_reason == "host_timeout"
    assert playing_quiz.cancelled_at is not None


def test_evaluate_quiz_state_expires_resume_before_full_inactivity_cancel(db_session, playing_quiz):
    playing_quiz.last_activity_at = models._utc_now() - RESUME_WINDOW - timedelta(minutes=1)
    db_session.commit()

    state = evaluate_quiz_state(db_session, quiz=playing_quiz, now=models._utc_now())

    assert state.cancelled is False
    assert state.resume_window_expired is True
    assert playing_quiz.status == "playing"


def test_evaluate_quiz_state_cancels_after_full_inactivity_timeout(db_session, playing_quiz):
    playing_quiz.last_activity_at = models._utc_now() - INACTIVITY_CANCEL_TIMEOUT - timedelta(minutes=1)
    db_session.commit()

    state = evaluate_quiz_state(db_session, quiz=playing_quiz, now=models._utc_now())

    assert state.cancelled is True
    assert state.cancel_reason == "inactivity_timeout"
    assert playing_quiz.status == "cancelled"
    assert playing_quiz.cancel_reason == "inactivity_timeout"


def test_mark_participant_left_clears_reconnect_state(sample_player):
    sample_player.reconnect_token_hash = "secret-hash"
    sample_player.sid = "player-sid-001"

    mark_participant_left(sample_player, left_at=models._utc_now())

    assert sample_player.status == "left"
    assert sample_player.left_at is not None
    assert sample_player.reconnect_token_hash is None
    assert sample_player.sid is None


def test_log_session_event_is_mirrored_to_file_logs(db_session, sample_quiz, sample_player):
    with patch("backend.services.log_game_event") as mock_log_game_event:
        log_session_event(
            db_session,
            quiz=sample_quiz,
            participant=sample_player,
            installation=sample_player.installation,
            event_type="participant_left",
            payload={"left_at": models._utc_now().isoformat()},
        )

    mock_log_game_event.assert_called_once()
    assert mock_log_game_event.call_args.args[2] == "participant_left"
    assert mock_log_game_event.call_args.kwargs["event_payload"]["left_at"]
