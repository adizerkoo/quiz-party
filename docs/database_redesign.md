# База данных Quiz Party

## Коротко о главном

Сейчас у проекта один рабочий слой данных:

- `users`
- `user_installations`
- `quiz_templates`
- `quiz_questions`
- `quiz_question_options`
- `game_sessions`
- `session_participants`
- `participant_answers`
- `score_adjustments`
- `session_events`

Legacy-таблицы `quizzes` и `players` остаются в БД как архив, но runtime их больше не использует.

## Главные правила новой схемы

### 1. Пользователь и участник игры - это разные сущности

- `users` хранит стабильный профиль пользователя.
- `session_participants` хранит участие этого пользователя в конкретной игре.

Это важно, потому что один и тот же человек может сыграть много разных игр, а в каждой игре у него своя отдельная participant-запись.

### 2. Хост - это роль, а не имя

В `session_participants`:

- `name` - реальный nickname человека
- `role` - техническая роль: `host` или `player`

То есть:

- в БД больше не нужно хранить `HOST` как имя
- надпись `HOST` или `Ведущий` интерфейс рисует сам по `role`

Если старый клиент все еще пришлет `"HOST"`, backend старается заменить это на реальное имя хоста из профиля.

### 3. Победители определяются только через `final_rank`

Поле `game_sessions.winner_id` удалено.

Источник истины теперь один:

- победители игры - это участники, у которых `session_participants.final_rank = 1`

Это позволяет корректно хранить ничьи:

- если 2 лидера, у обоих `final_rank = 1`
- если 3 лидера, у всех троих `final_rank = 1`

### 4. После завершения игры сокеты закрываются

Когда игра завершается:

- в БД пишется `game_sessions.status = 'finished'`
- участникам выставляются итоговые `final_rank`
- сохраняется `results_snapshot`
- всем активным клиентам отправляется `show_results`
- затем активные socket-соединения закрываются

То есть после финала клиенты переходят в read-only режим, а итоговый экран уже можно спокойно строить из БД.

## Таблицы и их смысл

### `users`

Постоянный профиль пользователя.

Основные поля:

- `id` - внутренний PK
- `public_id` - внешний идентификатор
- `username`
- `avatar_emoji`
- `created_at`
- `updated_at`
- `last_login_at`

Важно:

- `username` не является identity
- дубли username допустимы
- identity строится через `id` и `public_id`

### `user_installations`

Слой между пользователем и конкретным клиентом/устройством.

Основные поля:

- `public_id`
- `user_id`
- `platform`
- `device_family`
- `device_brand`
- `device_model`
- `browser`
- `browser_version`
- `app_version`
- `last_seen_at`

Зачем это нужно:

- один пользователь может заходить с Web, Android, iPhone
- reconnect удобнее и надежнее привязывать к installation
- mobile остается first-class клиентом

### `quiz_templates`

Шаблон викторины.

Хранит:

- `owner_id`
- `title`
- `total_questions`

Один шаблон можно запускать много раз через разные `game_sessions`.

### `quiz_questions`

Вопросы шаблона.

Хранит:

- `template_id`
- `position`
- `text`
- `kind`
- `correct_answer_text`
- `points`

### `quiz_question_options`

Варианты ответа для вопросов типа `options`.

Хранит:

- `question_id`
- `position`
- `option_text`
- `is_correct`

### `game_sessions`

Один конкретный запуск викторины.

Хранит:

- `code`
- `template_id`
- `owner_id`
- `status`
- `total_questions`
- `current_question`
- `host_secret_hash`
- `host_left_at`
- `created_at`
- `started_at`
- `finished_at`
- `results_snapshot`

Что важно понимать:

- здесь больше нет `winner_id`
- победителей ищем через `session_participants.final_rank`
- `results_snapshot` нужен как frozen snapshot итогов

### `session_participants`

Участник конкретной игровой сессии.

Хранит:

- `quiz_id`
- `user_id`
- `installation_id`
- `name`
- `role`
- `emoji`
- `score`
- `final_rank`
- `status`
- `joined_at`
- `last_seen_at`
- `disconnected_at`
- `kicked_at`
- `reconnect_token_hash`

Ключевая идея:

- `users` отвечает на вопрос "кто это?"
- `session_participants` отвечает на вопрос "как именно этот человек участвовал в этой игре?"

### `participant_answers`

