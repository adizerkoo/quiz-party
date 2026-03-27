"""Точка входа backend-приложения Quiz Party."""

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import fastapi_socketio as socketio

from . import database
from .config import ALLOWED_ORIGINS, FRONTEND_PATH
from .routes import register_routes
from .sockets import register_socket_handlers

logger = logging.getLogger(__name__)

app = FastAPI()


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Логирует каждый HTTP-запрос вместе с длительностью его обработки."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s %s %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

sio_manager = socketio.SocketManager(
    app=app,
    mount_location="/socket.io",
    cors_allowed_origins=ALLOWED_ORIGINS,
)

database.init_db()
register_routes(app)
register_socket_handlers(sio_manager)

# Catch-all static mount держим последним, чтобы не перекрыть API и socket routes.
app.mount("/", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

logger.info("Application startup complete")
