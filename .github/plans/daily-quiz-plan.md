# Plan: «Квиз дня» — полная реализация

## Контекст

Изолированный режим «Квиз дня» + экономический фундамент + админка.
Переиспользуем ТОЛЬКО `users` + `user_installations`. Всё остальное — новые таблицы, модули, экраны.
Вопросы могут содержать **изображения** и **аудио** (URL на медиа-файлы).
Подход **TDD**: сначала тест, потом реализация.

## Прогресс

Отмечай `[x]` после завершения шага. Не переходи к следующему шагу, пока текущий не отмечен.

---

## Фаза 1: Модели БД

### Шаг 1.1 — Модели daily_challenge (вопросы, challenge, runtime)
- [ ] Создать `backend/games/daily_challenge/__init__.py`
- [ ] Создать `backend/games/daily_challenge/models.py` с моделями:

**`DailyQuestion`** (таблица `daily_questions`):
- id (Integer PK), public_id (String(36) UNIQUE), text (String(500) NOT NULL)
- kind (String(20) CHECK 'text'|'options'), correct_answer_text (String(200) NOT NULL)
- difficulty (SmallInteger default 1, CHECK 1-3), explanation (Text nullable)
- image_url (Text nullable) — URL картинки к вопросу
- audio_url (Text nullable) — URL аудио к вопросу
- question_metadata (JSON default {}), is_active (Boolean default True)
- created_at (DateTime), updated_at (DateTime onupdate)

**`DailyQuestionOption`** (таблица `daily_question_options`):
- id, public_id, question_id FK → daily_questions.id (cascade), position (Integer 1+)
- option_text (String(200)), is_correct (Boolean)
- image_url (Text nullable) — URL картинки варианта ответа
- UNIQUE(question_id, position)

**`DailyQuestionTag`** (таблица `daily_question_tags`):
- id, public_id, slug (String(64) UNIQUE), title (String(128))
- tag_type (String(32) CHECK 'topic'|'event'|'holiday'|'seasonal')
- is_active (Boolean default True), created_at

**`DailyQuestionTagLink`** (таблица `daily_question_tag_links`):
- id, question_id FK, tag_id FK, UNIQUE(question_id, tag_id)

**`ChallengeDefinition`** (таблица `challenge_definitions`):
- id, public_id, mode_type (String(16) CHECK 'daily'|'topic'), slug, title (String(256))
- subtitle, description (Text), difficulty (SmallInteger default 1)
- state (String(16) CHECK 'draft'|'scheduled'|'active'|'archived')
- total_questions, question_time_limit_sec (Integer default 15)
- ruleset_jsonb (JSON default {}), reward_profile_jsonb (JSON default {})
- primary_tag_id FK → daily_question_tags.id (nullable)
- start_at, end_at, created_by_user_id FK → users.id (nullable)
- created_at, updated_at

**`ChallengeDefinitionQuestion`** (таблица `challenge_definition_questions`):
- id, challenge_definition_id FK, question_id FK → daily_questions.id
- position (SmallInteger 1+), points (Integer default 100 CHECK >= 0)
- UNIQUE(challenge_definition_id, position)

**`DailySchedule`** (таблица `daily_schedule`):
- id, challenge_definition_id FK, calendar_date (Date)
- timezone_name (String(64) default 'Europe/Moscow')
- theme_label (String(256)), featured_art_url (Text nullable)
- announcement_text (Text nullable), created_at
- UNIQUE(calendar_date, timezone_name)

**`ChallengeRun`** (таблица `challenge_runs`):
- id, public_id, challenge_definition_id FK, user_id FK → users.id
- installation_id FK → user_installations.id (nullable)
- run_kind (String(16) CHECK 'rated'|'practice')
- status (String(16) CHECK 'active'|'completed'|'failed'|'abandoned'|'expired')
- current_question_position (SmallInteger default 1)
- lives_left (SmallInteger nullable — для будущего topic mode)
- base_score (Integer default 0), bonus_score (Integer default 0)
- penalty_score (Integer default 0), final_score (Integer default 0)
- correct_answers (SmallInteger default 0), wrong_answers (SmallInteger default 0)
- total_time_ms (Integer default 0), used_powerups_count (SmallInteger default 0)
- streak_current (SmallInteger default 0), streak_best (SmallInteger default 0)
- started_at, completed_at (nullable), run_metadata (JSON default {})
- Индексы: (challenge_definition_id, status), (user_id, challenge_definition_id), (challenge_definition_id, final_score DESC)

