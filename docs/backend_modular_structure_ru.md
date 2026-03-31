# Backend: модульная структура

## Кратко

Backend остаётся единым FastAPI-приложением, но доменные границы стали строже:

- `backend/app/` — только инфраструктура;
- `backend/platform/` — общие платформенные домены;
- `backend/games/friends_game/` — вся логика текущей игры с друзьями;
- `backend/shared/` — только универсальные утилиты;
- `backend/alembic/` — миграции.

## Текущая карта ответственности

### `backend/app/`

- `main.py` — сборка приложения и wiring.
- `config.py` — конфигурация.
- `database.py` — engine, `Base`, сессии, загрузка моделей.
- `logging_config.py` — логирование.
- `dependencies.py` — общие dependency aliases.

### `backend/platform/identity/`

- пользователи;
- installations;
- session token;
- auth / identity checks;
- profile API.

### `backend/platform/content/`

- question categories;
- question bank;
- favorites;
- quiz templates;
- template questions/options как общий контентный слой.

### `backend/games/friends_game/`

- game sessions;
- participants;
- answers;
- score adjustments;
- session events;
- results;
- resume;
- realtime sockets;
- `runtime_state.py` для online-state и rate limit текущей игры;
- `cache.py` для локального кэша текущих игровых сессий.

### `backend/shared/`

- `utils.py`

Без бизнес-логики конкретной игры или платформы.

## Точки входа

Приложение:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port <PORT>
```

Ручная инициализация БД:

```bash
python backend/init_db.py
```

## Что это даёт

- `app/` больше не содержит game-specific runtime state;
- `friends_game` стал ещё автономнее;
- `shared/` перестал быть складом доменных заготовок;
- будущие игры можно добавлять в `games/` без зависимости от внутренностей `friends_game`.
