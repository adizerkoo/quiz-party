from pathlib import Path
from fastapi import Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from . import models, schemas, database
from .config import logger, FRONTEND_PATH, DATA_PATH


def register_routes(app):
    @app.get("/")
    async def read_index():
        index_file = Path(FRONTEND_PATH) / "index.html"
        return FileResponse(index_file)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    app.mount("/data", StaticFiles(directory=str(DATA_PATH)), name="data")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_PATH)), name="static")

    @app.post("/api/quizzes", response_model=schemas.QuizResponse)
    def create_quiz(quiz_data: schemas.QuizCreate, db: Session = Depends(database.get_db)):
        logger.info(f"📝 Creating quiz: {quiz_data.title} (code: {quiz_data.code})")
        try:
            new_quiz = models.Quiz(
                title=quiz_data.title,
                code=quiz_data.code,
                questions_data=[q.dict() for q in quiz_data.questions],
                status="waiting"
            )
            db.add(new_quiz)
            db.commit()
            db.refresh(new_quiz)
            logger.info(f"✅ Quiz created successfully: ID={new_quiz.id}")
            return new_quiz
        except Exception as e:
            logger.error(f"❌ Error creating quiz: {e}")
            db.rollback()
            raise

    @app.get("/api/quizzes/{code}")
    def get_quiz(code: str, db: Session = Depends(database.get_db)):
        quiz = db.query(models.Quiz).filter(models.Quiz.code == code).first()
        if not quiz:
            raise HTTPException(status_code=404, detail="The quiz was not found")
        return quiz