**`ChallengeRunAnswer`** (таблица `challenge_run_answers`):
- id, run_id FK → challenge_runs.id (cascade), question_id FK → daily_questions.id
- question_position (SmallInteger), selected_option_id FK → daily_question_options.id (nullable)
- answer_text (String(500) nullable), submitted_at, response_time_ms (Integer)
- is_correct (Boolean), base_points (Integer default 0), speed_bonus (Integer default 0)
- streak_bonus (Integer default 0), penalty_points (Integer default 0)
- powerup_usage_id FK → challenge_powerup_usages.id (nullable)
- answer_metadata (JSON default {})

**`ChallengePowerupUsage`** (таблица `challenge_powerup_usages`):
- id, run_id FK → challenge_runs.id (cascade), question_position (SmallInteger)
- powerup_slug (String(32)), price_currency (String(8) nullable), price_amount (Integer nullable)
- competitive_penalty (Integer default 0), effect_payload (JSON default {}), used_at

**`DailyLeaderboardEntry`** (таблица `daily_leaderboard_entries`):
- id, challenge_definition_id FK, user_id FK → users.id
- run_id FK → challenge_runs.id, rank (Integer), final_score (Integer)
- total_time_ms (Integer), correct_answers (SmallInteger), wrong_answers (SmallInteger)
- completed_at, reward_status (String(16) CHECK 'pending'|'granted'|'skipped' default 'pending')
- reward_amount (Integer default 0), reward_granted_at (nullable)
- UNIQUE(challenge_definition_id, user_id)

Все модели наследуют Base, используют generate_public_id(), utc_now_naive(), relationships.

### Шаг 1.2 — Модели economy
- [ ] Создать `backend/platform/economy/__init__.py`
- [ ] Создать `backend/platform/economy/models.py`:

**`WalletAccount`** (таблица `wallet_accounts`):
- id, user_id FK → users.id (UNIQUE), soft_balance (Integer default 0)
- hard_balance (Integer default 0), updated_at

**`WalletTransaction`** (таблица `wallet_transactions`):
- id, public_id (UNIQUE), user_id FK → users.id
- currency_type (String(8) CHECK 'soft'|'hard'), direction (String(8) CHECK 'credit'|'debit')
- amount (Integer CHECK > 0), source_type (String(40)), source_ref_id (String(64) nullable)
- balance_after (Integer), created_at, transaction_metadata (JSON default {})
- Индекс: UNIQUE(source_type, source_ref_id) WHERE source_ref_id IS NOT NULL — идемпотентность

**`RewardedAdEvent`** (таблица `rewarded_ad_events`):
- id, public_id, user_id FK, installation_id FK (nullable)
- placement (String(32)), ad_network (String(32) nullable)
- external_reward_id (String(128) UNIQUE), status CHECK 'started'|'completed'|'validated'|'granted'|'rejected'
- reward_currency (String(8)), reward_amount (Integer)
- created_at, validated_at, granted_at, ad_metadata (JSON default {})

### Шаг 1.3 — Модели analytics
- [ ] Создать `backend/platform/analytics/__init__.py`
- [ ] Создать `backend/platform/analytics/models.py`:

**`AppEvent`** (таблица `app_events`):
- id (BigInteger PK), event_name (String(64) NOT NULL)
- user_id (nullable), installation_id (nullable), mode_type (String(16) nullable)
- challenge_definition_id (nullable), run_id (nullable), question_id (nullable)
- source_screen (String(32) nullable), occurred_at, event_payload (JSON default {})
- Индексы: (event_name, occurred_at), (user_id, occurred_at)

### Шаг 1.4 — Регистрация моделей в database.py
- [ ] В `backend/app/database.py` → `load_model_modules()` добавить:
  - `import backend.games.daily_challenge.models`
  - `import backend.platform.economy.models`
  - `import backend.platform.analytics.models`

### Шаг 1.5 — Миграция Alembic
- [ ] Создать `backend/alembic/versions/20260401_000007_add_daily_challenge_and_economy.py`
- [ ] Defensive-паттерн: `inspector.has_table()` перед каждым `op.create_table()`
- [ ] Проверка: `alembic upgrade head` без ошибок

---

## Фаза 2: Scoring + Economy (TDD)

