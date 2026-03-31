"""Точка сборки FastAPI-приложения и общего wiring backend."""

from __future__ import annotations

import logging
import time

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import fastapi_socketio as socketio
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app import database
from backend.app.config import ALLOWED_ORIGINS, DATA_PATH, FRONTEND_PATH
from backend.app.logging_config import bind_log_context, generate_request_id, log_event
from backend.games.friends_game.api import register_friends_game_routes
from backend.games.friends_game.sockets import register_socket_handlers
from backend.platform.content.api import register_content_routes
from backend.platform.identity.api import register_identity_routes


logger = logging.getLogger(__name__)


def register_routes(app: FastAPI) -> None:
    """Регистрирует инфраструктурные, платформенные и игровые HTTP-маршруты."""

    @app.get("/")
    async def read_index():
        """Возвращает главную HTML-страницу web-клиента."""
        return FileResponse(FRONTEND_PATH / "index.html")

    @app.get("/api/health")
    async def health(db: Session = Depends(database.get_db)):
        """Проверяет доступность backend и подключение к базе данных."""
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ok"}
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "http.health.failed",
                "Health check failed because the database is unavailable",
                exc_info=True,
            )
            raise HTTPException(status_code=503, detail="Database unavailable")

    app.mount("/data", StaticFiles(directory=str(DATA_PATH)), name="data")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

    register_identity_routes(app)
    register_content_routes(app)
    register_friends_game_routes(app)


def create_app() -> FastAPI:
    """Создаёт и настраивает экземпляр FastAPI-приложения."""
    app = FastAPI()

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        """Логирует каждый HTTP-запрос с request id, длительностью и статусом."""
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
        allow_methods=["*"],
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
        """Пишет лог о завершении старта приложения."""
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
        """Пишет лог о завершении остановки приложения."""
        log_event(
            logger,
            logging.INFO,
            "app.shutdown.completed",
            "Application shutdown complete",
        )

    app.mount("/", StaticFiles(directory=str(FRONTEND_PATH)), name="static")
    return app


app = create_app()
