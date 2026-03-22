import datetime
import logging
from .. import models, database
from ..helpers import get_players_in_quiz
from ..security import rate_limiter, validate_quiz_code, validate_answer, sanitize_text

logger = logging.getLogger(__name__)


def register_game_handlers(sio_manager):

    @sio_manager.on('start_game_signal')
    async def handle_start(sid, data):
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        with database.get_db_session() as db:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if quiz:
                quiz.current_question = 1
                quiz.status = "playing"
                quiz.started_at = datetime.datetime.utcnow()
                db.commit()
                players = get_players_in_quiz(db, quiz.id)
                logger.info("Game started  room=%s  quiz_id=%s  players=%d", room, quiz.id, len(players))
                await sio_manager.emit('game_started', players, room=room)

    @sio_manager.on('send_answer')
    async def handle_answer(sid, data):
        if not rate_limiter.is_allowed(sid):
            logger.warning("Rate limit hit on send_answer  sid=%s", sid)
            return
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        name = data.get('name')
        raw_answer = data.get('answer', '')
        answer = sanitize_text(str(raw_answer)[:50]) if raw_answer else ""
        if not validate_answer(answer):
            logger.warning("Invalid answer rejected  name=%s  room=%s", name, room)
            return
        q_idx = str(data.get('questionIndex'))
        with database.get_db_session() as db:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if not quiz:
                return
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id,
                models.Player.name == name
            ).with_for_update().first()
            if player:
                new_history = dict(player.answers_history or {})
                new_history[q_idx] = answer
                player.answers_history = new_history
                idx = int(q_idx)
                if idx < 1 or idx > len(quiz.questions_data):
                    db.commit()
                    logger.warning("Answer index out of range  name=%s  idx=%s  room=%s", name, q_idx, room)
                    return
                question = quiz.questions_data[idx - 1]
                correct = question["correct"].lower().strip()
                is_correct = answer.lower().strip() == correct
                score_history = dict(player.scores_history or {})
                score_history[q_idx] = 1 if is_correct else 0
                player.scores_history = score_history
                player.score = sum(score_history.values())
                db.commit()
                logger.info(
                    "Answer received  name=%s  room=%s  q=%s  correct=%s  score=%d",
                    name, room, q_idx, is_correct, player.score,
                )
                players_data = get_players_in_quiz(db, player.quiz_id)
                await sio_manager.emit('update_answers', players_data, room=room)

    @sio_manager.on('next_question_signal')
    async def handle_next_question(sid, data):
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        expected_question = data.get('expectedQuestion')
        with database.get_db_session() as db:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()

            if quiz:
                if expected_question is not None and quiz.current_question != expected_question:
                    logger.debug("next_question stale  expected=%s  actual=%s  room=%s", expected_question, quiz.current_question, room)
                    await sio_manager.emit(
                        'move_to_next',
                        {"question": quiz.current_question},
                        room=room
                    )
                    return

                next_q = quiz.current_question + 1
                if next_q > len(quiz.questions_data):
                    return
                quiz.current_question = next_q
                db.commit()
                logger.info("Next question  room=%s  question=%d/%d", room, next_q, len(quiz.questions_data))

                players = get_players_in_quiz(db, quiz.id)
                await sio_manager.emit(
                    'move_to_next',
                    {"question": quiz.current_question},
                    room=room
                )
                await sio_manager.emit(
                    'update_answers',
                    players,
                    room=room
                )

    @sio_manager.on('move_to_step')
    async def handle_move_step(sid, data):
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        with database.get_db_session() as db:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if not quiz:
                return
            players = get_players_in_quiz(db, quiz.id)
            await sio_manager.emit(
                "update_answers",
                players,
                room=room
            )

    @sio_manager.on('override_score')
    async def handle_override(sid, data):
        if not rate_limiter.is_allowed(sid):
            return
        room = data.get('room')
        if not validate_quiz_code(room):
            return
        player_name = data.get('playerName')
        points = data.get('points')
        q_idx = str(data.get('questionIndex'))
        with database.get_db_session() as db:
            player = db.query(models.Player).join(models.Quiz).filter(
                models.Quiz.code == room,
                models.Player.name == player_name
            ).with_for_update().first()

            if player:
                history = dict(player.scores_history or {})
                if points == 1:
                    history[q_idx] = 1
                elif points == -1:
                    history[q_idx] = 0
                player.scores_history = history
                player.score = sum(history.values())
                db.commit()
                logger.info(
                    "Score overridden  player=%s  room=%s  q=%s  points=%s  total=%d",
                    player_name, room, q_idx, points, player.score,
                )
                await sio_manager.emit(
                    'update_answers',
                    get_players_in_quiz(db, player.quiz_id),
                    room=room
                )

    @sio_manager.on("check_answers_before_next")
    async def check_answers(sid, data):
        if not rate_limiter.is_allowed(sid):
            return
        room = data.get("room")
        if not validate_quiz_code(room):
            return
        question = str(data.get("question"))
        with database.get_db_session() as db:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if not quiz:
                return

            players = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id,
                models.Player.is_host == False
            ).all()

            all_answered = True

            for p in players:
                hist = p.answers_history or {}
                if question not in hist:
                    all_answered = False
                    break

            await sio_manager.emit(
                "answers_check_result",
                {"allAnswered": all_answered},
                room=sid
            )
            logger.debug("Check answers  room=%s  q=%s  all_answered=%s", room, question, all_answered)
