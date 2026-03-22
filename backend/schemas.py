from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime

class QuestionSchema(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    type: str
    correct: str = Field(..., min_length=1, max_length=200)
    options: Optional[List[str]] = None

    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        if v not in ('text', 'options'):
            raise ValueError('type must be "text" or "options"')
        return v

    @field_validator('options')
    @classmethod
    def validate_options(cls, v):
        if v is not None:
            if len(v) > 6:
                raise ValueError('Maximum 6 options allowed')
            for opt in v:
                if len(opt) > 200:
                    raise ValueError('Option text too long (max 200 chars)')
        return v


class QuizCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    questions: List[QuestionSchema] = Field(..., min_length=1, max_length=50)


class QuizResponse(BaseModel):
    id: int
    code: str
    title: str

    # 🆕 Новые поля
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    winner_id: Optional[int] = None

    class Config:
        from_attributes = True