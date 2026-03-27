"""Drop deprecated winner_id from game_sessions.

Revision ID: 20260327_000003
Revises: 20260327_000002
Create Date: 2026-03-27 02:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260327_000003"
down_revision = "20260327_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Удаляет winner_id, потому что победители теперь определяются только через final_rank."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("game_sessions"):
        return

    session_columns = {column["name"] for column in inspector.get_columns("game_sessions")}
    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("game_sessions")}

    with op.batch_alter_table("game_sessions") as batch_op:
        if "fk_game_sessions_winner_id" in fk_names:
            batch_op.drop_constraint("fk_game_sessions_winner_id", type_="foreignkey")
        if "winner_id" in session_columns:
            batch_op.drop_column("winner_id")


def downgrade() -> None:
    """Возвращает compatibility-колонку winner_id, если потребуется откат миграции."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("game_sessions"):
        return

    session_columns = {column["name"] for column in inspector.get_columns("game_sessions")}
    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("game_sessions")}

    with op.batch_alter_table("game_sessions") as batch_op:
        if "winner_id" not in session_columns:
            batch_op.add_column(sa.Column("winner_id", sa.Integer(), nullable=True))
        if "fk_game_sessions_winner_id" not in fk_names:
            batch_op.create_foreign_key(
                "fk_game_sessions_winner_id",
                "session_participants",
                ["winner_id"],
                ["id"],
            )