### Шаг 2.1 — Тесты scoring (RED)
- [ ] Создать `tests/test_daily_challenge/__init__.py`
- [ ] Создать `tests/test_daily_challenge/conftest.py` — фикстуры: sample_daily_question, sample_challenge, sample_run, sample_user_with_wallet. Переиспользовать engine/db_session из корневого conftest
- [ ] Создать `tests/test_daily_challenge/test_scoring.py`:
  - test_base_points_correct → 100
  - test_base_points_incorrect → 0
  - test_speed_bonus_fast_answer → 50 при мгновенном ответе
  - test_speed_bonus_slow_answer → 0 при > 80% лимита
  - test_speed_bonus_medium_answer → пропорционально
  - test_streak_bonus_values → 10, 20, 30, 40, 50 (cap)
  - test_streak_bonus_cap_at_50 → streak=10 всё равно 50
  - test_competitive_penalty_values → каждый powerup свой штраф
  - test_calculate_answer_score_combines_all → итоговый расчёт

### Шаг 2.2 — Реализация scoring (GREEN)
- [ ] Создать `backend/games/daily_challenge/scoring.py`:
  - `calculate_base_points(question_points, is_correct) → int`
  - `calculate_speed_bonus(response_time_ms, time_limit_ms) → int` — max 50
  - `calculate_streak_bonus(streak_count) → int` — streak * 10, max 50
  - `get_competitive_penalty(powerup_slug) → int` — dict lookup
  - `calculate_answer_score(*, is_correct, question_points, response_time_ms, time_limit_ms, streak_count, active_penalties) → AnswerScoreResult` (dataclass)
- [ ] Все тесты `test_scoring.py` проходят (GREEN)

### Шаг 2.3 — Тесты economy wallet (RED)
- [ ] Создать `tests/test_economy/__init__.py`
- [ ] Создать `tests/test_economy/test_wallet.py`:
  - test_ensure_wallet_creates_new → новый кошелёк с balance=0
  - test_ensure_wallet_returns_existing → idempotent
  - test_credit_increases_balance → +100 coins
  - test_credit_creates_ledger_entry → wallet_transactions записана
  - test_credit_idempotent_by_ref → повторный credit с тем же source_type+ref игнорируется
  - test_debit_decreases_balance → -50 coins
  - test_debit_insufficient_balance_raises → HTTPException 402
  - test_debit_creates_ledger_entry → запись со direction=debit
  - test_get_balance → корректный {soft: N, hard: 0}
  - test_multiple_transactions_balance_correct → несколько credit+debit

### Шаг 2.4 — Economy schemas
- [ ] Создать `backend/platform/economy/schemas.py`:
  - WalletResponse, TransactionResponse, TransactionsListResponse
  - AdRewardRequest, AdRewardResponse

### Шаг 2.5 — Economy repository
- [ ] Создать `backend/platform/economy/repository.py`:
  - `get_or_create_wallet(db, user_id)`
  - `get_transactions(db, user_id, limit, offset)`
  - `find_transaction_by_ref(db, source_type, source_ref_id)`

### Шаг 2.6 — Economy service (GREEN)
- [ ] Создать `backend/platform/economy/service.py`:
  - `ensure_wallet(db, user_id) → WalletAccount`
  - `credit(db, user_id, amount, currency, source_type, source_ref_id, metadata) → WalletTransaction` — idempotent
  - `debit(db, user_id, amount, currency, source_type, source_ref_id, metadata) → WalletTransaction` — check balance
  - `get_balance(db, user_id) → dict`
  - `process_ad_reward(db, user_id, installation_id, placement, external_reward_id, ad_network) → RewardedAdEvent`
- [ ] Все тесты `test_wallet.py` проходят (GREEN)

### Шаг 2.7 — Economy API
- [ ] Создать `backend/platform/economy/api.py`:
  - `register_economy_routes(app)`
  - GET `/api/v1/economy/wallet` — auth required
  - GET `/api/v1/economy/transactions` — auth required, query limit/offset
  - POST `/api/v1/economy/ad-reward` — auth required

---

## Фаза 3: Analytics

### Шаг 3.1 — Analytics service
- [ ] Создать `backend/platform/analytics/service.py`:
  - `log_app_event(db, event_name, **kwargs)` — fire-and-forget запись AppEvent

---

## Фаза 4: Daily Challenge — backend бизнес-логика (TDD)

