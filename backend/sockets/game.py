"""Socket.IO обработчики игрового процесса."""

from __future__ import annotations

import datetime
import logging

from .. import database, models
from ..helpers import get_player_by_sid, get_players_in_quiz, get_quiz_by_code, verify_host
from ..runtime_state import connection_registry
from ..security import rate_limiter, sanitize_text, validate_answer, validate_quiz_code
from ..services import (
    apply_score_override,
    get_question_by_position,
    log_session_event,
    upsert_answer,
)

logger = logging.getLogger(__name__)


def register_game_handlers(sio_manager):
    """Регистрирует socket-события, связанные с ходом игры и оценкой ответов."""
    @sio_manager.on("start_game_signal")
    async def handle_start(sid, data):
        """Переводит сессию из лобби в состояние активной игры."""
        room = data.get("room")
        if not validate_quiz_code(room):
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            if not quiz or not verify_host(db, quiz.id, sid):
                return
            if quiz.status != "waiting" or quiz.total_questions <= 0:
                return

            # Первый вопрос включается явно, чтобы реконнект мог восстановить состояние.
            quiz.current_question = 1
            quiz.status = "playing"
            quiz.started_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
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
            logger.info("Game started  room=%s  quiz_id=%s  players=%d", room, quiz.id, len(players))
            await sio_manager.emit("game_started", players, room=room)

    @sio_manager.on("send_answer")
    async def handle_answer(sid, data):
        """Принимает и сохраняет ответ игрока на текущий вопрос."""
        if not rate_limiter.is_allowed(sid):
            logger.warning("Rate limit hit on send_answer  sid=%s", sid)
            return

        room = data.get("room")
        if not validate_quiz_code(room):
            return

        raw_answer = data.get("answer", "")
        answer = sanitize_text(str(raw_answer)[:500]) if raw_answer else ""
        if not validate_answer(answer):
            logger.warning("Invalid answer rejected  sid=%s  room=%s", sid, room)
            return

        raw_q_idx = data.get("questionIndex")
        try:
            question_index = int(raw_q_idx)
        except (TypeError, ValueError):
            logger.warning("Invalid questionIndex  sid=%s  room=%s  value=%r", sid, room, raw_q_idx)
            return

        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            participant = get_player_by_sid(db, sid)
            if not quiz or not participant or participant.quiz_id != quiz.id or participant.is_host:
                return

            question = get_question_by_position(quiz, question_index)
            if question is None:
                logger.warning("Answer index out of range  name=%s  idx=%s  room=%s", participant.name, question_index, room)
                return

            # Повторный ответ на тот же вопрос запрещаем на уровне бизнес-логики.
            if any(existing.question_id == question.id for existing in participant.answers):
                logger.debug("Duplicate answer rejected  name=%s  q=%s  room=%s", participant.name, question_index, room)
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
            logger.info(
                "Answer received  name=%s  room=%s  q=%s  correct=%s  score=%d",
                participant.name,
                room,
                question.position,
                stored_answer.is_correct,
                participant.score,
            )
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @sio_manager.on("next_question_signal")
    async def handle_next_question(sid, data):
        """Переключает игру на следующий вопрос по команде хоста."""
        room = data.get("room")
        if not validate_quiz_code(room):
            return

        expected_question = data.get("expectedQuestion")
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if not quiz or not verify_host(db, quiz.id, sid):
                return

            # Защита от гонки: если host UI устарел, возвращаем фактический current_question.
            if expected_question is not None and quiz.current_question != expected_question:
                await sio_manager.emit("move_to_next", {"question": quiz.current_question}, room=room)
                return

            next_question = quiz.current_question + 1
            if next_question > quiz.total_questions:
                return

            quiz.current_question = next_question
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="question_advanced",
                payload={"question": next_question},
            )
            db.commit()
            logger.info("Next question  room=%s  question=%d/%d", room, next_question, quiz.total_questions)
            await sio_manager.emit("move_to_next", {"question": quiz.current_question}, room=room)
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @sio_manager.on("move_to_step")
    async def handle_move_step(sid, data):
        """Позволяет хосту прыгнуть к произвольному вопросу в пределах диапазона."""
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
            if not quiz or not verify_host(db, quiz.id, sid):
                return
            if step < 1 or step > quiz.total_questions:
                return

            quiz.current_question = step
            log_session_event(
                db,
                quiz=quiz,
                participant=host,
                installation=host.installation if host else None,
                event_type="question_jumped",
                payload={"question": step},
            )
            db.commit()
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @sio_manager.on("override_score")
    async def handle_override(sid, data):
        """Ручная корректировка очков игрока со стороны хоста."""
        if not rate_limiter.is_allowed(sid):
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

        # Наружу сейчас поддерживаем только два состояния: 1 очко или 0.
        desired_points = 1 if requested_points == 1 else 0
        with database.get_db_session() as db:
            quiz = get_quiz_by_code(db, room)
            host = get_player_by_sid(db, sid)
            if not quiz or not verify_host(db, quiz.id, sid):
                return

            participant = (
                db.query(models.Player)
                .filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.name == player_name,
                    models.Player.role == "player",
                    models.Player.status != "kicked",
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
            logger.info(
                "Score overridden  player=%s  room=%s  q=%s  delta=%s  total=%d",
                player_name,
                room,
                question.position,
                adjustment.points_delta,
                participant.score,
            )
            await sio_manager.emit("update_answers", get_players_in_quiz(db, quiz.id), room=room)

    @sio_manager.on("check_answers_before_next")
    async def check_answers(sid, data):
        """Проверяет, ответили ли все онлайн-игроки перед следующим вопросом."""
        if not rate_limiter.is_allowed(sid):
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
            if not quiz or not verify_host(db, quiz.id, sid):
                return

            players = [
                participant
                for participant in quiz.players
                if not participant.is_host and participant.status != "kicked"
            ]
            all_answered = True
            for participant in players:
                # Оффлайн-игроков здесь не блокируем, иначе host не сможет продолжить игру.
                if not connection_registry.is_connected(participant.id):
                    continue
                if not any(answer.question_position == question_index for answer in participant.answers):
                    all_answered = False
                    break

            await sio_manager.emit("answers_check_result", {"allAnswered": all_answered}, room=sid)
            logger.debug("Check answers  room=%s  q=%s  all_answered=%s", room, question_index, all_answered)
