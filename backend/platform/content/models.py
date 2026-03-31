"""Модели домена content платформенного слоя Quiz Party."""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.app.database import Base
from backend.shared.utils import generate_public_id, utc_now_naive

class QuestionCategory(Base):
    __tablename__ = "question_categories"
    __table_args__ = (
        Index("ix_question_categories_public_id", "public_id", unique=True),
        Index("ix_question_categories_slug", "slug", unique=True),
        Index("ix_question_categories_sort_active", "is_active", "sort_order"),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    slug = Column(String(80), nullable=False)
    title = Column(String(120), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)

    questions = relationship("QuestionBankQuestion", back_populates="category")


class QuestionBankQuestion(Base):
    __tablename__ = "question_bank_questions"
    __table_args__ = (
        Index("ix_question_bank_questions_public_id", "public_id", unique=True),
        Index("ix_question_bank_questions_owner_created", "owner_id", "created_at"),
        Index("ix_question_bank_questions_visibility_status", "visibility", "status"),
        Index("ix_question_bank_questions_category_status", "category_id", "status"),
        CheckConstraint(
            "origin IN ('system', 'user')",
            name="ck_question_bank_questions_origin",
        ),
        CheckConstraint(
            "visibility IN ('public', 'private')",
            name="ck_question_bank_questions_visibility",
        ),
        CheckConstraint(
            "status IN ('active', 'archived', 'hidden')",
            name="ck_question_bank_questions_status",
        ),
        CheckConstraint(
            "kind IN ('text', 'options')",
            name="ck_question_bank_questions_kind",
        ),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("question_categories.id"), nullable=True)
    origin = Column(String(20), nullable=False, default="user")
    visibility = Column(String(20), nullable=False, default="private")
    status = Column(String(20), nullable=False, default="active")
    text = Column(String(500), nullable=False)
    kind = Column(String(20), nullable=False)
    correct_answer_text = Column(String(200), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)
    question_metadata = Column(JSON, nullable=False, default=dict)

    owner = relationship("User", back_populates="owned_bank_questions", foreign_keys=[owner_id])
    category = relationship("QuestionCategory", back_populates="questions")
    options = relationship(
        "QuestionBankOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionBankOption.position",
    )
    favorites = relationship(
        "UserFavoriteQuestion",
        back_populates="question",
        cascade="all, delete-orphan",
    )
    template_snapshots = relationship("QuizQuestion", back_populates="source_question")


class QuestionBankOption(Base):
    __tablename__ = "question_bank_options"
    __table_args__ = (
        UniqueConstraint("question_id", "position", name="uq_question_bank_options_position"),
        Index("ix_question_bank_options_public_id", "public_id", unique=True),
        CheckConstraint("position >= 1", name="ck_question_bank_options_position_positive"),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    question_id = Column(Integer, ForeignKey("question_bank_questions.id"), nullable=False)
    position = Column(Integer, nullable=False)
    option_text = Column(String(200), nullable=False)
    is_correct = Column(Boolean, nullable=False, default=False)

    question = relationship("QuestionBankQuestion", back_populates="options")


class UserFavoriteQuestion(Base):
    __tablename__ = "user_favorite_questions"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_user_favorite_questions_user_question"),
        Index("ix_user_favorite_questions_question", "question_id"),
        Index("ix_user_favorite_questions_user_created", "user_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("question_bank_questions.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)

    user = relationship("User", back_populates="favorite_questions")
    question = relationship("QuestionBankQuestion", back_populates="favorites")


class QuizTemplate(Base):
    __tablename__ = "quiz_templates"
    __table_args__ = (
        Index("ix_quiz_templates_public_id", "public_id", unique=True),
        Index("ix_quiz_templates_owner_created", "owner_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String(100), nullable=False)
    total_questions = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=utc_now_naive)
    updated_at = Column(DateTime, nullable=False, default=utc_now_naive, onupdate=utc_now_naive)
    template_metadata = Column(JSON, nullable=False, default=dict)

    owner = relationship("User", back_populates="owned_templates", foreign_keys=[owner_id])
    questions = relationship(
        "QuizQuestion",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="QuizQuestion.position",
    )
    sessions = relationship("Quiz", back_populates="template")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (
        UniqueConstraint("template_id", "position", name="uq_quiz_questions_template_position"),
        Index("ix_quiz_questions_public_id", "public_id", unique=True),
        Index("ix_quiz_questions_source_question", "source_question_id"),
        CheckConstraint("position >= 1", name="ck_quiz_questions_position_positive"),
        CheckConstraint("points >= 0", name="ck_quiz_questions_points_non_negative"),
        CheckConstraint(
            "kind IN ('text', 'options')",
            name="ck_quiz_questions_kind",
        ),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    template_id = Column(Integer, ForeignKey("quiz_templates.id"), nullable=False)
    source_question_id = Column(Integer, ForeignKey("question_bank_questions.id"), nullable=True)
    position = Column(Integer, nullable=False)
    text = Column(String(500), nullable=False)
    kind = Column(String(20), nullable=False)
    correct_answer_text = Column(String(200), nullable=False)
    points = Column(Integer, nullable=False, default=1)
    explanation = Column(Text, nullable=True)
    question_metadata = Column(JSON, nullable=False, default=dict)

    template = relationship("QuizTemplate", back_populates="questions")
    source_question = relationship("QuestionBankQuestion", back_populates="template_snapshots")
    options = relationship(
        "QuizQuestionOption",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuizQuestionOption.position",
    )
    answers = relationship("ParticipantAnswer", back_populates="question")
    score_adjustments = relationship("ScoreAdjustment", back_populates="question")
    session_events = relationship("SessionEvent", back_populates="question")


class QuizQuestionOption(Base):
    __tablename__ = "quiz_question_options"
    __table_args__ = (
        UniqueConstraint("question_id", "position", name="uq_quiz_question_options_position"),
        Index("ix_quiz_question_options_public_id", "public_id", unique=True),
        CheckConstraint("position >= 1", name="ck_quiz_question_options_position_positive"),
    )

    id = Column(Integer, primary_key=True)
    public_id = Column(String(36), nullable=False, default=generate_public_id)
    question_id = Column(Integer, ForeignKey("quiz_questions.id"), nullable=False)
    position = Column(Integer, nullable=False)
    option_text = Column(String(200), nullable=False)
    is_correct = Column(Boolean, nullable=False, default=False)

    question = relationship("QuizQuestion", back_populates="options")
    answers = relationship("ParticipantAnswer", back_populates="selected_option")