### Шаг 4.1 — Daily challenge schemas
- [ ] Создать `backend/games/daily_challenge/schemas.py`:
  - DailyQuizInfoResponse — title, theme_label, total_questions, time_limit_sec, deadline, top_players[], user_has_played, user_best_score
  - StartRunRequest — run_kind: Literal['rated','practice']
  - StartRunResponse — run_public_id, first_question: QuestionPayload
  - QuestionPayload — position, text, kind, options[{public_id, text, image_url}], time_limit_sec, total_questions, image_url (nullable), audio_url (nullable)
  - SubmitAnswerRequest — answer_text (nullable), selected_option_public_id (nullable), response_time_ms
  - SubmitAnswerResponse — is_correct, correct_answer_text, base_points, speed_bonus, streak_bonus, penalty_points, total_score, streak_current, explanation, next_question (nullable)
  - CompleteRunResponse — final_score, correct_answers, wrong_answers, total_time_ms, rank, total_players, reward_coins, answers_breakdown[]
  - AnswerBreakdown — position, question_text, user_answer, correct_answer, is_correct, base_points, speed_bonus, streak_bonus, penalty_points, response_time_ms
  - LeaderboardResponse — entries[], user_entry (nullable)
  - LeaderboardEntry — rank, username, emoji, score, time_ms, correct_answers
  - UsePowerupRequest — powerup_slug, question_position
  - UsePowerupResponse — success, effect (dict), penalty, wallet_balance

### Шаг 4.2 — Daily challenge repository
- [ ] Создать `backend/games/daily_challenge/repository.py`:
  - `get_challenge_by_date(db, date, tz)` — join daily_schedule → challenge_definitions
  - `get_challenge_questions(db, challenge_id)` — ordered by position, eager load question + options
  - `get_rated_run_for_user(db, user_id, challenge_id)` — completed/active rated run
  - `get_run_by_public_id(db, run_public_id)` — eager load answers, powerup_usages
  - `get_run_question_at_position(db, challenge_id, position)` — (DailyQuestion, points)
  - `get_leaderboard_entries(db, challenge_id, limit, offset)`
  - `get_user_leaderboard_entry(db, challenge_id, user_id)`
  - `count_leaderboard_entries(db, challenge_id)`

### Шаг 4.3 — Тесты service (RED)
- [ ] Создать `tests/test_daily_challenge/test_service.py`:
  - test_get_today_challenge_returns_active → находит challenge по дате
  - test_get_today_challenge_no_schedule → None
  - test_can_user_play_rated_first_time → True
  - test_can_user_play_rated_already_played → False
  - test_start_run_rated_creates_run → ChallengeRun с status=active
  - test_start_run_rated_returns_first_question → QuestionPayload position=1
  - test_start_run_rated_twice_rejects → HTTPException 409
  - test_start_run_practice_after_rated → succeeds
  - test_submit_answer_correct → is_correct=True, score увеличился
  - test_submit_answer_incorrect → is_correct=False, streak сброшен
  - test_submit_answer_updates_streak → 1, 2, 3...
  - test_submit_answer_returns_next_question → position+1
  - test_submit_answer_last_question_auto_completes → status=completed
  - test_submit_answer_time_exceeded_rejected → response_time > limit + buffer → error
  - test_submit_answer_with_image_question → image_url в QuestionPayload
  - test_submit_answer_with_audio_question → audio_url в QuestionPayload
  - test_complete_run_calculates_final_score → correct final_score
  - test_complete_run_updates_leaderboard → DailyLeaderboardEntry created
  - test_complete_run_grants_reward → wallet credited

### Шаг 4.4 — Daily challenge service (GREEN)
- [ ] Создать `backend/games/daily_challenge/service.py`:
  - `get_today_challenge(db)` — date.today() в Europe/Moscow → repository
  - `can_user_play_rated(db, user_id, challenge_id)` → bool
  - `start_run(db, user, installation, challenge, run_kind)` → (ChallengeRun, QuestionPayload)
  - `get_current_question_payload(db, challenge_id, position)` → QuestionPayload | None (включает image_url, audio_url)
  - `submit_answer(db, run, answer_data)` → SubmitAnswerResponse — валидация времени (≤ limit + 2000ms), scoring, запись answer, update run, next question
  - `complete_run(db, run)` → CompleteRunResponse — финализация, leaderboard, reward
  - `apply_powerup(db, run, slug, position, user_id)` → UsePowerupResponse
  - `_apply_50_50_effect(question)`, `_apply_extra_time_effect()`, `_apply_shield_effect()`, `_apply_skip_effect(run)`
- [ ] Все тесты `test_service.py` проходят (GREEN)

