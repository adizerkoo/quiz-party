"""Pydantic-схемы платформенного контентного слоя Quiz Party."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class QuestionSchema(BaseModel):
    """Схема одного вопроса, приходящего при создании квиза."""

    text: str = Field(..., min_length=1, max_length=500)
    type: str
    correct: str = Field(..., min_length=1, max_length=200)
    options: Optional[List[str]] = None
    source_question_public_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        """Разрешает только поддерживаемые типы вопросов."""
        if value not in ("text", "options"):
            raise ValueError('type must be "text" or "options"')
        return value

    @field_validator("text", "correct")
    @classmethod
    def validate_required_text_fields(cls, value: str) -> str:
        """Trims required text fields and rejects whitespace-only values."""
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be blank")
        return cleaned

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        """Проверяет допустимое число и длину вариантов ответа."""
        if value is not None:
            if len(value) < 2:
                raise ValueError("Minimum 2 options required")
            if len(value) > 6:
                raise ValueError("Maximum 6 options allowed")
            normalized_options: list[str] = []
            for option in value:
                cleaned = str(option).strip()
                if not cleaned:
                    raise ValueError("Option text cannot be blank")
                if len(cleaned) > 200:
                    raise ValueError("Option text too long (max 200 chars)")
                normalized_options.append(cleaned)
            return normalized_options
        return value

    @model_validator(mode="after")
    def validate_question_shape(self) -> "QuestionSchema":
        """Ensures the payload shape matches the declared question type."""
        if self.type == "text":
            self.options = None
            return self

        if not self.options:
            raise ValueError('options are required when type is "options"')
        if self.correct not in self.options:
            raise ValueError("correct must match one of the provided options")
        return self


LibraryScope = Literal["public", "favorites"]
OriginScreen = Literal["create", "profile", "history"]


class LibraryCategoryResponse(BaseModel):
    """One question-bank category row for the library UI."""

    public_id: str
    slug: str
    title: str
    sort_order: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class LibraryQuestionResponse(BaseModel):
    """Reusable question row returned by library/favorites endpoints."""

    public_id: str
    text: str
    type: str
    correct: str
    options: Optional[List[str]] = None
    source_question_public_id: str
    source: Literal["system", "user"]
    visibility: Literal["public", "private"]
    category_slug: Optional[str] = None
    category_title: Optional[str] = None
    is_favorite: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FavoriteQuestionMutationRequest(BaseModel):
    """Adds an existing bank question to favorites or creates a private reusable one."""

    user_id: Optional[int] = None
    installation_public_id: Optional[str] = Field(default=None, max_length=36)
    origin_screen: Optional[OriginScreen] = None
    source_question_public_id: Optional[str] = Field(default=None, max_length=36)
    question: Optional[QuestionSchema] = None

    @model_validator(mode="after")
    def validate_payload_shape(self) -> "FavoriteQuestionMutationRequest":
        if self.source_question_public_id and self.question is not None:
            raise ValueError("Provide either source_question_public_id or question")
        if not self.source_question_public_id and self.question is None:
            raise ValueError("source_question_public_id or question is required")
        return self


class TemplateDraftResponse(BaseModel):
    """Draft payload that lets the host reopen create with a stored template snapshot."""

    template_public_id: str
    title: str
    total_questions: int
    questions: List[QuestionSchema] = Field(default_factory=list)
