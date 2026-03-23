# 🧪 Quiz Party — Автотесты

## Структура

```
tests/
├── conftest.py              # Общие фикстуры (БД, TestClient, фабрики)
├── pytest.ini               # Конфигурация pytest
├── requirements.txt         # Зависимости тестов
│
├── unit/                    # Unit-тесты (без сети, без внешних сервисов)
│   ├── test_models.py       # ORM-модели Quiz, Player
│   ├── test_cache.py        # In-memory кэш викторин
│   ├── test_security.py     # RateLimiter, валидация, санитизация
│   ├── test_schemas.py      # Pydantic-схемы
│   └── test_helpers.py      # Вспомогательные функции БД
│
├── api/                     # Интеграционные тесты HTTP API
│   ├── test_health.py       # GET /api/health
│   ├── test_quizzes.py      # POST/GET /api/v1/quizzes
│   └── test_results.py      # GET /api/v1/quizzes/{code}/results
│
└── sockets/                 # Тесты Socket.IO событий
    ├── test_lobby.py        # join_room, disconnect, kick_player
    ├── test_game.py         # start_game, send_answer, next_question, override
    ├── test_sync.py         # request_sync, get_update
    └── test_results.py      # finish_game_signal
```

## Установка

```bash
pip install -r tests/requirements.txt
```

## Запуск

```bash
# Все тесты
pytest tests/ -v

# Только unit-тесты
pytest tests/unit/ -v

# Только API-тесты
pytest tests/api/ -v

# Только Socket-тесты
pytest tests/sockets/ -v

# С покрытием (нужен pytest-cov)
pytest tests/ -v --cov=backend --cov-report=term-missing
```

## Принципы

- **In-memory SQLite** — тесты не требуют PostgreSQL, БД создаётся в памяти
- **Изоляция** — каждый тест откатывает транзакцию, кэш очищается
- **Mock Socket.IO** — сокет-обработчики тестируются через mock sio_manager
- **FastAPI TestClient** — HTTP API тестируется через встроенный клиент
- **Фикстуры** — фабрики для quiz, host, player, playing/finished состояний