### Шаг 4.5 — Тесты leaderboard (RED)
- [ ] Создать `tests/test_daily_challenge/test_leaderboard.py`:
  - test_update_leaderboard_entry_creates → новая запись
  - test_update_leaderboard_entry_updates_if_better → лучший score заменяет
  - test_recompute_ranks_dense → (100, 100, 80) → ranks (1, 1, 2)
  - test_recompute_ranks_tiebreaker → same score → меньше ошибок выше
  - test_grant_daily_rewards_top1 → 500 coins
  - test_grant_daily_rewards_top3 → 300 coins
  - test_grant_daily_rewards_participation → 25 coins
  - test_grant_daily_rewards_idempotent → повторный вызов не дублирует

### Шаг 4.6 — Leaderboard service (GREEN)
- [ ] Создать `backend/games/daily_challenge/leaderboard.py`:
  - `update_leaderboard_entry(db, challenge_id, run)` — upsert
  - `recompute_ranks(db, challenge_id)` — dense ranking: score DESC, wrong_answers ASC, total_time_ms ASC, completed_at ASC
  - `grant_daily_rewards(db, challenge_id)` — top-1→500, top-3→300, top-10→150, top-25%→75, участие→25 через economy.credit()
- [ ] Все тесты `test_leaderboard.py` проходят (GREEN)

### Шаг 4.7 — Тесты powerup (RED)
- [ ] Создать `tests/test_daily_challenge/test_powerup.py`:
  - test_apply_50_50_removes_two_wrong_options → effect.removed_option_ids (len=2, all incorrect)
  - test_apply_powerup_deducts_coins → wallet balance decreased
  - test_apply_powerup_insufficient_balance → HTTPException 402
  - test_apply_powerup_records_usage → ChallengePowerupUsage created
  - test_apply_powerup_adds_penalty → penalty_score increased on run
  - test_apply_shield_marks_active → effect.shield_active = true
  - test_apply_skip_advances_position → run.current_question_position increased
  - test_apply_extra_time → effect.extra_time_sec = 5

### Шаг 4.8 — Powerup logic (GREEN — уже в service.py)
- [ ] Все тесты `test_powerup.py` проходят (GREEN)

---

## Фаза 5: Daily Challenge — HTTP API (TDD)

### Шаг 5.1 — Тесты API (RED)
- [ ] Создать `tests/test_daily_challenge/test_api.py`:
  - test_get_daily_today_returns_info → 200 с DailyQuizInfoResponse
  - test_get_daily_today_no_quiz → 200 с null/empty
  - test_start_run_unauthorized → 401
  - test_start_run_rated_success → 200 с run_public_id + first_question
  - test_start_run_rated_duplicate → 409
  - test_submit_answer_success → 200 с is_correct + next_question
  - test_submit_answer_wrong_user → 403
  - test_complete_run_success → 200 с final results
  - test_get_leaderboard → 200 с entries
  - test_powerup_success → 200 с effect
  - test_powerup_no_money → 402
  - test_question_with_media → image_url и audio_url в ответе

### Шаг 5.2 — Daily challenge API (GREEN)
- [ ] Создать `backend/games/daily_challenge/api.py`:
  - `register_daily_challenge_routes(app)` — по паттерну friends_game
  - GET `/api/v1/daily/today` — auth optional
  - POST `/api/v1/daily/runs` — auth required
  - POST `/api/v1/daily/runs/{run_public_id}/answer` — auth required, проверка ownership
  - POST `/api/v1/daily/runs/{run_public_id}/powerup` — auth required
  - POST `/api/v1/daily/runs/{run_public_id}/complete` — auth required
  - GET `/api/v1/daily/leaderboard` — auth optional, query date
- [ ] Все тесты `test_api.py` проходят (GREEN)

---

## Фаза 6: Интеграция backend + seed

### Шаг 6.1 — Регистрация routes в main.py
- [ ] В `backend/app/main.py` → `register_routes()`:
  - import и вызов `register_daily_challenge_routes(app)`
  - import и вызов `register_economy_routes(app)`

### Шаг 6.2 — Seed данные
- [ ] Создать `backend/games/daily_challenge/seed.py`:
  - `seed_daily_challenge(db, calendar_date, title, theme_label, questions_data)` — создать вопросы, challenge, schedule
  - `seed_sample_daily(db)` — тестовый challenge на сегодня, 10 вопросов "День программиста" (2-3 с image_url)
- [ ] Добавить опциональный вызов в init_db() по env `SEED_DAILY=true`

