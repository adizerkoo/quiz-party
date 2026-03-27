"""Add timeout and voluntary-leave fields for unfinished game recovery.

Revision ID: 20260327_000004
Revises: 20260327_000003
Create Date: 2026-03-27 22:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260327_000004"
down_revision = "20260327_000003"
branch_labels = None
depends_on = None


def _constraint_names(inspector, table_name: str) -> set[str]:
    return {
        constraint["name"]
        for constraint in inspector.get_check_constraints(table_name)
        if constraint.get("name")
    }


def _index_names(inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    """Adds activity/cancellation fields and the `left` participant status."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("game_sessions"):
        session_columns = {column["name"] for column in inspector.get_columns("game_sessions")}
        with op.batch_alter_table("game_sessions") as batch_op:
            if "last_activity_at" not in session_columns:
                batch_op.add_column(sa.Column("last_activity_at", sa.DateTime(), nullable=True))
            if "cancelled_at" not in session_columns:
                batch_op.add_column(sa.Column("cancelled_at", sa.DateTime(), nullable=True))
            if "cancel_reason" not in session_columns:
                batch_op.add_column(sa.Column("cancel_reason", sa.String(length=40), nullable=True))

        bind.execute(
            sa.text(
                """
                UPDATE game_sessions
                SET last_activity_at = COALESCE(last_activity_at, updated_at, started_at, created_at)
                WHERE last_activity_at IS NULL
                """
            )
        )
        bind.execute(
            sa.text(
                """
                UPDATE game_sessions
                SET cancelled_at = COALESCE(cancelled_at, updated_at, finished_at, started_at, created_at)
                WHERE status = 'cancelled' AND cancelled_at IS NULL
                """
            )
        )

        inspector = sa.inspect(bind)
        if "ix_game_sessions_status_activity" not in _index_names(inspector, "game_sessions"):
            op.create_index(
                "ix_game_sessions_status_activity",
                "game_sessions",
                ["status", "last_activity_at"],
                unique=False,
            )

    if inspector.has_table("session_participants"):
        participant_columns = {column["name"] for column in inspector.get_columns("session_participants")}
        if "left_at" not in participant_columns:
            with op.batch_alter_table("session_participants") as batch_op:
                batch_op.add_column(sa.Column("left_at", sa.DateTime(), nullable=True))

        inspector = sa.inspect(bind)
        constraint_names = _constraint_names(inspector, "session_participants")
        with op.batch_alter_table("session_participants") as batch_op:
            if "ck_session_participants_status" in constraint_names:
                batch_op.drop_constraint("ck_session_participants_status", type_="check")
            batch_op.create_check_constraint(
                "ck_session_participants_status",
                "status IN ('joined', 'disconnected', 'kicked', 'left', 'finished')",
            )


def downgrade() -> None:
    """Drops new timeout/leave fields and restores the old participant status constraint."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("session_participants"):
        bind.execute(
            sa.text(
                """
                UPDATE session_participants
                SET status = 'disconnected'
                WHERE status = 'left'
                """
            )
        )

        constraint_names = _constraint_names(inspector, "session_participants")
        participant_columns = {column["name"] for column in inspector.get_columns("session_participants")}
        with op.batch_alter_table("session_participants") as batch_op:
            if "ck_session_participants_status" in constraint_names:
                batch_op.drop_constraint("ck_session_participants_status", type_="check")
            batch_op.create_check_constraint(
                "ck_session_participants_status",
                "status IN ('joined', 'disconnected', 'kicked', 'finished')",
            )
            if "left_at" in participant_columns:
                batch_op.drop_column("left_at")

    if inspector.has_table("game_sessions"):
        if "ix_game_sessions_status_activity" in _index_names(inspector, "game_sessions"):
            op.drop_index("ix_game_sessions_status_activity", table_name="game_sessions")

        session_columns = {column["name"] for column in inspector.get_columns("game_sessions")}
        with op.batch_alter_table("game_sessions") as batch_op:
            if "cancel_reason" in session_columns:
                batch_op.drop_column("cancel_reason")
            if "cancelled_at" in session_columns:
                batch_op.drop_column("cancelled_at")
            if "last_activity_at" in session_columns:
                batch_op.drop_column("last_activity_at")
