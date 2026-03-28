"""Add reusable question bank, favorites, and template source links.

Revision ID: 20260328_000005
Revises: 20260327_000004
Create Date: 2026-03-28 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260328_000005"
down_revision = "20260327_000004"
branch_labels = None
depends_on = None


def _index_names(inspector, table_name: str) -> set[str]:
    if not inspector.has_table(table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _column_names(inspector, table_name: str) -> set[str]:
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    """Creates server-side reusable question storage and favorite links."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("question_categories"):
        op.create_table(
            "question_categories",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("slug", sa.String(length=80), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    inspector = sa.inspect(bind)
    category_indexes = _index_names(inspector, "question_categories")
    if "ix_question_categories_public_id" not in category_indexes:
        op.create_index(
            "ix_question_categories_public_id",
            "question_categories",
            ["public_id"],
            unique=True,
        )
    if "ix_question_categories_slug" not in category_indexes:
        op.create_index(
            "ix_question_categories_slug",
            "question_categories",
            ["slug"],
            unique=True,
        )
    if "ix_question_categories_sort_active" not in category_indexes:
        op.create_index(
            "ix_question_categories_sort_active",
            "question_categories",
            ["is_active", "sort_order"],
            unique=False,
        )

    if not inspector.has_table("question_bank_questions"):
        op.create_table(
            "question_bank_questions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column(
                "category_id",
                sa.Integer(),
                sa.ForeignKey("question_categories.id"),
                nullable=True,
            ),
            sa.Column("origin", sa.String(length=20), nullable=False, server_default="user"),
            sa.Column("visibility", sa.String(length=20), nullable=False, server_default="private"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("text", sa.String(length=500), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("correct_answer_text", sa.String(length=200), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("question_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.CheckConstraint(
                "origin IN ('system', 'user')",
                name="ck_question_bank_questions_origin",
            ),
            sa.CheckConstraint(
                "visibility IN ('public', 'private')",
                name="ck_question_bank_questions_visibility",
            ),
            sa.CheckConstraint(
                "status IN ('active', 'archived', 'hidden')",
                name="ck_question_bank_questions_status",
            ),
            sa.CheckConstraint(
                "kind IN ('text', 'options')",
                name="ck_question_bank_questions_kind",
            ),
        )

    inspector = sa.inspect(bind)
    bank_indexes = _index_names(inspector, "question_bank_questions")
    if "ix_question_bank_questions_public_id" not in bank_indexes:
        op.create_index(
            "ix_question_bank_questions_public_id",
            "question_bank_questions",
            ["public_id"],
            unique=True,
        )
    if "ix_question_bank_questions_owner_created" not in bank_indexes:
        op.create_index(
            "ix_question_bank_questions_owner_created",
            "question_bank_questions",
            ["owner_id", "created_at"],
            unique=False,
        )
    if "ix_question_bank_questions_visibility_status" not in bank_indexes:
        op.create_index(
            "ix_question_bank_questions_visibility_status",
            "question_bank_questions",
            ["visibility", "status"],
            unique=False,
        )
    if "ix_question_bank_questions_category_status" not in bank_indexes:
        op.create_index(
            "ix_question_bank_questions_category_status",
            "question_bank_questions",
            ["category_id", "status"],
            unique=False,
        )

    if not inspector.has_table("question_bank_options"):
        op.create_table(
            "question_bank_options",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column(
                "question_id",
                sa.Integer(),
                sa.ForeignKey("question_bank_questions.id"),
                nullable=False,
            ),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("option_text", sa.String(length=200), nullable=False),
            sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.UniqueConstraint("question_id", "position", name="uq_question_bank_options_position"),
            sa.CheckConstraint(
                "position >= 1",
                name="ck_question_bank_options_position_positive",
            ),
        )

    inspector = sa.inspect(bind)
    bank_option_indexes = _index_names(inspector, "question_bank_options")
    if "ix_question_bank_options_public_id" not in bank_option_indexes:
        op.create_index(
            "ix_question_bank_options_public_id",
            "question_bank_options",
            ["public_id"],
            unique=True,
        )

    if not inspector.has_table("user_favorite_questions"):
        op.create_table(
            "user_favorite_questions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column(
                "question_id",
                sa.Integer(),
                sa.ForeignKey("question_bank_questions.id"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "user_id",
                "question_id",
                name="uq_user_favorite_questions_user_question",
            ),
        )

    inspector = sa.inspect(bind)
    favorite_indexes = _index_names(inspector, "user_favorite_questions")
    if "ix_user_favorite_questions_question" not in favorite_indexes:
        op.create_index(
            "ix_user_favorite_questions_question",
            "user_favorite_questions",
            ["question_id"],
            unique=False,
        )
    if "ix_user_favorite_questions_user_created" not in favorite_indexes:
        op.create_index(
            "ix_user_favorite_questions_user_created",
            "user_favorite_questions",
            ["user_id", "created_at"],
            unique=False,
        )

    if inspector.has_table("quiz_questions"):
        question_columns = _column_names(inspector, "quiz_questions")
        with op.batch_alter_table("quiz_questions") as batch_op:
            if "source_question_id" not in question_columns:
                batch_op.add_column(
                    sa.Column(
                        "source_question_id",
                        sa.Integer(),
                        sa.ForeignKey("question_bank_questions.id"),
                        nullable=True,
                    )
                )

        inspector = sa.inspect(bind)
        quiz_question_indexes = _index_names(inspector, "quiz_questions")
        if "ix_quiz_questions_source_question" not in quiz_question_indexes:
            op.create_index(
                "ix_quiz_questions_source_question",
                "quiz_questions",
                ["source_question_id"],
                unique=False,
            )


def downgrade() -> None:
    """Drops reusable question-bank storage introduced by this migration."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("quiz_questions"):
        quiz_question_indexes = _index_names(inspector, "quiz_questions")
        if "ix_quiz_questions_source_question" in quiz_question_indexes:
            op.drop_index("ix_quiz_questions_source_question", table_name="quiz_questions")

        question_columns = _column_names(inspector, "quiz_questions")
        if "source_question_id" in question_columns:
            with op.batch_alter_table("quiz_questions") as batch_op:
                batch_op.drop_column("source_question_id")

    if inspector.has_table("user_favorite_questions"):
        op.drop_table("user_favorite_questions")
    if inspector.has_table("question_bank_options"):
        op.drop_table("question_bank_options")
    if inspector.has_table("question_bank_questions"):
        op.drop_table("question_bank_questions")
    if inspector.has_table("question_categories"):
        op.drop_table("question_categories")