### Шаг 6.3 — E2E проверка backend
- [ ] `alembic upgrade head` — успех
- [ ] `pytest tests/test_daily_challenge/ tests/test_economy/ -v` — все тесты GREEN
- [ ] Ручная проверка: seed → GET /daily/today → POST /runs → POST answer ×N → POST complete → GET leaderboard

---

## Фаза 7: Админка (Web)

### Шаг 7.1 — Admin API — авторизация
- [ ] Создать `backend/platform/admin/__init__.py`
- [ ] Создать `backend/platform/admin/auth.py`:
  - `get_admin_user(authorization)` — проверка Bearer token из env `ADMIN_API_KEY`
  - Dependency для FastAPI

### Шаг 7.2 — Admin API — управление вопросами (TDD)
- [ ] Создать `tests/test_admin/test_questions.py` (RED):
  - test_create_question_text → 201
  - test_create_question_options → 201 с вариантами
  - test_create_question_with_image → 201 с image_url
  - test_create_question_with_audio → 201 с audio_url
  - test_list_questions → 200 с пагинацией
  - test_update_question → 200
  - test_delete_question → 204
  - test_admin_unauthorized → 401
- [ ] Создать `backend/platform/admin/schemas.py`:
  - AdminQuestionCreate, AdminQuestionUpdate, AdminQuestionResponse
  - AdminQuestionOptionPayload — text, is_correct, image_url
  - AdminQuestionsListResponse — items[], total, page
- [ ] Создать `backend/platform/admin/api_questions.py` (GREEN):
  - POST `/api/v1/admin/questions` — создать вопрос
  - GET `/api/v1/admin/questions` — список с фильтрами (tag, difficulty, search)
  - GET `/api/v1/admin/questions/{id}` — один вопрос
  - PUT `/api/v1/admin/questions/{id}` — обновить
  - DELETE `/api/v1/admin/questions/{id}` — удалить (soft: is_active=false)
- [ ] Тесты `test_questions.py` проходят (GREEN)

### Шаг 7.3 — Admin API — управление тегами
- [ ] Создать `backend/platform/admin/api_tags.py`:
  - POST `/api/v1/admin/tags` — создать тег
  - GET `/api/v1/admin/tags` — список
  - PUT `/api/v1/admin/tags/{id}` — обновить
  - DELETE `/api/v1/admin/tags/{id}` — удалить

### Шаг 7.4 — Admin API — управление daily schedule (TDD)
- [ ] Создать `tests/test_admin/test_schedule.py` (RED):
  - test_create_daily_schedule → 201 challenge + schedule + questions привязаны
  - test_create_daily_schedule_duplicate_date → 409
  - test_list_schedule → 200 с календарём
  - test_get_schedule_detail → 200 с вопросами
  - test_update_schedule → 200
- [ ] Создать `backend/platform/admin/api_schedule.py` (GREEN):
  - POST `/api/v1/admin/daily/schedule` — создать challenge_definition + daily_schedule + привязать question_ids
  - GET `/api/v1/admin/daily/schedule` — список (фильтр по date range)
  - GET `/api/v1/admin/daily/schedule/{id}` — детали с вопросами
  - PUT `/api/v1/admin/daily/schedule/{id}` — обновить
- [ ] Тесты `test_schedule.py` проходят (GREEN)

### Шаг 7.5 — Admin API — статистика
- [ ] Создать `backend/platform/admin/api_stats.py`:
  - GET `/api/v1/admin/stats/daily` — query date_from/date_to: DAU, avg_score, completion_rate, powerup_usage
  - GET `/api/v1/admin/stats/daily/{date}` — детали дня: total_players, score_distribution, question_accuracy[], top_players
  - GET `/api/v1/admin/stats/economy` — total_coins_earned, total_coins_spent, avg_balance, ad_revenue_events

### Шаг 7.6 — Регистрация admin routes
- [ ] Создать `backend/platform/admin/api.py` — `register_admin_routes(app)` собирает все admin sub-routers
- [ ] Добавить `import backend.platform.admin` в database.py load_model_modules() (если есть новые модели)
- [ ] В `main.py` → `register_routes()` добавить `register_admin_routes(app)`

