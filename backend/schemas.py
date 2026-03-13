from pydantic import BaseModel
from typing import List, Optional, Any

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

    class Config:
        from_attributes = True