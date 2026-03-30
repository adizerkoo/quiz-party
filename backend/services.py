"""Переходный compatibility-layer для legacy импортов из `backend.services`.

Новая кодовая база разнесена по bounded context модулям:
- `backend.contexts.results`
- `backend.contexts.resume`
- `backend.contexts.library`
- `backend.contexts.favorites`
- `backend.service_core`

Файл оставлен специально, чтобы не ломать старые импорты в тестах и
переходном runtime-коде.
"""

from __future__ import annotations

from .contexts.favorites import (
    add_favorite_question,
    list_favorite_questions,
    remove_favorite_question,
)
from .contexts.library import (
    QUESTION_PREVIEW_LIMIT,
    SYSTEM_LIBRARY_CATEGORY_ALIASES,
    SYSTEM_LIBRARY_CATEGORY_MAP,
    SYSTEM_LIBRARY_CATEGORY_SPECS,
    SYSTEM_LIBRARY_SEED_SOURCE,
    build_question_fingerprint,
    build_question_preview,
    ensure_system_question_bank_seed,
    get_template_draft_for_owner,
    list_library_categories,
    list_library_questions,
)
from .contexts.results import (
    assign_final_ranks,
    build_quiz_results_response,
    build_results_payload,
    build_results_snapshot_payload,
    compute_dense_ranks,
    get_quiz_history_sort_key,
    get_quiz_winner_names,
    get_result_winners,
    list_user_history,
    resolve_results_snapshot_payload,
    sort_result_players,
    validate_results_snapshot,
)
from .contexts.resume import (
    HOST_TIMEOUT,
    INACTIVITY_CANCEL_TIMEOUT,
    RESUME_WINDOW,
    QuizStateEvaluation,
    ResumeEligibility,
    build_game_cancelled_payload,
    cancel_quiz,
    evaluate_quiz_state,
    evaluate_resume_eligibility,
    find_player_resume_candidate,
    get_quiz_activity_at,
    is_participant_connected,
    is_quiz_resume_window_expired,
    mark_participant_left,
    mark_quiz_activity,
)
from .logging_config import log_game_event
from .service_core import (
    DEFAULT_EMOJI,
    DevicePayload,
    apply_score_override,
    build_participant_payload,
    create_quiz_session,
    ensure_installation,
    find_option_for_answer,
    get_question_by_position,
    hash_secret,
    issue_participant_token,
    issue_secret,
    load_quiz_graph,
    log_session_event as _core_log_session_event,
    normalize_answer,
    refresh_participant_score,
    serialize_question,
    serialize_quiz_questions,
    upsert_answer,
    verify_secret,
)


def log_session_event(*args, **kwargs):
    """Совместимый wrapper для тестов, которые patch-ят `backend.services.log_game_event`."""
    _core_log_session_event.__globals__["log_game_event"] = log_game_event
    return _core_log_session_event(*args, **kwargs)


__all__ = [
    "DEFAULT_EMOJI",
    "DevicePayload",
    "HOST_TIMEOUT",
    "INACTIVITY_CANCEL_TIMEOUT",
    "QUESTION_PREVIEW_LIMIT",
    "QuizStateEvaluation",
    "RESUME_WINDOW",
    "ResumeEligibility",
    "SYSTEM_LIBRARY_CATEGORY_ALIASES",
    "SYSTEM_LIBRARY_CATEGORY_MAP",
    "SYSTEM_LIBRARY_CATEGORY_SPECS",
    "SYSTEM_LIBRARY_SEED_SOURCE",
    "add_favorite_question",
    "apply_score_override",
    "assign_final_ranks",
    "build_game_cancelled_payload",
    "build_participant_payload",
    "build_question_fingerprint",
    "build_question_preview",
    "build_quiz_results_response",
    "build_results_payload",
    "build_results_snapshot_payload",
    "cancel_quiz",
    "compute_dense_ranks",
    "create_quiz_session",
    "ensure_installation",
    "ensure_system_question_bank_seed",
    "evaluate_quiz_state",
    "evaluate_resume_eligibility",
    "find_option_for_answer",
    "find_player_resume_candidate",
    "get_question_by_position",
    "get_quiz_activity_at",
    "get_quiz_history_sort_key",
    "get_quiz_winner_names",
    "get_result_winners",
    "get_template_draft_for_owner",
    "hash_secret",
    "is_participant_connected",
    "is_quiz_resume_window_expired",
    "issue_participant_token",
    "issue_secret",
    "list_favorite_questions",
    "list_library_categories",
    "list_library_questions",
    "list_user_history",
    "load_quiz_graph",
    "log_session_event",
    "mark_participant_left",
    "mark_quiz_activity",
    "normalize_answer",
    "refresh_participant_score",
    "remove_favorite_question",
    "resolve_results_snapshot_payload",
    "serialize_question",
    "serialize_quiz_questions",
    "sort_result_players",
    "upsert_answer",
    "validate_results_snapshot",
    "verify_secret",
]