### Шаг 7.7 — Admin web-интерфейс: структура
- [ ] Создать `frontend/admin/index.html` — SPA-shell: sidebar навигация (Вопросы, Расписание, Статистика)
- [ ] Создать `frontend/admin/css/admin.css` — стили админки
- [ ] Создать `frontend/admin/js/admin-app.js` — роутер, общие утилиты, API клиент с ADMIN_API_KEY header
- [ ] В `main.py` добавить mount `/admin` → `StaticFiles(directory=FRONTEND_PATH / "admin")`
- [ ] В `main.py` добавить route `GET /admin` → FileResponse("admin/index.html")

### Шаг 7.8 — Admin web: страница «Вопросы»
- [ ] Создать `frontend/admin/js/admin-questions.js`:
  - Список вопросов с пагинацией и поиском
  - Форма создания/редактирования: text, kind, correct_answer, options[], difficulty, tags[], image_url, audio_url
  - Preview картинки и аудио в форме
  - Удаление (soft delete)

### Шаг 7.9 — Admin web: страница «Расписание»
- [ ] Создать `frontend/admin/js/admin-schedule.js`:
  - Календарь на месяц с отмеченными днями
  - Форма создания daily: title, theme_label, date, выбор вопросов (drag-drop или checkbox)
  - Preview создаваемого квиза

### Шаг 7.10 — Admin web: страница «Статистика»
- [ ] Создать `frontend/admin/js/admin-stats.js`:
  - Dashboard: DAU график, avg_score, completion_rate
  - Детали по дням: таблица с фильтром
  - Экономика: coins earned/spent, ad events

### Шаг 7.11 — Admin web: загрузка медиа
- [ ] Создать `backend/platform/admin/api_media.py`:
  - POST `/api/v1/admin/media/upload` — принять файл (image/audio), сохранить в `data/media/`, вернуть URL
  - Валидация: max 5MB, только image (jpg/png/webp/gif) и audio (mp3/ogg/m4a)
  - Защита: admin auth required
- [ ] Обновить `main.py`: mount `/data/media` если нужно (уже есть `/data` mount)
- [ ] В admin форме вопроса — кнопка загрузки файла с preview

---

## Фаза 8: Mobile — feature daily-quiz

### Шаг 8.1 — Types и theme
- [ ] Создать `quiz-party-mobile/features/daily-quiz/types.ts`:
  ```
  DailyQuizInfo, DailyQuestion (с image_url, audio_url), DailyQuestionOption (с image_url),
  AnswerResult, RunResult, LeaderboardEntry, AnswerBreakdown,
  PowerupSlug, PowerupEffect, WalletBalance,
  DailyScreenState = 'loading'|'info'|'playing'|'answer_shown'|'result'|'leaderboard'|'already_played'
  ```
- [ ] Создать `quiz-party-mobile/features/daily-quiz/theme/daily-theme.ts` — цвета, стили

### Шаг 8.2 — API-клиент
- [ ] Создать `quiz-party-mobile/features/daily-quiz/services/daily-api.ts`:
  - fetchDailyInfo() → GET /api/v1/daily/today
  - startDailyRun(runKind) → POST /api/v1/daily/runs
  - submitDailyAnswer(runPublicId, answer) → POST /api/v1/daily/runs/{id}/answer
  - usePowerup(runPublicId, slug, position) → POST /api/v1/daily/runs/{id}/powerup
  - completeDailyRun(runPublicId) → POST /api/v1/daily/runs/{id}/complete
  - fetchLeaderboard(date?) → GET /api/v1/daily/leaderboard
  - fetchWalletBalance() → GET /api/v1/economy/wallet
  - Все через fetchWithMenuProfileAuth()

### Шаг 8.3 — Store и persistence
- [ ] Создать `quiz-party-mobile/features/daily-quiz/store/daily-run-state.ts` — FileSystem cache: active run (resume при crash)
- [ ] Создать `quiz-party-mobile/features/daily-quiz/services/daily-storage.ts` — persistence последнего результата

### Шаг 8.4 — Controller hook
- [ ] Создать `quiz-party-mobile/features/daily-quiz/hooks/use-daily-quiz-controller.ts`:
  - State machine: loading → info → playing ⇄ answer_shown → result → leaderboard | already_played
  - Таймер (auto-submit при истечении)
  - Powerup flow
  - Загрузка и показ image/audio в вопросах
  - Обработка ошибок сети

### Шаг 8.5 — UI компоненты (часть 1: info + question)
- [ ] `daily-info-card.tsx` — тема дня, дедлайн (countdown), top-3, кнопка «Начать» / «Тренировка»
- [ ] `daily-question-card.tsx` — текст, номер (3/10), image/audio если есть, варианты, таймер
- [ ] `daily-option-button.tsx` — кнопка варианта с анимацией correct/incorrect, поддержка image_url
- [ ] `daily-timer.tsx` — animated countdown circle (react-native-reanimated)

