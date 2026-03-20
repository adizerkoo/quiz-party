from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class QuestionSchema(BaseModel):
    text: str
    type: str
    correct: str
    options: Optional[List[str]] = None


class QuizCreate(BaseModel):
    title: str
    code: str
    questions: List[QuestionSchema]


class QuizResponse(BaseModel):
    id: int
    code: str
    title: str

    # 🆕 Новые поля
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True