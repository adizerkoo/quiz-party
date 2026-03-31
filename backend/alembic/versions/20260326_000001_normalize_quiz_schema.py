"""Normalize quiz/session/player storage.

Revision ID: 20260326_000001
Revises:
Create Date: 2026-03-26 22:30:00
"""

from __future__ import annotations

import json
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "20260326_000001"
down_revision = None
branch_labels = None
depends_on = None


def _json_value(value, default):
    """Безопасно преобразует JSON/JSONB/строку в Python-объект с fallback-значением."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def _now_value(row, *keys):
    """Берёт первое непустое временное поле из строки legacy-таблицы."""
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return None


def _create_table_if_missing(inspector, table_name: str, factory):
    """Создаёт таблицу только если её ещё нет в текущей схеме БД."""
    if not inspector.has_table(table_name):
        factory()


def _add_columns_if_missing(inspector, table_name: str, columns: list[tuple[str, sa.Column]]) -> None:
    """Добавляет отсутствующие колонки в уже существующую таблицу."""
    if not inspector.has_table(table_name):
        return

    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    missing_columns = [(name, column) for name, column in columns if name not in existing_columns]
    if not missing_columns:
        return

    with op.batch_alter_table(table_name) as batch_op:
        for _, column in missing_columns:
            batch_op.add_column(column)


def upgrade() -> None:
    """Раскладывает legacy схему на нормализованные таблицы и переносит старые данные."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("users"):
        # Сначала мягко расширяем существующую таблицу users до новой модели identity.
        _add_columns_if_missing(
            inspector,
            "users",
            [
                ("public_id", sa.Column("public_id", sa.String(length=36), nullable=True)),
                ("device_platform", sa.Column("device_platform", sa.String(length=20), nullable=True)),
                ("device_brand", sa.Column("device_brand", sa.String(length=50), nullable=True)),
                ("updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True)),
                (
                    "profile_metadata",
                    sa.Column("profile_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
                ),
            ],
        )

        inspector = sa.inspect(bind)
        user_indexes = {index["name"] for index in inspector.get_indexes("users")}
        if "ix_users_public_id" not in user_indexes:
            op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)

        users_table = sa.table(
            "users",
            sa.column("id", sa.Integer),
            sa.column("public_id", sa.String),
            sa.column("created_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        )
        for user_row in bind.execute(sa.select(users_table)).mappings():
            updates = {}
            if not user_row["public_id"]:
                updates["public_id"] = str(uuid4())
            if user_row["updated_at"] is None:
                updates["updated_at"] = user_row["created_at"]
            if updates:
                bind.execute(
                    sa.update(users_table)
                    .where(users_table.c.id == user_row["id"])
                    .values(**updates)
                )
    else:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("username", sa.String(length=15), nullable=False),
            sa.Column("avatar_emoji", sa.String(length=16), nullable=False),
            sa.Column("device_platform", sa.String(length=20), nullable=True),
            sa.Column("device_brand", sa.String(length=50), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("last_login_at", sa.DateTime(), nullable=False),
            sa.Column("profile_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        )
        op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)

    inspector = sa.inspect(bind)

    # Далее создаём новый нормализованный слой сущностей, если таблиц ещё нет.
    _create_table_if_missing(
        inspector,
        "user_installations",
        lambda: op.create_table(
            "user_installations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("client_installation_key", sa.String(length=80), nullable=True),
            sa.Column("platform", sa.String(length=20), nullable=False, server_default="unknown"),
            sa.Column("device_family", sa.String(length=20), nullable=True),
            sa.Column("device_brand", sa.String(length=50), nullable=True),
            sa.Column("device_model", sa.String(length=120), nullable=True),
            sa.Column("browser", sa.String(length=40), nullable=True),
            sa.Column("browser_version", sa.String(length=20), nullable=True),
            sa.Column("app_version", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("installation_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        ),
    )
    _create_table_if_missing(
        inspector,
        "quiz_templates",
        lambda: op.create_table(
            "quiz_templates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("title", sa.String(length=100), nullable=False),
            sa.Column("total_questions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("template_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        ),
    )
    _create_table_if_missing(
        inspector,
        "quiz_questions",
        lambda: op.create_table(
            "quiz_questions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("quiz_templates.id"), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("text", sa.String(length=500), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("correct_answer_text", sa.String(length=200), nullable=False),
            sa.Column("points", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("explanation", sa.Text(), nullable=True),
            sa.Column("question_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.UniqueConstraint("template_id", "position", name="uq_quiz_questions_template_position"),
        ),
    )
    _create_table_if_missing(
        inspector,
        "quiz_question_options",
        lambda: op.create_table(
            "quiz_question_options",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("quiz_questions.id"), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("option_text", sa.String(length=200), nullable=False),
            sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.UniqueConstraint("question_id", "position", name="uq_quiz_question_options_position"),
        ),
    )
    _create_table_if_missing(
        inspector,
        "game_sessions",
        lambda: op.create_table(
            "game_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("code", sa.String(length=20), nullable=False),
            sa.Column("title", sa.String(length=100), nullable=False),
            sa.Column("template_id", sa.Integer(), sa.ForeignKey("quiz_templates.id"), nullable=False),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("total_questions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("current_question", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("host_secret_hash", sa.String(length=128), nullable=True),
            sa.Column("host_left_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("session_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("results_snapshot", sa.JSON(), nullable=True),
        ),
    )
    _create_table_if_missing(
        inspector,
        "session_participants",
        lambda: op.create_table(
            "session_participants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=40), nullable=False),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("emoji", sa.String(length=16), nullable=True),
            sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("joined_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("disconnected_at", sa.DateTime(), nullable=True),
            sa.Column("kicked_at", sa.DateTime(), nullable=True),
            sa.Column("reconnect_token_hash", sa.String(length=128), nullable=True),
            sa.Column("device", sa.String(length=20), nullable=True),
            sa.Column("browser", sa.String(length=40), nullable=True),
            sa.Column("browser_version", sa.String(length=20), nullable=True),
            sa.Column("device_model", sa.String(length=120), nullable=True),
            sa.Column("participant_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("installation_id", sa.Integer(), sa.ForeignKey("user_installations.id"), nullable=True),
            sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("game_sessions.id"), nullable=False),
            sa.UniqueConstraint("quiz_id", "name", name="uq_session_participants_quiz_name"),
        ),
    )
    _add_columns_if_missing(
        inspector,
        "session_participants",
        [
            ("device", sa.Column("device", sa.String(length=20), nullable=True)),
            ("browser", sa.Column("browser", sa.String(length=40), nullable=True)),
            ("browser_version", sa.Column("browser_version", sa.String(length=20), nullable=True)),
            ("device_model", sa.Column("device_model", sa.String(length=120), nullable=True)),
            (
                "participant_metadata",
                sa.Column("participant_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            ),
        ],
    )
    _create_table_if_missing(
        inspector,
        "participant_answers",
        lambda: op.create_table(
            "participant_answers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("participant_id", sa.Integer(), sa.ForeignKey("session_participants.id"), nullable=False),
            sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("game_sessions.id"), nullable=False),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("quiz_questions.id"), nullable=False),
            sa.Column("selected_option_id", sa.Integer(), sa.ForeignKey("quiz_question_options.id"), nullable=True),
            sa.Column("question_position", sa.Integer(), nullable=False),
            sa.Column("answer_text", sa.String(length=500), nullable=True),
            sa.Column("submitted_at", sa.DateTime(), nullable=False),
            sa.Column("answer_time_seconds", sa.Float(), nullable=True),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("awarded_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("evaluation_status", sa.String(length=20), nullable=False, server_default="auto"),
            sa.Column("answer_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.UniqueConstraint("participant_id", "question_id", name="uq_participant_answers_once"),
        ),
    )
    _create_table_if_missing(
        inspector,
        "score_adjustments",
        lambda: op.create_table(
            "score_adjustments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("game_sessions.id"), nullable=False),
            sa.Column("participant_id", sa.Integer(), sa.ForeignKey("session_participants.id"), nullable=False),
            sa.Column("answer_id", sa.Integer(), sa.ForeignKey("participant_answers.id"), nullable=True),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("quiz_questions.id"), nullable=True),
            sa.Column("created_by_participant_id", sa.Integer(), sa.ForeignKey("session_participants.id"), nullable=True),
            sa.Column("adjustment_type", sa.String(length=20), nullable=False),
            sa.Column("points_delta", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("reason_code", sa.String(length=40), nullable=True),
            sa.Column("reason_text", sa.String(length=200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("adjustment_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        ),
    )
    _create_table_if_missing(
        inspector,
        "session_events",
        lambda: op.create_table(
            "session_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("game_sessions.id"), nullable=False),
            sa.Column("participant_id", sa.Integer(), sa.ForeignKey("session_participants.id"), nullable=True),
            sa.Column("installation_id", sa.Integer(), sa.ForeignKey("user_installations.id"), nullable=True),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("quiz_questions.id"), nullable=True),
            sa.Column("event_type", sa.String(length=40), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("event_payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        ),
    )

    # Legacy `quizzes` / `players` больше не считаются рабочим источником истины.
    # По текущей стратегии мы оставляем их как архивные таблицы и не переносим
    # из них данные автоматически в новую схему.
    return

    # Backfill existing users and legacy quizzes/players.
    users_table = sa.Table("users", sa.MetaData(), autoload_with=bind)
    installations_table = sa.Table("user_installations", sa.MetaData(), autoload_with=bind)
    templates_table = sa.Table("quiz_templates", sa.MetaData(), autoload_with=bind)
    questions_table = sa.Table("quiz_questions", sa.MetaData(), autoload_with=bind)
    options_table = sa.Table("quiz_question_options", sa.MetaData(), autoload_with=bind)
    sessions_table = sa.Table("game_sessions", sa.MetaData(), autoload_with=bind)
    participants_table = sa.Table("session_participants", sa.MetaData(), autoload_with=bind)
    answers_table = sa.Table("participant_answers", sa.MetaData(), autoload_with=bind)
    adjustments_table = sa.Table("score_adjustments", sa.MetaData(), autoload_with=bind)
    events_table = sa.Table("session_events", sa.MetaData(), autoload_with=bind)

    if inspector.has_table("quizzes") and inspector.has_table("players"):
        legacy_quizzes = sa.Table("quizzes", sa.MetaData(), autoload_with=bind)
        legacy_players = sa.Table("players", sa.MetaData(), autoload_with=bind)

        legacy_quiz_ids = bind.execute(sa.select(legacy_quizzes.c.id)).scalars().all()
        existing_codes = {
            row[0]
            for row in bind.execute(sa.select(sessions_table.c.code))
        }

        for legacy_quiz in bind.execute(sa.select(legacy_quizzes)).mappings():
            if legacy_quiz["code"] in existing_codes:
                continue

            created_at = _now_value(legacy_quiz, "created_at", "started_at", "finished_at")
            updated_at = legacy_quiz["finished_at"] or legacy_quiz["started_at"] or created_at
            template_id = bind.execute(
                templates_table.insert().values(
                    public_id=str(uuid4()),
                    owner_id=legacy_quiz.get("owner_id"),
                    title=legacy_quiz["title"],
                    total_questions=legacy_quiz.get("total_questions") or 0,
                    created_at=created_at,
                    updated_at=updated_at,
                    template_metadata={"legacy_quiz_id": legacy_quiz["id"]},
                )
            ).inserted_primary_key[0]

            question_ids_by_position: dict[int, int] = {}
            question_rows = _json_value(legacy_quiz.get("questions_data"), [])
            for position, raw_question in enumerate(question_rows, start=1):
                question_id = bind.execute(
                    questions_table.insert().values(
                        public_id=str(uuid4()),
                        template_id=template_id,
                        position=position,
                        text=raw_question.get("text"),
                        kind=raw_question.get("type", "text"),
                        correct_answer_text=raw_question.get("correct", ""),
                        points=1,
                        explanation=None,
                        question_metadata={},
                    )
                ).inserted_primary_key[0]
                question_ids_by_position[position] = question_id
                for option_position, option_text in enumerate(raw_question.get("options") or [], start=1):
                    bind.execute(
                        options_table.insert().values(
                            public_id=str(uuid4()),
                            question_id=question_id,
                            position=option_position,
                            option_text=option_text,
                            is_correct=(str(option_text).strip().lower() == str(raw_question.get("correct", "")).strip().lower()),
                        )
                    )

            session_id = bind.execute(
                sessions_table.insert().values(
                    public_id=str(uuid4()),
                    code=legacy_quiz["code"],
                    title=legacy_quiz["title"],
                    template_id=template_id,
                    owner_id=legacy_quiz.get("owner_id"),
                    status=legacy_quiz.get("status") or "waiting",
                    total_questions=legacy_quiz.get("total_questions") or len(question_rows),
                    current_question=legacy_quiz.get("current_question") or 0,
                    host_secret_hash=legacy_quiz.get("host_secret_hash"),
                    host_left_at=legacy_quiz.get("host_left_at"),
                    created_at=created_at,
                    started_at=legacy_quiz.get("started_at"),
                    finished_at=legacy_quiz.get("finished_at"),
                    updated_at=updated_at,
                    session_metadata={"legacy_quiz_id": legacy_quiz["id"]},
                    results_snapshot=None,
                )
            ).inserted_primary_key[0]

            bind.execute(
                events_table.insert().values(
                    public_id=str(uuid4()),
                    quiz_id=session_id,
                    participant_id=None,
                    installation_id=None,
                    question_id=None,
                    event_type="legacy_backfill_session_created",
                    occurred_at=created_at,
                    event_payload={"legacy_quiz_id": legacy_quiz["id"]},
                )
            )

            participant_id_by_legacy_id: dict[int, int] = {}
            legacy_players_query = sa.select(legacy_players).where(legacy_players.c.quiz_id == legacy_quiz["id"])
            for legacy_player in bind.execute(legacy_players_query).mappings():
                installation_id = None
                if any(
                    legacy_player.get(field)
                    for field in ("device", "browser", "browser_version", "device_model")
                ):
                    installation_id = bind.execute(
                        installations_table.insert().values(
                            public_id=str(uuid4()),
                            user_id=legacy_player.get("user_id"),
                            client_installation_key=f"legacy-player-{legacy_player['id']}",
                            platform="web",
                            device_family=legacy_player.get("device"),
                            device_brand=None,
                            device_model=legacy_player.get("device_model"),
                            browser=legacy_player.get("browser"),
                            browser_version=legacy_player.get("browser_version"),
                            app_version=None,
                            created_at=_now_value(legacy_player, "joined_at") or created_at,
                            last_seen_at=_now_value(legacy_player, "joined_at") or created_at,
                            installation_metadata={"source": "legacy_players"},
                        )
                    ).inserted_primary_key[0]

                participant_status = "finished" if legacy_quiz.get("status") == "finished" else ("disconnected" if legacy_player.get("sid") is None else "joined")
                participant_id = bind.execute(
                    participants_table.insert().values(
                        public_id=str(uuid4()),
                        name=legacy_player.get("name"),
                        role="host" if legacy_player.get("is_host") else "player",
                        emoji=legacy_player.get("emoji"),
                        score=legacy_player.get("score") or 0,
                        status=participant_status,
                        joined_at=_now_value(legacy_player, "joined_at") or created_at,
                        last_seen_at=_now_value(legacy_player, "joined_at"),
                        disconnected_at=None if legacy_player.get("sid") else _now_value(legacy_player, "joined_at"),
                        kicked_at=None,
                        reconnect_token_hash=None,
                        device=legacy_player.get("device"),
                        browser=legacy_player.get("browser"),
                        browser_version=legacy_player.get("browser_version"),
                        device_model=legacy_player.get("device_model"),
                        participant_metadata={"legacy_player_id": legacy_player["id"]},
                        user_id=legacy_player.get("user_id"),
                        installation_id=installation_id,
                        quiz_id=session_id,
                    )
                ).inserted_primary_key[0]
                participant_id_by_legacy_id[legacy_player["id"]] = participant_id

                answers_history = _json_value(legacy_player.get("answers_history"), {})
                scores_history = _json_value(legacy_player.get("scores_history"), {})
                answer_times = _json_value(legacy_player.get("answer_times"), {})
                total_from_answers = 0

                for raw_position in sorted(set(answers_history) | set(scores_history) | set(answer_times), key=lambda item: int(item)):
                    position = int(raw_position)
                    question_id = question_ids_by_position.get(position)
                    if question_id is None:
                        continue
                    awarded_points = int(scores_history.get(raw_position, 0) or 0)
                    total_from_answers += awarded_points
                    answer_id = bind.execute(
                        answers_table.insert().values(
                            public_id=str(uuid4()),
                            participant_id=participant_id,
                            quiz_id=session_id,
                            question_id=question_id,
                            selected_option_id=None,
                            question_position=position,
                            answer_text=answers_history.get(raw_position),
                            submitted_at=_now_value(legacy_player, "joined_at") or created_at,
                            answer_time_seconds=answer_times.get(raw_position),
                            is_correct=(awarded_points > 0) if raw_position in scores_history else None,
                            awarded_points=awarded_points,
                            evaluation_status="manual" if raw_position in scores_history else "auto",
                            answer_metadata={"source": "legacy_players"},
                        )
                    ).inserted_primary_key[0]
                    if awarded_points:
                        bind.execute(
                            adjustments_table.insert().values(
                                public_id=str(uuid4()),
                                quiz_id=session_id,
                                participant_id=participant_id,
                                answer_id=answer_id,
                                question_id=question_id,
                                created_by_participant_id=None,
                                adjustment_type="migration",
                                points_delta=awarded_points,
                                reason_code="legacy_scores_history",
                                reason_text="Imported from legacy players.scores_history",
                                created_at=_now_value(legacy_player, "joined_at") or created_at,
                                adjustment_metadata={"legacy_player_id": legacy_player["id"]},
                            )
                        )

                legacy_score = legacy_player.get("score") or 0
                if legacy_score != total_from_answers:
                    bind.execute(
                        adjustments_table.insert().values(
                            public_id=str(uuid4()),
                            quiz_id=session_id,
                            participant_id=participant_id,
                            answer_id=None,
                            question_id=None,
                            created_by_participant_id=None,
                            adjustment_type="migration",
                            points_delta=(legacy_score - total_from_answers),
                            reason_code="legacy_score_remainder",
                            reason_text="Imported legacy total score remainder",
                            created_at=_now_value(legacy_player, "joined_at") or created_at,
                            adjustment_metadata={"legacy_player_id": legacy_player["id"]},
                        )
                    )

def downgrade() -> None:
    """Удаляет нормализованные таблицы и возвращает схему к состоянию до миграции."""
    op.drop_table("session_events")
    op.drop_table("score_adjustments")
    op.drop_table("participant_answers")
    op.drop_table("session_participants")
    op.drop_table("game_sessions")
    op.drop_table("quiz_question_options")
    op.drop_table("quiz_questions")
    op.drop_table("quiz_templates")
    op.drop_table("user_installations")
