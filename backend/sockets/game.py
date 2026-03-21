import datetime
from .. import models, database
from ..helpers import get_players_in_quiz


def register_game_handlers(sio_manager):

    @sio_manager.on('start_game_signal')
    async def handle_start(sid, data):
        room = data.get('room')
        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            if quiz:
                quiz.current_question = 1
                quiz.status = "playing"
                quiz.started_at = datetime.datetime.utcnow()
                db.commit()
                players = get_players_in_quiz(db, quiz.id)
                await sio_manager.emit('game_started', players, room=room)
        finally:
            db.close()

    @sio_manager.on('send_answer')
    async def handle_answer(sid, data):
        room = data.get('room')
        name = data.get('name')
        raw_answer = data.get('answer', '')
        answer = str(raw_answer)[:50] if raw_answer else ""
        q_idx = str(data.get('questionIndex'))
        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id,
                models.Player.name == name
            ).first()
            if player:
                new_history = dict(player.answers_history or {})
                new_history[q_idx] = answer
                player.answers_history = new_history
                idx = int(q_idx)
                if idx < 1 or idx > len(quiz.questions_data):
                    db.commit()
                    return
                question = quiz.questions_data[idx - 1]
                correct = question["correct"].lower().strip()
                is_correct = answer.lower().strip() == correct
                score_history = dict(player.scores_history or {})
                score_history[q_idx] = 1 if is_correct else 0
                player.scores_history = score_history
                player.score = sum(score_history.values())
                db.commit()
                players_data = get_players_in_quiz(db, player.quiz_id)
                await sio_manager.emit('update_answers', players_data, room=room)
        finally:
            db.close()

    @sio_manager.on('next_question_signal')
    async def handle_next_question(sid, data):
        room = data.get('room')
        expected_question = data.get('expectedQuestion')
        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()

            if quiz:
                if expected_question is not None and quiz.current_question != expected_question:
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
        finally:
            db.close()

    @sio_manager.on('move_to_step')
    async def handle_move_step(sid, data):
        room = data.get('room')
        question = data.get('question')
        db = next(database.get_db())
        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
            players = get_players_in_quiz(db, quiz.id)
            await sio_manager.emit(
                "update_answers",
                players,
                room=room
            )
        finally:
            db.close()

    @sio_manager.on('override_score')
    async def handle_override(sid, data):
        room = data.get('room')
        player_name = data.get('playerName')
        points = data.get('points')
        q_idx = str(data.get('questionIndex'))
        db = next(database.get_db())

        try:
            player = db.query(models.Player).join(models.Quiz).filter(
                models.Quiz.code == room,
                models.Player.name == player_name
            ).first()

            if player:
                history = dict(player.scores_history or {})
                current = history.get(q_idx, 0)
                if points == 1:
                    history[q_idx] = 1
                elif points == -1:
                    history[q_idx] = 0
                player.scores_history = history
                player.score = sum(history.values())
                db.commit()
                await sio_manager.emit(
                    'update_answers',
                    get_players_in_quiz(db, player.quiz_id),
                    room=room
                )
        finally:
            db.close()

    @sio_manager.on("check_answers_before_next")
    async def check_answers(sid, data):
        room = data.get("room")
        question = str(data.get("question"))
        db = next(database.get_db())

        try:
            quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()

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
        finally:
            db.close()
