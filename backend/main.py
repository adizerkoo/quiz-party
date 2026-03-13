import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import fastapi_socketio as socketio
from sqlalchemy.orm import Session

from . import models, schemas, database

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация Socket.IO
sio_manager = socketio.SocketManager(app=app, mount_location='/socket.io', cors_allowed_origins='*')

# Создаем таблицы при запуске
database.init_db()

# Вспомогательная функция для получения списка игроков
def get_players_in_quiz(db: Session, quiz_id: int):
    players = db.query(models.Player).filter(models.Player.quiz_id == quiz_id).all()
    return [
        {
            "name": p.name, 
            "answer": p.last_answer, 
            "is_host": p.is_host, 
            "score": p.score
        } for p in players
    ]

# --- API ENDPOINTS ---

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
        raise HTTPException(status_code=404, detail="Викторина не найдена")
    return quiz

# --- SOCKET.IO EVENTS ---

@sio_manager.on('join_room')
async def handle_join(sid, data):
    room = data.get('room')
    name = data.get('name')
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
                player = models.Player(name=name, sid=sid, quiz_id=quiz.id, is_host=is_host, score=0)
                db.add(player)
            else:
                player.sid = sid
            
            db.commit()
            await sio_manager.emit('update_players', get_players_in_quiz(db, quiz.id), room=room)
    finally:
        db.close()

@sio_manager.on('start_game_signal')
async def handle_start(sid, data):
    await sio_manager.emit('game_started', {}, room=data.get('room'))

@sio_manager.on('send_answer')
async def handle_answer(sid, data):
    room = data.get('room')
    name = data.get('name')
    answer = data.get('answer')
    
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id, 
                models.Player.name == name
            ).first()
            if player:
                player.last_answer = answer
                db.commit()
                await sio_manager.emit('update_answers', get_players_in_quiz(db, quiz.id), room=room)
    finally:
        db.close()

@sio_manager.on('next_question_signal')
async def handle_next_question(sid, data):
    room = data.get('room')
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            db.query(models.Player).filter(models.Player.quiz_id == quiz.id).update({"last_answer": None})
            db.commit()
            await sio_manager.emit('move_to_next', {}, room=room)
            await sio_manager.emit('update_answers', get_players_in_quiz(db, quiz.id), room=room)
    finally:
        db.close()

@sio_manager.on('move_to_step')
async def handle_move_step(sid, data):
    room = data.get('room')
    step = data.get('step')
    await sio_manager.emit('move_to_step', {'step': step}, room=room)

@sio_manager.on('override_score')
async def handle_override(sid, data):
    room = data.get('room')
    player_name = data.get('playerName')
    points = data.get('points')
    
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            player = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id, 
                models.Player.name == player_name
            ).first()
            if player:
                player.score += points
                db.commit()
                await sio_manager.emit('update_answers', get_players_in_quiz(db, quiz.id), room=room)
    finally:
        db.close()

@sio_manager.on('finish_game_signal')
async def handle_finish(sid, data):
    room = data.get('room')
    db = next(database.get_db())
    try:
        quiz = db.query(models.Quiz).filter(models.Quiz.code == room).first()
        if quiz:
            players = db.query(models.Player).filter(
                models.Player.quiz_id == quiz.id, 
                models.Player.is_host == False
            ).order_by(models.Player.score.desc()).all()
            
            results = [{"name": p.name, "score": p.score} for p in players]
            await sio_manager.emit('show_results', {"results": results}, room=room)
    finally:
        db.close()

# --- STATIC FILES ---
frontend_path = os.path.join(os.getcwd(), "frontend")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

app.mount("/", StaticFiles(directory=frontend_path), name="static")