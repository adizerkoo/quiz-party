"""Application entrypoint for the Quiz Party backend."""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import fastapi_socketio as socketio

from . import database
from .config import ALLOWED_ORIGINS, FRONTEND_PATH
from .logging_config import bind_log_context, generate_request_id, log_event
from .routes import register_routes
from .sockets import register_socket_handlers


logger = logging.getLogger(__name__)

app = FastAPI()


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Logs every HTTP request with request id, duration and final status."""
    request_id = generate_request_id(request.headers.get("X-Request-ID"))
    started_at = time.perf_counter()
    client_host = request.client.host if request.client else None

    with bind_log_context(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        client=client_host,
    ):
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - started_at) * 1000
            log_event(
                logger,
                logging.ERROR,
                "http.request.failed",
                "HTTP request failed with unexpected exception",
                duration_ms=f"{elapsed_ms:.1f}",
                exc_info=True,
            )
            raise

        elapsed_ms = (time.perf_counter() - started_at) * 1000
        response.headers["X-Request-ID"] = request_id

        level = logging.INFO
        if response.status_code >= 500:
            level = logging.ERROR
        elif response.status_code >= 400:
            level = logging.WARNING

        log_event(
            logger,
            level,
            "http.request.completed",
            "HTTP request completed",
            status_code=response.status_code,
            duration_ms=f"{elapsed_ms:.1f}",
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


@app.on_event("startup")
async def on_startup() -> None:
    log_event(
        logger,
        logging.INFO,
        "app.startup.completed",
        "Application startup complete",
        cors_origins=len(ALLOWED_ORIGINS),
        static_root=str(FRONTEND_PATH),
    )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    log_event(
        logger,
        logging.INFO,
        "app.shutdown.completed",
        "Application shutdown complete",
    )


# Keep the catch-all static mount last so it does not shadow API and socket routes.
app.mount("/", StaticFiles(directory=str(FRONTEND_PATH)), name="static")
