# Backend Quiz Party

## Цель

Backend собран как модульный монолит с жёсткими границами:

- `backend/app/` содержит только инфраструктуру приложения;
- `backend/platform/` содержит общие платформенные домены;
- `backend/games/friends_game/` содержит всю логику текущей игры с друзьями;
- `backend/shared/` содержит только универсальные утилиты без доменной логики.

## Актуальная структура

```text
backend/
  __init__.py
  .env
  .env.example
  alembic.ini
  requirements.txt
  init_db.py

  alembic/
    versions/

  app/
    __init__.py
    main.py
    config.py
    database.py
    dependencies.py
    logging_config.py

  platform/
    analytics/
      __init__.py
    content/
      __init__.py
      api.py
      models.py
      repository.py
      schemas.py
      service.py
    economy/
      __init__.py
    identity/
      __init__.py
      api.py
      models.py
      repository.py
      schemas.py
      service.py

  games/
    friends_game/
      __init__.py
      api.py
      cache.py
      models.py
      repository.py
      results.py
      resume.py
      runtime_state.py
      schemas.py
      service.py
      sockets/
        __init__.py
        game.py
        lobby.py
        results.py
        sync.py

  shared/
    __init__.py
    utils.py
```

## Границы модулей

### `backend/app`

Инфраструктура приложения:

- сборка FastAPI и wiring;
- конфигурация;
- SQLAlchemy engine, session factory и загрузка ORM-моделей;
- логирование;
- общие dependency aliases.

Точка входа runtime:

- `backend.app.main:app`

CLI-инициализация БД:

- `backend/init_db.py`

### `backend/platform/identity`

Общий домен идентификации:

- `User`, `UserInstallation`;
- session token;
- auth dependencies;
- profile API;
- привязка installation к пользователю и устройству.

### `backend/platform/content`

Общий контентный слой:

- категории библиотеки вопросов;
- банк вопросов и варианты ответа;
- favorites;
- шаблоны викторин;
- snapshot-вопросы шаблона.

### `backend/games/friends_game`

Автономный модуль текущей игры:

- игровые сессии;
- участники;
- ответы;
- корректировки очков;
- session events;
- results;
- resume;
- realtime sockets;
- локальный runtime state текущей игры;
- локальный in-memory cache текущей игры.

### `backend/shared`

Только маленькие универсальные элементы:

- нейтральные утилиты вроде времени, UUID и нормализации строк;
- без enum-ов и exception-ов, если у них нет реального междоменного применения.

## Принцип размещения кода

- Если логика использует термины `quiz`, `room`, `participant`, `host`, `player`, она по умолчанию должна жить в `games/friends_game/`.
- Если логика относится к пользователю, installation или auth, она живёт в `platform/identity/`.
- Если логика относится к библиотеке вопросов и шаблонам, она живёт в `platform/content/`.
- В `shared/` поднимается только то, что реально используется несколькими доменами уже сейчас.

## Что было дополнительно очищено

Из `backend/app/` вынесены в `backend/games/friends_game/`:

- `runtime_state.py`
- `cache.py`

Из `backend/shared/` удалены:

- `enums.py`
- `exceptions.py`

Причина: эти файлы либо уже были привязаны к текущей игре, либо вообще не имели реального использования и только размывали границы модулей.

## Wiring приложения

HTTP routes подключаются из:

- `backend.platform.identity.api`
- `backend.platform.content.api`
- `backend.games.friends_game.api`

Socket.IO handlers подключаются из:

- `backend.games.friends_game.sockets`

Entry point:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port <PORT>
```

## Остаточный техдолг

- `platform/analytics` и `platform/economy` пока остаются пустыми точками расширения.
- При появлении второй реальной игры общие элементы нужно будет выделять по факту повторного использования, а не заранее.