Каждый ответ участника на каждый вопрос.

Хранит:

- `participant_id`
- `quiz_id`
- `question_id`
- `question_position`
- `answer_text`
- `selected_option_id`
- `submitted_at`
- `answer_time_seconds`
- `is_correct`
- `awarded_points`
- `evaluation_status`

Теперь аналитика делается SQL-запросами, а не разбором больших JSON blob.

### `score_adjustments`

Ручные корректировки очков.

Хранит:

- `quiz_id`
- `participant_id`
- `answer_id`
- `question_id`
- `created_by_participant_id`
- `adjustment_type`
- `points_delta`
- `reason_code`
- `reason_text`
- `created_at`

Используется для:

- ручных поправок от хоста
- бонусов и штрафов
- аудита изменений счета

### `session_events`

События игровой сессии.

Это аналитический и диагностический слой.

Примеры событий:

- создание сессии
- вход участника
- reconnect
- старт игры
- завершение игры
- kick

Для `game_finished` событие хранит `winner_ids`, а не один `winner_id`.

## Как теперь работает профиль на native

На native профиль живет в двух местах:

1. локально в persistent storage
2. на backend в `users` и `user_installations`

Поведение:

- при создании профиля app сразу пытается сохранить его в БД
- при редактировании профиля app тоже сразу пытается обновить его в БД
- если сети нет, профиль сохраняется локально и помечается как pending
- повторная отправка идет:
  - при следующем входе в приложение
  - при следующем изменении профиля
  - перед созданием квиза, если сеть уже появилась

Это дает нормальную offline-first модель без потери identity.

## Как теперь работают результаты

### Ранги

В `session_participants` есть поле:

- `final_rank INT NULL`

Оно заполняется при завершении игры.

Правила:

- сортировка идет по `score DESC`
- при одинаковом score участники получают одинаковый ранг
- используется dense ranking

Пример:

- очки: `10, 10, 7, 4`
- ранги: `1, 1, 2, 3`

### Итоговый экран

Итоговый экран можно строить только из БД.

После финала в БД уже есть:

- `game_sessions.status = 'finished'`
- `session_participants.score`
- `session_participants.final_rank`
- `participant_answers`
- правильные ответы из `quiz_questions`
- `results_snapshot`

Практический вывод:

- socket нужен только как realtime-сигнал "игра закончилась"
- сами результаты можно брать через `GET /api/v1/quizzes/{code}/results`

## Что теперь легко делать

### История игр пользователя

Основа запроса:

- `users`
- `session_participants`
- `game_sessions`
- `quiz_templates`

Можно получить:

- во что играл пользователь
- какие места занимал
- сколько очков набирал
- какие квизы создавал как хост

### Leaderboard

Теперь можно считать:

- количество побед
- количество попаданий в top-3
- средний score
- частоту ничьих

### Аналитика по вопросам

Теперь легко посчитать:

- какие вопросы чаще всего ошибают
- среднее время ответа
- процент правильных ответов
- какие варианты чаще выбирают

## Индексы и ограничения

Самые важные идеи:

- публичные идентификаторы вынесены в `public_id`
- все основные связи покрыты FK
- для поиска победителей есть индекс:
  - `session_participants (quiz_id, final_rank)`

Важные ограничения:

- уникальный `game_sessions.code`
- уникальность имени участника внутри одной сессии
- уникальность позиции вопроса внутри шаблона
- уникальность ответа участника на один вопрос
- `final_rank IS NULL OR final_rank >= 1`

## Что считается legacy

Legacy-таблицы:

- `quizzes`
- `players`

Текущее правило проекта:

- не использовать их как runtime-слой
- не переносить из них данные автоматически
- воспринимать их как архив, пока не будет отдельного решения на удаление

## Резюме

Сейчас модель данных устроена так:

- `users` - постоянный профиль
- `user_installations` - устройство/клиент
- `quiz_templates` - что за викторина
- `game_sessions` - конкретный запуск
- `session_participants` - кто участвовал в этом запуске
- `participant_answers` - как именно отвечали
- `score_adjustments` - где менялись очки
- `session_events` - что происходило по ходу игры

Самые важные текущие правила:

- имя хоста хранится как реальный nickname
- роль хоста определяется через `role = 'host'`
- победители определяются только через `final_rank`
- после финала сокеты закрываются
- итоговый экран можно строить из БД без живого socket-соединения
