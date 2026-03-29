"""Add hashed bearer session tokens to user installations.

Revision ID: 20260329_000006
Revises: 20260328_000005
Create Date: 2026-03-29 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260329_000006"
down_revision = "20260328_000005"
branch_labels = None
depends_on = None


def _column_names(inspector, table_name: str) -> set[str]:
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    if not inspector.has_table(table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    installation_columns = _column_names(inspector, "user_installations")
    if "session_token_hash" not in installation_columns:
        op.add_column(
            "user_installations",
            sa.Column("session_token_hash", sa.String(length=128), nullable=True),
        )
    if "session_token_issued_at" not in installation_columns:
        op.add_column(
            "user_installations",
            sa.Column("session_token_issued_at", sa.DateTime(), nullable=True),
        )

    installation_indexes = _index_names(sa.inspect(bind), "user_installations")
    if "ix_user_installations_session_token_hash" not in installation_indexes:
        op.create_index(
            "ix_user_installations_session_token_hash",
            "user_installations",
            ["session_token_hash"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    installation_indexes = _index_names(inspector, "user_installations")
    if "ix_user_installations_session_token_hash" in installation_indexes:
        op.drop_index("ix_user_installations_session_token_hash", table_name="user_installations")

    installation_columns = _column_names(sa.inspect(bind), "user_installations")
    if "session_token_issued_at" in installation_columns:
        op.drop_column("user_installations", "session_token_issued_at")
    if "session_token_hash" in installation_columns:
        op.drop_column("user_installations", "session_token_hash")
