import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import fastapi_socketio as socketio
from sqlalchemy.orm import Session

from . import models, schemas, database
import random

PLAYER_EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵']


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sio_manager = socketio.SocketManager(app=app, mount_location='/socket.io', cors_allowed_origins='*')

database.init_db()

def get_players_in_quiz(db: Session, quiz_id: int):
    players = db.query(models.Player).filter(models.Player.quiz_id == quiz_id).all()
    return [
        {
            "name": p.name,
            "is_host": p.is_host,
            "score": p.score,
            "emoji": p.emoji or "👤",
            "answers_history": p.answers_history or {},
            "scores_history": p.scores_history or {} # Добавляем в выдачу
        } for p in players
    ]

frontend_path = os.path.join(os.getcwd(), "frontend")

app.get("/")
async def read_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

app.mount("/data", StaticFiles(directory="data"), name="data")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.post("/api/quizzes", response_model=schemas.QuizResponse)
def create_quiz(quiz_data: schemas.QuizCreate, db: Session = Depends(database.get_db)):
    new_quiz = models.Quiz(
        title=quiz_data.title,
        code=quiz_data.code,
        questions_data=[q.dict() for q in quiz_data.questions]
    )
    db.add(new_quiz)
    db.commit()
    db.refresh(new_quiz)
    return new_quiz

@app.get("/api/quizzes/{code}")
def get_quiz(code: str, db: Session = Depends(database.get_db)):
    quiz = db.query(models.Quiz).filter(models.Quiz.code == code).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="The quiz was not found")
    return quiz


@sio_manager.on('join_room')
async def handle_join(sid, data):
    room = data.get('room')
    name = str(data.get('name', 'Игрок'))[:15]
    role = data.get('role')
    is_host = (role == 'host')
    
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            await sio_manager.enter_room(sid, room)
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id, 
                models.Player.name == name
            ).first()
            
            if not player:
                used_emojis = [p.emoji for p in db.query(models.Player.emoji).filter(models.Player.quiz_id == quiz.id).all()]
                available_emojis = [e for e in PLAYER_EMOJIS if e not in used_emojis]
                assigned_emoji = random.choice(available_emojis if available_emojis else PLAYER_EMOJIS)
                player = models.Player(
                    name=name, sid=sid, quiz_id=quiz.id, 
                    is_host=is_host, score=0, emoji=assigned_emoji,
                    answers_history={} 
                )
                db.add(player)
            else:
                player.sid = sid
            db.commit()
            await sio_manager.emit('update_players', get_players_in_quiz(db, quiz.id), room=room)
    finally:
        db.close()

@sio_manager.on('start_game_signal')
async def handle_start(sid, data):
    room = data.get('room')
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            quiz.current_step = 0
            db.commit()
            # ОТПРАВЛЯЕМ СПИСОК ИГРОКОВ, а не пустой объект
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
            question = quiz.questions_data[int(q_idx)]
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
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()

        if quiz:
            quiz.current_step += 1
            db.commit()

            players = get_players_in_quiz(db, quiz.id)
            await sio_manager.emit(
                'move_to_next',
                {"step": quiz.current_step},
                room=room
            )
            await sio_manager.emit(
                'update_answers',
                players,
                room=room
            )

    finally:
        db.close()


@sio_manager.on('request_sync')
async def handle_sync(sid, data):
    room = data.get('room')
    name = data.get('name')
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        player = db.query(models.Player).filter(
            models.Player.quiz_id == quiz.id, 
            models.Player.name == name
        ).first()

        if quiz:
            # Проверяем, не финиш ли это
            is_finished = (quiz.current_step == 999)

            await sio_manager.emit('sync_state', {
                "currentStep": quiz.current_step,
                "maxReachedStep": quiz.current_step,
                "isStarted": quiz.current_step >= 0 and not is_finished,
                "isFinished": is_finished, # Передаем этот флаг
                "questions": quiz.questions_data if is_finished else None, # Добавляем вопросы
                "playerAnswer": player.answers_history.get(str(quiz.current_step)) if player and player.answers_history else None,
                "score": player.score if player else 0,
                "emoji": player.emoji if player else "👤"
            }, room=sid)

            if is_finished:
                # ДОБАВЛЯЕМ .filter(models.Player.is_host == False)
                players = db.query(models.Player).filter(
                    models.Player.quiz_id == quiz.id,
                    models.Player.is_host == False
                ).order_by(models.Player.score.desc()).all()
                
                results = [{"name": p.name, "score": p.score, "emoji": p.emoji, "answers": p.answers_history} for p in players]
                await sio_manager.emit('show_results', {
                    "results": results,
                    "questions": quiz.questions_data
                }, room=sid)
            
            # Для хоста на обычном шаге шлем ответы
            elif player and player.is_host:
                players_data = get_players_in_quiz(db, quiz.id)
                await sio_manager.emit('update_answers', players_data, room=sid)
    finally:
        db.close()


@sio_manager.on('move_to_step')
async def handle_move_step(sid, data):
    room = data.get('room')
    step = data.get('step')
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

@sio_manager.on('finish_game_signal')
async def handle_finish(sid, data):
    room = data.get('room')
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            quiz.current_step = 999 
            db.commit()

            players = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id, 
                models.Player.is_host == False
            ).order_by(models.Player.score.desc()).all()
            
            results = [{
                "name": p.name, 
                "score": p.score, 
                "emoji": p.emoji,
                "answers": p.answers_history # Передаем историю ответов для разбора
            } for p in players]

            # Отправляем результаты вместе с данными вопросов
            await sio_manager.emit('show_results', {
                "results": results,
                "questions": quiz.questions_data # Добавляем сами вопросы
            }, room=room)
    finally:
        db.close()

@sio_manager.on("get_update")
async def get_update(sid, room):
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            players = get_players_in_quiz(db, quiz.id)
            await sio_manager.emit(
                "update_answers",
                players,
                room=sid
            )

    finally:
        db.close()

@sio_manager.on("check_answers_before_next")
async def check_answers(sid, data):
    room = data.get("room")
    step = str(data.get("step"))
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
            if step not in hist:
                all_answered = False
                break

        await sio_manager.emit(
            "answers_check_result",
            {"allAnswered": all_answered},
            room=sid
        )

    finally:
        db.close()

frontend_path = os.path.join(os.getcwd(), "frontend")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

app.mount("/", StaticFiles(directory=frontend_path), name="static")