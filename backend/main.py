import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import fastapi_socketio as socketio

from .config import ALLOWED_ORIGINS, FRONTEND_PATH
from . import database
from .routes import register_routes
from .sockets import register_socket_handlers

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

sio_manager = socketio.SocketManager(app=app, mount_location='/socket.io', cors_allowed_origins=ALLOWED_ORIGINS)

database.init_db()

# Регистрируем HTTP-роуты и Socket.IO обработчики
register_routes(app)
register_socket_handlers(sio_manager)

# Catch-all static mount (должен быть последним)
frontend_path = os.path.join(os.getcwd(), "frontend")

@app.get("/")
async def read_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

app.mount("/", StaticFiles(directory=frontend_path), name="static")