### Шаг 8.6 — UI компоненты (часть 2: result + leaderboard)
- [ ] `daily-answer-result.tsx` — ✓/✗ + очки breakdown + explanation
- [ ] `daily-score-bar.tsx` — текущий счёт + streak badge
- [ ] `daily-run-result.tsx` — итоги: счёт, место, награда coins, breakdown список
- [ ] `daily-leaderboard.tsx` — ScrollView с рейтингом, текущий юзер выделен, top-3 медальки

### Шаг 8.7 — UI компоненты (часть 3: powerups + media)
- [ ] `daily-powerup-bar.tsx` — панель с 5 бонусами и ценами, disable если нет денег
- [ ] `daily-background.tsx` — фон экрана
- [ ] `daily-media-player.tsx` — компонент для показа image (Image) и проигрывания audio (expo-av)

### Шаг 8.8 — Главный экран
- [ ] Создать `quiz-party-mobile/features/daily-quiz/screens/native-daily-quiz-screen.tsx` — рендерит компоненты по state machine
- [ ] Создать `quiz-party-mobile/features/daily-quiz/index.ts` — export NativeDailyQuizScreen

### Шаг 8.9 — Навигация и интеграция в меню
- [ ] Создать `quiz-party-mobile/app/daily-quiz.tsx` — route файл
- [ ] Обновить `quiz-party-mobile/app/_layout.tsx` — добавить Screen name="daily-quiz"
- [ ] Обновить `quiz-party-mobile/features/menu/screens/native-menu-screen.tsx`:
  - Добавить карточку «Квиз дня» с иконкой и описанием
  - Показать баланс coins (fetchWalletBalance)
  - Навигация router.push('/daily-quiz')

### Шаг 8.10 — Expo-av для аудио
- [ ] Добавить `expo-av` в package.json (если не установлен)
- [ ] Проверить: `cd quiz-party-mobile && npm install`
- [ ] Проверить: `npm run lint` — без ошибок

---

## Фаза 9: Финальная интеграция и проверка

### Шаг 9.1 — Полная проверка backend
- [ ] `pytest tests/ -v` — ВСЕ тесты проходят (и старые, и новые)
- [ ] `alembic upgrade head` — миграция чистая

### Шаг 9.2 — Полная проверка mobile
- [ ] `cd quiz-party-mobile && npm run lint` — без ошибок
- [ ] Ручной flow: Меню → Квиз дня → Info → Начать → 10 вопросов (с таймером, картинками) → Результат → Лидерборд
- [ ] Повторный вход → «Уже играли» → Тренировочный режим
- [ ] Powerup → coins списаны → эффект применён

### Шаг 9.3 — Проверка админки
- [ ] Admin: Создать вопрос с картинкой → Создать quiz дня → Проверить на mobile

---

## Правила выполнения

1. **Один шаг за раз.** Не забегай вперёд.
2. **TDD где указано**: сначала тест (RED), потом код (GREEN). Тесты и реализация могут быть в одном шаге, если так указано.
3. **Перед кодом** прочти существующие файлы рядом (паттерны, импорты, стили).
4. **После кода** проверь (pytest / lint), отметь `[x]`.
5. **Паттерны** копируй из friends_game (models, api), identity (auth), content (schemas).
6. **Не трогай** friends_game, content, identity (кроме случаев, указанных в плане).
7. **Античит**: вопросы по одному с сервера, response_time_ms ≤ limit + 2000ms.
8. **Идемпотентность**: wallet by (source_type, source_ref_id), ad by external_reward_id.
9. **Медиа**: image_url и audio_url — это URL-строки. Загрузка файлов через admin API → сохранение в `data/media/`.
10. **Admin web**: vanilla HTML/CSS/JS (аналогично frontend/), без React/Vite.

## Ключевые решения

- Из существующей БД только `users` + `user_installations`
- Ledger экономика: `wallet_transactions` = источник правды
- `challenge_runs`/`challenge_run_answers` — универсальные (и для будущего topic mode)
- `challenge_definitions` с `mode_type` — одна таблица для daily и topic
- Бонусы со штрафом к рейтинговому счёту
- Вопросы поддерживают image_url + audio_url
- Admin — web-панель на vanilla JS с auth через ADMIN_API_KEY
