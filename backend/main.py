from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import fastapi_socketio as socketio # Нужно установить: pip install fastapi-socketio
from sqlalchemy.orm import Session
from . import models, schemas, database
import os

app = FastAPI()

# Настройка Socket.IO
sio = socketio.SocketManager(app=app, cors_allowed_origins='*')

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()

# --- API Эндпоинты ---
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
    if not quiz: raise HTTPException(status_code=404, detail="Not found")
    return quiz

# --- СОБЫТИЯ SOCKET.IO (Синхронизация) ---

@app.sio.on('join_room')
async def handle_join(sid, data):
    room = data['room']
    app.sio.enter_room(sid, room)
    print(f"Игрок {sid} вошел в комнату {room}")

@app.sio.on('next_question_signal')
async def handle_next_question(sid, data):
    room = data['room']
    # Рассылаем всем в комнате сигнал "переключить вопрос"
    await app.sio.emit('move_to_next', {}, room=room)

# --- РАЗДАЧА ФРОНТЕНДА ---
frontend_path = os.path.join(os.getcwd(), "frontend")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

app.mount("/", StaticFiles(directory=frontend_path), name="static")