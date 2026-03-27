"""Socket.IO handlers for the core gameplay flow."""

from __future__ import annotations

import datetime
import logging

from .. import database, models
from ..helpers import get_player_by_sid, get_players_in_quiz, get_quiz_by_code, verify_host
from ..logging_config import build_log_extra, log_event, log_game_event, logged_socket_handler
from ..runtime_state import connection_registry
from ..security import rate_limiter, sanitize_text, validate_answer, validate_quiz_code
from ..services import (
    apply_score_override,
    build_game_cancelled_payload,
    evaluate_quiz_state,
    get_question_by_position,
    log_session_event,
    mark_quiz_activity,
    upsert_answer,
)


logger = logging.getLogger(__name__)


def register_game_handlers(sio_manager):
    """Registers Socket.IO handlers related to the game lifecycle."""

    async def _emit_game_cancelled(room: str, quiz: models.Quiz):
        await sio_manager.emit("game_cancelled", build_game_cancelled_payload(quiz), room=room)

    @logged_socket_handler(sio_manager, "start_game_signal", logger)
    async def handle_start(sid, data):
        """Moves a quiz session from lobby to active gameplay."""
        room = data.get("room")
        if not validate_quiz_code(room):
            log_event(
                logger,
                logging.WARNING,
                "socket.start_game_signal.invalid_room",
                "start_game_signal ignored because room code is invalid",
                sid=sid,
                room=room,
            )
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.start_game_signal.quiz_missing",
                    "start_game_signal ignored because the quiz does not exist",
                    room=room,
                    sid=sid,
                )
                return
            state = evaluate_quiz_state(db, quiz=quiz)
            if state.cancelled:
                if state.just_cancelled:
                    db.commit()
                await _emit_game_cancelled(room, quiz)
                return
            if not verify_host(db, quiz.id, sid):
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.start_game_signal.host_required",
                    "start_game_signal ignored because sender is not the host",
                    **build_log_extra(quiz=quiz, sid=sid),
                )
                return
            if quiz.status != "waiting" or quiz.total_questions <= 0:
                log_event(
                    logger,
                    logging.INFO,
                    "socket.start_game_signal.skipped",
                    "start_game_signal ignored because the quiz cannot be started",
                    **build_log_extra(quiz=quiz, sid=sid),
                    status=quiz.status,
                    total_questions=quiz.total_questions,
                )
                return

            quiz.current_question = 1
            quiz.status = "playing"
            quiz.started_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
            mark_quiz_activity(quiz, occurred_at=quiz.started_at)
            host = get_player_by_sid(db, sid)
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="game_started",
                payload={"current_question": 1},
            )
            db.commit()
            players = get_players_in_quiz(db, quiz.id)
            log_game_event(
                logger,
                logging.INFO,
                "socket.start_game_signal.completed",
                "Game started",
                **build_log_extra(quiz=quiz, participant=host, sid=sid, question=1),
                players=len(players),
            )
            await sio_manager.emit("game_started", players, room=room)

    @logged_socket_handler(sio_manager, "send_answer", logger)
    async def handle_answer(sid, data):
        """Stores a player's answer for the current question."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.send_answer.rate_limited",
                "send_answer rejected by rate limiter",
                sid=sid,
            )
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            log_event(
                logger,
                logging.WARNING,
                "socket.send_answer.invalid_room",
                "send_answer ignored because room code is invalid",
                sid=sid,
                room=room,
            )
            return

        raw_answer = data.get("answer", "")
        answer = sanitize_text(str(raw_answer)[:500]) if raw_answer else ""
        if not validate_answer(answer):
            log_event(
                logger,
                logging.WARNING,
                "socket.send_answer.invalid_payload",
                "send_answer rejected because answer payload is invalid",
                sid=sid,
                room=room,
            )
            return

        raw_q_idx = data.get("questionIndex")
        try:
            question_index = int(raw_q_idx)
        except (TypeError, ValueError):
            log_event(
                logger,
                logging.WARNING,
                "socket.send_answer.invalid_question_index",
                "send_answer rejected because questionIndex is invalid",
                sid=sid,
                room=room,
                question=raw_q_idx,
            )
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            participant = get_player_by_sid(db, sid)
            if quiz is not None:
                state = evaluate_quiz_state(db, quiz=quiz)
                if state.cancelled:
                    if state.just_cancelled:
                        db.commit()
                    await _emit_game_cancelled(room, quiz)
                    return
            if (
                not quiz
                or not participant
                or participant.quiz_id != quiz.id
                or participant.is_host
                or participant.status in {"kicked", "left"}
            ):
                log_event(
                    logger,
                    logging.INFO,
                    "socket.send_answer.ignored",
                    "send_answer ignored because sender is not an active player in the room",
                    room=room,
                    sid=sid,
                )
                return

            question = get_question_by_position(quiz, question_index)
            if question is None:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.send_answer.question_missing",
                    "send_answer rejected because question index is out of range",
                    **build_log_extra(quiz=quiz, participant=participant, sid=sid, question=question_index),
                )
                return

            if any(existing.question_id == question.id for existing in participant.answers):
                log_event(
                    logger,
                    logging.DEBUG,
                    "socket.send_answer.duplicate",
                    "Duplicate answer rejected",
                    **build_log_extra(quiz=quiz, participant=participant, sid=sid, question=question.position),
                )
                return

            raw_time = data.get("answerTime")
            answer_time_seconds = None
            if raw_time is not None:
                try:
                    parsed = round(float(raw_time), 1)
                    if 0 < parsed < 3600:
                        answer_time_seconds = parsed
                except (TypeError, ValueError):
                    answer_time_seconds = None

            stored_answer, _ = upsert_answer(
                participant=participant,
                quiz=quiz,
                question=question,
                answer_text=answer,
                answer_time_seconds=answer_time_seconds,
            )
            mark_quiz_activity(quiz, occurred_at=stored_answer.submitted_at)
            log_session_event(
                db,
                quiz=quiz,
                participant=participant,
                installation=participant.installation,
                question=question,
                event_type="answer_submitted",
                payload={
                    "question_index": question.position,
                    "is_correct": bool(stored_answer.is_correct),
                },
            )
            db.commit()
            log_game_event(
                logger,
                logging.INFO,
                "socket.send_answer.completed",
                "Answer received",
                **build_log_extra(quiz=quiz, participant=participant, sid=sid, question=question.position),
                submitted_answer=answer,
                correct=bool(stored_answer.is_correct),
                score=participant.score,
                answer_time_seconds=answer_time_seconds,
            )
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @logged_socket_handler(sio_manager, "next_question_signal", logger)
    async def handle_next_question(sid, data):
        """Advances the game to the next question on host command."""
        room = data.get("room")
        if not validate_quiz_code(room):
            log_event(
                logger,
                logging.WARNING,
                "socket.next_question_signal.invalid_room",
                "next_question_signal ignored because room code is invalid",
                sid=sid,
                room=room,
            )
            return

        expected_question = data.get("expectedQuestion")
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if not quiz:
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.next_question_signal.quiz_missing",
                    "next_question_signal ignored because the quiz does not exist",
                    room=room,
                    sid=sid,
                )
                return
            state = evaluate_quiz_state(db, quiz=quiz)
            if state.cancelled:
                if state.just_cancelled:
                    db.commit()
                await _emit_game_cancelled(room, quiz)
                return
            if not verify_host(db, quiz.id, sid):
                log_event(
                    logger,
                    logging.WARNING,
                    "socket.next_question_signal.host_required",
                    "next_question_signal ignored because sender is not the host",
                    **build_log_extra(quiz=quiz, sid=sid),
                )
                return

            if expected_question is not None and quiz.current_question != expected_question:
                log_event(
                    logger,
                    logging.INFO,
                    "socket.next_question_signal.stale",
                    "next_question_signal ignored because host state is stale",
                    **build_log_extra(quiz=quiz, participant=host, sid=sid, question=quiz.current_question),
                    expected_question=expected_question,
                )
                await sio_manager.emit("move_to_next", {"question": quiz.current_question}, room=room)
                return

            next_question = quiz.current_question + 1
            if next_question > quiz.total_questions:
                log_event(
                    logger,
                    logging.INFO,
                    "socket.next_question_signal.completed_last_step",
                    "next_question_signal ignored because the quiz is already at the last question",
                    **build_log_extra(quiz=quiz, participant=host, sid=sid, question=quiz.current_question),
                    total_questions=quiz.total_questions,
                )
                return

            quiz.current_question = next_question
            mark_quiz_activity(quiz)
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="question_advanced",
                payload={"question": next_question},
            )
            db.commit()
            log_game_event(
                logger,
                logging.INFO,
                "socket.next_question_signal.completed",
                "Moved to the next question",
                **build_log_extra(quiz=quiz, participant=host, sid=sid, question=next_question),
                total_questions=quiz.total_questions,
            )
            await sio_manager.emit("move_to_next", {"question": quiz.current_question}, room=room)
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @logged_socket_handler(sio_manager, "move_to_step", logger)
    async def handle_move_step(sid, data):
        """Lets the host jump directly to an arbitrary question."""
        room = data.get("room")
        if not validate_quiz_code(room):
            return
        raw_step = data.get("question")
        try:
            step = int(raw_step)
        except (TypeError, ValueError):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if quiz is not None:
                state = evaluate_quiz_state(db, quiz=quiz)
                if state.cancelled:
                    if state.just_cancelled:
                        db.commit()
                    await _emit_game_cancelled(room, quiz)
                    return
            if not quiz or not verify_host(db, quiz.id, sid):
                return
            if step < 1 or step > quiz.total_questions:
                return

            quiz.current_question = step
            mark_quiz_activity(quiz)
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="question_jumped",
                payload={"question": step},
            )
            db.commit()
            log_game_event(
                logger,
                logging.INFO,
                "socket.move_to_step.completed",
                "Host jumped to a specific question",
                **build_log_extra(quiz=quiz, participant=host, sid=sid, question=step),
                total_questions=quiz.total_questions,
            )
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @logged_socket_handler(sio_manager, "override_score", logger)
    async def handle_override(sid, data):
        """Lets the host manually override a player's score for a question."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.override_score.rate_limited",
                "override_score rejected by rate limiter",
                sid=sid,
            )
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            return
        player_name = data.get("playerName")
        requested_points = data.get("points")
        question_index = data.get("questionIndex")
        try:
            question_index = int(question_index)
        except (TypeError, ValueError):
            return

        desired_points = 1 if requested_points == 1 else 0
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if quiz is not None:
                state = evaluate_quiz_state(db, quiz=quiz)
                if state.cancelled:
                    if state.just_cancelled:
                        db.commit()
                    await _emit_game_cancelled(room, quiz)
                    return
            if not quiz or not verify_host(db, quiz.id, sid):
                return

            participant = (
                db.query(models.Player)
                .filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.name == player_name,
                    models.Player.role == "player",
                    models.Player.status.notin_(("kicked", "left")),
                )
                .first()
            )
            question = get_question_by_position(quiz, question_index)
            if participant is None or question is None:
                return

            adjustment = apply_score_override(
                quiz=quiz,
                participant=participant,
                question=question,
                desired_points=desired_points,
                created_by=host,
            )
            if adjustment is None:
                return

            db.add(adjustment)
            mark_quiz_activity(quiz)
            log_session_event(
                db,
                quiz=quiz,
                participant=participant,
                installation=participant.installation,
                question=question,
                event_type="score_overridden",
                payload={
                    "player_name": participant.name,
                    "question": question.position,
                    "points_delta": adjustment.points_delta,
                },
            )
            db.commit()
            log_game_event(
                logger,
                logging.INFO,
                "socket.override_score.completed",
                "Score overridden",
                **build_log_extra(quiz=quiz, participant=participant, sid=sid, question=question.position),
                points_delta=adjustment.points_delta,
                score=participant.score,
                requested_points=desired_points,
            )
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @logged_socket_handler(sio_manager, "check_answers_before_next", logger)
    async def check_answers(sid, data):
        """Checks whether all connected players answered before advancing."""
        if not rate_limiter.is_allowed(sid):
            log_event(
                logger,
                logging.WARNING,
                "socket.check_answers_before_next.rate_limited",
                "check_answers_before_next rejected by rate limiter",
                sid=sid,
            )
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            return
        try:
            question_index = int(data.get("question"))
        except (TypeError, ValueError):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if quiz is not None:
                state = evaluate_quiz_state(db, quiz=quiz)
                if state.cancelled:
                    if state.just_cancelled:
                        db.commit()
                    await _emit_game_cancelled(room, quiz)
                    return
            if not quiz or not verify_host(db, quiz.id, sid):
                return

            players = [
                participant
                for participant in quiz.players
                if not participant.is_host and participant.status not in {"kicked", "left"}
            ]
            all_answered = True
            for participant in players:
                if not connection_registry.is_connected(participant.id):
                    continue
                if not any(answer.question_position == question_index for answer in participant.answers):
                    all_answered = False
                    break

            await sio_manager.emit("answers_check_result", {"allAnswered": all_answered}, room=sid)
            log_event(
                logger,
                logging.DEBUG,
                "socket.check_answers_before_next.completed",
                "Checked whether all answers were submitted",
                **build_log_extra(quiz=quiz, sid=sid, question=question_index),
                all_answered=all_answered,
                players=len(players),
            )
