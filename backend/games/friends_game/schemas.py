"""Pydantic-схемы текущей игры с друзьями в Quiz Party."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.platform.content.schemas import QuestionSchema

class QuizQuestionPayload(BaseModel):
    """Question payload used in result/history responses."""

    text: str
    type: str
    correct: Optional[str] = None
    options: Optional[List[str]] = None
    source_question_public_id: Optional[str] = None


class QuizResultPlayer(BaseModel):
    """One leaderboard row in the unified final-results contract."""

    name: str
    score: int
    final_rank: Optional[int] = None
    emoji: Optional[str] = None
    answers: dict[str, str] = Field(default_factory=dict)
    answer_times: dict[str, float] = Field(default_factory=dict)


class QuizResultsSnapshot(BaseModel):
    """Stored snapshot body reused by the final-results API."""

    results: List[QuizResultPlayer] = Field(default_factory=list)
    questions: List[QuizQuestionPayload] = Field(default_factory=list)


class QuizResultsResponse(BaseModel):
    """Unified payload for the final-results screen on every client."""

    code: str
    title: str
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    total_questions: int
    questions: List[QuizQuestionPayload] = Field(default_factory=list)
    results: List[QuizResultPlayer] = Field(default_factory=list)


class UserHistoryEntry(BaseModel):
    """One game in the user profile history."""

    quiz_code: str
    title: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    game_status: str
    cancel_reason: Optional[str] = None
    participant_status: str
    score: Optional[int] = None
    final_rank: Optional[int] = None
    is_winner: bool = False
    winner_names: List[str] = Field(default_factory=list)
    can_open_results: bool = False
    template_public_id: Optional[str] = None
    is_host_game: bool = False
    can_repeat: bool = False


class QuizCreate(BaseModel):
    """Payload РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РЅРѕРІРѕРіРѕ С€Р°Р±Р»РѕРЅР° Рё РїРµСЂРІРѕР№ РёРіСЂРѕРІРѕР№ СЃРµСЃСЃРёРё."""

    title: str = Field(..., min_length=1, max_length=100)
    questions: List[QuestionSchema] = Field(..., min_length=1, max_length=50)
    owner_id: Optional[int] = None


class QuizResponse(BaseModel):
    """РћС‚РІРµС‚ API РїРѕСЃР»Рµ СЃРѕР·РґР°РЅРёСЏ РёР»Рё С‡С‚РµРЅРёСЏ РёРіСЂРѕРІРѕР№ СЃРµСЃСЃРёРё."""

    id: int
    public_id: Optional[str] = None
    template_public_id: Optional[str] = None
    code: str
    title: str
    status: str
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    host_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ResumeSessionCandidate(BaseModel):
    """РћРґРЅР° Р»РѕРєР°Р»СЊРЅРѕ СЃРѕС…СЂР°РЅС‘РЅРЅР°СЏ РёРіСЂРѕРІР°СЏ СЃРµСЃСЃРёСЏ РґР»СЏ СЃРµСЂРІРµСЂРЅРѕР№ resume-РїСЂРѕРІРµСЂРєРё."""

    room_code: str = Field(..., min_length=1, max_length=20)
    role: Literal["host", "player"]
    participant_id: Optional[str] = Field(default=None, max_length=36)
    participant_token: Optional[str] = Field(default=None, max_length=128)
    host_token: Optional[str] = Field(default=None, max_length=128)
    installation_public_id: Optional[str] = Field(default=None, max_length=36)


class ResumeCheckRequest(BaseModel):
    """РџР°РєРµС‚ Р»РѕРєР°Р»СЊРЅС‹С… credentials, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ С…РѕС‡РµС‚ РїСЂРѕРІРµСЂРёС‚СЊ РЅР° РІР°Р»РёРґРЅРѕСЃС‚СЊ."""

    sessions: List[ResumeSessionCandidate] = Field(..., min_length=1, max_length=10)
    user_id: Optional[int] = None
    installation_public_id: Optional[str] = Field(default=None, max_length=36)


class ResumeSessionStatus(BaseModel):
    """Р РµР·СѓР»СЊС‚Р°С‚ СЃРµСЂРІРµСЂРЅРѕР№ РїСЂРѕРІРµСЂРєРё РѕРґРЅРѕР№ СЃРѕС…СЂР°РЅС‘РЅРЅРѕР№ СЃРµСЃСЃРёРё."""

    room_code: str
    role: Literal["host", "player"]
    title: Optional[str] = None
    status: Optional[str] = None
    can_resume: bool
    reason: Optional[str] = None
    cancel_reason: Optional[str] = None
    clear_credentials: bool = False


class ResumeCheckResponse(BaseModel):
    """РћС‚РІРµС‚ API c Р»СѓС‡С€РёРј resume-РєР°РЅРґРёРґР°С‚РѕРј Рё РїСЂРёС‡РёРЅР°РјРё РѕС‚РєР°Р·Р° РїРѕ РѕСЃС‚Р°Р»СЊРЅС‹Рј."""

    has_resume_game: bool
    resume_game: Optional[ResumeSessionStatus] = None
    sessions: List[ResumeSessionStatus]


