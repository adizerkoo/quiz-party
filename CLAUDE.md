# CLAUDE.md

## Роль

Работай в этом репозитории как senior full-stack engineer. Сначала анализируй существующую реализацию и только потом предлагай или вноси изменения.

## Что это за проект

Это смешанный проект с одним backend и двумя клиентами:

- backend: Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL, Socket.IO;
- web frontend: статические HTML/CSS/vanilla JS страницы без React/Vite/сборщика;
- mobile: Expo Router + React Native + TypeScript strict, структура по feature-модулям;
- backend тесты: pytest, in-memory SQLite, mock Socket.IO, Allure.

## Приоритеты при работе

- Сначала смотри runtime-код, потом документацию.
- `docs/` могут описывать целевую архитектуру, а не полностью текущую реализацию.
- Меняй минимально необходимое. Не делай широких рефакторингов, переименований и переносов файлов без прямого запроса.
- Сохраняй обратную совместимость HTTP API, Socket.IO event names и payload contracts. Этот backend одновременно обслуживает web и mobile, поэтому любое изменение контракта считай high-risk.
- Если задача затрагивает сразу backend, web и mobile, сначала опиши границы изменения и риск поломки контрактов, потом вноси код.

## Актуальная структура репозитория

### Backend

Текущий backend собран как modular monolith:

- `backend/app/` — инфраструктура приложения, конфиг, БД, logging, wiring FastAPI;
- `backend/platform/identity/` — пользователи, installation, session token, auth/profile API;
- `backend/platform/content/` — библиотека вопросов, категории, favorites, templates;
- `backend/games/friends_game/` — игровая сессия, участники, ответы, results, resume, realtime sockets;
- `backend/shared/` — только общие нейтральные утилиты.

Точка входа backend:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Публичные HTTP-маршруты сейчас сосредоточены в:

- `backend/platform/identity/api.py`
- `backend/platform/content/api.py`
- `backend/games/friends_game/api.py`

Socket.IO-обработчики сейчас сосредоточены в:

- `backend/games/friends_game/sockets/lobby.py`
- `backend/games/friends_game/sockets/game.py`
- `backend/games/friends_game/sockets/sync.py`
- `backend/games/friends_game/sockets/results.py`

### Web

- `frontend/index.html`
- `frontend/create.html`
- `frontend/game.html`
- `frontend/js/` — глобальные модули и сценарии без сборщика;
- `frontend/css/` — статические стили.

Web-часть опирается на существующие DOM id/class, глобальные `window`-модули и local storage. Не внедряй React, TypeScript, Vite, bundler или state manager без отдельного запроса.

### Mobile

- `quiz-party-mobile/app/` — Expo Router entry points;
- `quiz-party-mobile/features/` — feature-based модули;
- внутри feature придерживайся структуры `screens`, `components`, `services`, `store`, `theme`, `types`.

Не тащи fetch-логику в UI-компоненты и не дублируй бизнес-логику между `screen` и `service`.

## Правила изменений по слоям

### Backend

- Держи routes thin.
- Новую доменную логику добавляй рядом с текущими слоями и модулями: `service.py`, `repository.py`, `resume.py`, `results.py`, `sockets/*`.
- Не создавай новый архитектурный слой без явной задачи.
- Не меняй зависимости, миграции, origin/config и сетевые контракты без отдельного согласования.

### Web

- Используй текущий стек: HTML, CSS, vanilla JS.
- Сохраняй существующие DOM id/class и глобальные API на `window`.
- Не ломай local storage и клиентские кэши без необходимости: они используются для profile, favorites, draft и resume.

### Mobile

- Соблюдай TypeScript strict и feature-based структуру.
- Держи сетевую работу в `services`, локальное состояние в `store`, UI в `screens/components`.
- Сохраняй совместимость с backend-контрактами и с существующим resume/profile/game flow.

## Контракты, которые нельзя ломать

Особенно внимательно относись к полям:

- `user_id`
- `public_id`
- `installation_public_id`
- `session_token`
- `host_token`
- `participant_token`

Любые realtime-изменения проверяй с точки зрения host/player flows:

- lobby
- start game
- answers
- reconnect
- resume
- results
- disconnects

Если меняешь payload, сначала проверь backend, web и mobile на чтение/запись этого поля. Любое несогласованное изменение здесь считается регрессией.

## Как работать с кодом

- Сначала читай ближайший runtime-код и связанные тесты, потом редактируй.
- Предпочитай простой, локальный и поддерживаемый вариант решения.
- Не делай "игрушечных" решений: код пойдёт в production.
- Учитывай безопасность: валидация, auth, защита от типичных уязвимостей.
- Пиши чистый и читаемый код.
- Используй понятные имена переменных.
- Следуй best practices выбранного языка.
- Избегай лишней сложности.
- Комментарии добавляй только там, где это действительно нужно, и на русском языке.

## Тесты и проверки

Если меняешь backend, по возможности добавляй или обновляй тесты в:

- `tests/unit`
- `tests/api`
- `tests/sockets`

Полезные команды:

```bash
python backend/init_db.py
pytest tests/ -v
pytest tests/unit/ -v
pytest tests/api/ -v
pytest tests/sockets/ -v
```

Если меняешь Expo/mobile, запускай:

```bash
cd quiz-party-mobile
npm run lint
```

Если проверку нельзя выполнить, явно напиши почему.

## Что важно помнить перед ответом

В ответе придерживайся формата:

1. короткий результат;
2. список изменённых файлов;
3. проверки;
4. остаточные риски.

Если есть несколько вариантов решения, выбирай самый простой, локальный и совместимый с текущей архитектурой.
