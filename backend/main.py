import logging
import time

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import fastapi_socketio as socketio

from .config import ALLOWED_ORIGINS, FRONTEND_PATH
from . import database
from .routes import register_routes
from .sockets import register_socket_handlers

logger = logging.getLogger(__name__)

app = FastAPI()

# ── Request logging middleware ────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
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

sio_manager = socketio.SocketManager(app=app, mount_location='/socket.io', cors_allowed_origins=ALLOWED_ORIGINS)

database.init_db()

register_routes(app)
register_socket_handlers(sio_manager)

# Catch-all static mount (должен быть последним)
app.mount("/", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

logger.info("Application startup complete")