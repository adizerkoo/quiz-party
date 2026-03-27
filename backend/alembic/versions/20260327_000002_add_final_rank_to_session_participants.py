"""Add final rank to session participants.

Revision ID: 20260327_000002
Revises: 20260326_000001
Create Date: 2026-03-27 00:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260327_000002"
down_revision = "20260326_000001"
branch_labels = None
depends_on = None


def _constraint_names(inspector, table_name: str) -> set[str]:
    """Возвращает набор имён check-constraint для таблицы."""
    return {
        constraint["name"]
        for constraint in inspector.get_check_constraints(table_name)
        if constraint.get("name")
    }


def _index_names(inspector, table_name: str) -> set[str]:
    """Возвращает набор имён индексов для таблицы."""
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    """Добавляет `final_rank` и проставляет ранги уже завершённым новым сессиям."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("session_participants"):
        return

    existing_columns = {
        column["name"] for column in inspector.get_columns("session_participants")
    }
    if "final_rank" not in existing_columns:
        with op.batch_alter_table("session_participants") as batch_op:
            batch_op.add_column(sa.Column("final_rank", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    if "ix_session_participants_quiz_final_rank" not in _index_names(inspector, "session_participants"):
        op.create_index(
            "ix_session_participants_quiz_final_rank",
            "session_participants",
            ["quiz_id", "final_rank"],
            unique=False,
        )

    inspector = sa.inspect(bind)
    if "ck_session_participants_final_rank_positive" not in _constraint_names(inspector, "session_participants"):
        with op.batch_alter_table("session_participants") as batch_op:
            batch_op.create_check_constraint(
                "ck_session_participants_final_rank_positive",
                "final_rank IS NULL OR final_rank >= 1",
            )

    participants = sa.table(
        "session_participants",
        sa.column("id", sa.Integer),
        sa.column("quiz_id", sa.Integer),
        sa.column("role", sa.String),
        sa.column("score", sa.Integer),
        sa.column("status", sa.String),
        sa.column("joined_at", sa.DateTime),
        sa.column("final_rank", sa.Integer),
    )
    sessions = sa.table(
        "game_sessions",
        sa.column("id", sa.Integer),
        sa.column("status", sa.String),
    )

    finished_session_ids = bind.execute(
        sa.select(sessions.c.id).where(sessions.c.status == "finished")
    ).scalars().all()

    for session_id in finished_session_ids:
        leaderboard = bind.execute(
            sa.select(
                participants.c.id,
                participants.c.score,
            )
            .where(
                participants.c.quiz_id == session_id,
                participants.c.role == "player",
                participants.c.status != "kicked",
            )
            .order_by(
                participants.c.score.desc(),
                participants.c.joined_at.asc(),
                participants.c.id.asc(),
            )
        ).mappings().all()

        current_rank = 0
        previous_score: int | None = None
        for row in leaderboard:
            if previous_score is None or row["score"] != previous_score:
                current_rank += 1
                previous_score = row["score"]
            bind.execute(
                sa.update(participants)
                .where(participants.c.id == row["id"])
                .values(final_rank=current_rank)
            )


def downgrade() -> None:
    """Удаляет `final_rank`, его индекс и check-constraint."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("session_participants"):
        return

    if "ix_session_participants_quiz_final_rank" in _index_names(inspector, "session_participants"):
        op.drop_index("ix_session_participants_quiz_final_rank", table_name="session_participants")

    inspector = sa.inspect(bind)
    if "ck_session_participants_final_rank_positive" in _constraint_names(inspector, "session_participants"):
        with op.batch_alter_table("session_participants") as batch_op:
            batch_op.drop_constraint("ck_session_participants_final_rank_positive", type_="check")

    existing_columns = {
        column["name"] for column in inspector.get_columns("session_participants")
    }
    if "final_rank" in existing_columns:
        with op.batch_alter_table("session_participants") as batch_op:
            batch_op.drop_column("final_rank")
