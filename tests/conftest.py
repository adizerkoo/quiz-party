"""
Общие фикстуры для всех тестов Quiz Party.

Предоставляет in-memory SQLite базу, TestClient FastAPI и фабрики
для создания тестовых данных (викторины, игроки, вопросы).
"""

import os
from pathlib import Path

# ── Устанавливаем фиктивный DATABASE_URL до импорта backend ──────────
# database.py создаёт engine при импорте, поэтому нужен валидный postgresql:// URL,
# чтобы модуль загрузился. Реального подключения в тестах не будет.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_quiz")
_TEST_LOG_DIR = Path(__file__).resolve().parent / "logs"
os.environ["LOG_DIR"] = str(_TEST_LOG_DIR)

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.database import Base, get_db, load_model_modules
from backend.games.friends_game.models import Player, Quiz
from backend.games.friends_game.runtime_state import connection_registry

# ── Мокаем init_db ДО импорта main (он вызывает init_db на уровне модуля) ──
import backend.app.database as _db_module

_original_init_db = _db_module.init_db
_db_module.init_db = lambda: None  # no-op при импорте main

# Теперь безопасно импортировать main, init_db не попытается подключиться к PG.
import backend.app.main as _main_module  # noqa: E402

_app = _main_module.app

# Восстанавливаем оригинал и подгружаем ORM-модули для metadata.
_db_module.init_db = _original_init_db
load_model_modules()


# ── In-memory SQLite engine (один экземпляр, shared между потоками) ──
@pytest.fixture(scope="session")
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture()
def db_session(engine):
    """Изолированная сессия БД, таблицы пересоздаются для чистоты."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    yield session

    session.close()


@pytest.fixture(autouse=True)
def clear_runtime_registry():
    connection_registry._sid_to_connection.clear()
    connection_registry._participant_to_sid.clear()
    connection_registry._quiz_to_participants.clear()
    yield
    connection_registry._sid_to_connection.clear()
    connection_registry._participant_to_sid.clear()
    connection_registry._quiz_to_participants.clear()


# ── FastAPI TestClient с подменой БД ─────────────────────────────────
@pytest.fixture()
def client(db_session):
    """HTTP-клиент для тестирования API маршрутов."""
    from fastapi.testclient import TestClient

    def _override_get_db():
        yield db_session

    _app.dependency_overrides[get_db] = _override_get_db
    with TestClient(_app) as c:
        yield c
    _app.dependency_overrides.clear()


# ── Фабрики тестовых данных ──────────────────────────────────────────
SAMPLE_QUESTIONS = [
    {
        "text": "Столица Франции?",
        "type": "options",
        "correct": "Париж",
        "options": ["Лондон", "Берлин", "Париж", "Мадрид"],
    },
    {
        "text": "2 + 2 = ?",
        "type": "text",
        "correct": "4",
        "options": None,
    },
    {
        "text": "Самая большая планета?",
        "type": "options",
        "correct": "Юпитер",
        "options": ["Марс", "Юпитер", "Сатурн"],
    },
]


@pytest.fixture()
def sample_quiz(db_session) -> Quiz:
    """Готовая викторина в статусе waiting."""
    quiz = Quiz(
        title="Тестовая викторина",
        code="PARTY-TEST1",
        questions_data=SAMPLE_QUESTIONS,
        total_questions=len(SAMPLE_QUESTIONS),
        current_question=0,
        status="waiting",
    )
    db_session.add(quiz)
    db_session.commit()
    db_session.refresh(quiz)
    return quiz


@pytest.fixture()
def sample_host(db_session, sample_quiz) -> Player:
    """Хост, подключённый к тестовой викторине."""
    host = Player(
        name="Ведущий",
        sid="host-sid-001",
        quiz_id=sample_quiz.id,
        is_host=True,
        score=0,
        emoji="🐶",
        answers_history={},
        scores_history={},
    )
    db_session.add(host)
    db_session.commit()
    db_session.refresh(host)
    connection_registry.bind(host.sid, host.id, sample_quiz.id)
    return host


@pytest.fixture()
def sample_player(db_session, sample_quiz) -> Player:
    """Обычный игрок, подключённый к тестовой викторине."""
    player = Player(
        name="Игрок1",
        sid="player-sid-001",
        quiz_id=sample_quiz.id,
        is_host=False,
        score=0,
        emoji="🐱",
        answers_history={},
        scores_history={},
    )
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)
    connection_registry.bind(player.sid, player.id, sample_quiz.id)
    return player


@pytest.fixture()
def playing_quiz(db_session, sample_quiz, sample_host, sample_player) -> Quiz:
    """Викторина в статусе playing с хостом и игроком."""
    sample_quiz.status = "playing"
    sample_quiz.current_question = 1
    db_session.commit()
    db_session.refresh(sample_quiz)
    return sample_quiz


@pytest.fixture()
def finished_quiz(db_session, sample_quiz, sample_host, sample_player) -> Quiz:
    """Завершённая викторина с ответами и очками."""
    sample_player.answers_history = {"1": "Париж", "2": "4", "3": "Юпитер"}
    sample_player.scores_history = {"1": 1, "2": 1, "3": 1}
    sample_player.score = 3
    sample_player.final_rank = 1
    sample_quiz.status = "finished"
    sample_quiz.current_question = 3
    db_session.commit()
    db_session.refresh(sample_quiz)
    return sample_quiz
