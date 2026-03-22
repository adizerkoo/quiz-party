import string
import logging
import secrets
from pathlib import Path
from fastapi import Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from . import models, schemas, database
from .config import FRONTEND_PATH, DATA_PATH

logger = logging.getLogger(__name__)


def _generate_unique_code(db: Session, max_attempts: int = 10) -> str:
    """Generate a unique quiz code like PARTY-ABCD with collision retry."""
    for _ in range(max_attempts):
        suffix = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5))
        code = f"PARTY-{suffix}"
        exists = db.query(models.Quiz.id).filter(models.Quiz.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=503, detail="Could not generate unique room code")


def register_routes(app):
    @app.get("/")
    async def read_index():
        index_file = Path(FRONTEND_PATH) / "index.html"
        return FileResponse(index_file)

    @app.get("/api/health")
    async def health(db: Session = Depends(database.get_db)):
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ok"}
        except Exception:
            logger.error("Health check failed — database unavailable", exc_info=True)
            raise HTTPException(status_code=503, detail="Database unavailable")

    app.mount("/data", StaticFiles(directory=str(DATA_PATH)), name="data")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

    @app.post("/api/quizzes", response_model=schemas.QuizResponse)
    def create_quiz(quiz_data: schemas.QuizCreate, db: Session = Depends(database.get_db)):
        code = _generate_unique_code(db)
        logger.info("Creating quiz  title=%r  code=%s  questions=%d", quiz_data.title, code, len(quiz_data.questions))
        try:
            new_quiz = models.Quiz(
                title=quiz_data.title,
                code=code,
                questions_data=[q.dict() for q in quiz_data.questions],
                total_questions=len(quiz_data.questions),
                status="waiting"
            )
            db.add(new_quiz)
            db.commit()
            db.refresh(new_quiz)
            logger.info("Quiz created  id=%s  code=%s", new_quiz.id, code)
            return new_quiz
        except Exception as e:
            logger.error("Failed to create quiz  code=%s  error=%s", code, e, exc_info=True)
            db.rollback()
            raise

    @app.get("/api/quizzes/{code}")
    def get_quiz(code: str, db: Session = Depends(database.get_db)):
        quiz = db.query(models.Quiz).filter(models.Quiz.code == code).first()
        if not quiz:
            logger.warning("Quiz not found  code=%s", code)
            raise HTTPException(status_code=404, detail="The quiz was not found")
        logger.debug("Quiz fetched  code=%s  status=%s", code, quiz.status)
        return quiz
