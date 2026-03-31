"""HTTP API платформенного content-домена: library, favorites и drafts."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.app import database
from backend.platform.content import schemas
from backend.platform.content.repository import (
    add_favorite_question,
    list_favorite_questions,
    remove_favorite_question,
)
from backend.platform.content.service import (
    get_template_draft_for_owner,
    list_library_categories,
    list_library_questions,
)
from backend.platform.identity.service import (
    AuthenticatedUserContext,
    ensure_authenticated_identity_matches,
    get_current_authenticated_user,
    get_optional_authenticated_user,
)


def register_content_routes(app):
    """Регистрирует HTTP-маршруты content-домена на приложении."""

    @app.get("/api/v1/library/categories", response_model=list[schemas.LibraryCategoryResponse])
    def get_library_categories(db: Session = Depends(database.get_db)):
        """Возвращает активные серверные question-bank категории для library UI."""
        return list_library_categories(db)

    @app.get("/api/v1/library/questions", response_model=list[schemas.LibraryQuestionResponse])
    def get_library_questions(
        scope: schemas.LibraryScope = Query(default="public"),
        category: str | None = Query(default=None),
        search: str | None = Query(default=None),
        user_id: int | None = Query(default=None),
        installation_public_id: str | None = Query(default=None, max_length=36),
        origin_screen: schemas.OriginScreen | None = Query(default=None),
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext | None = Depends(get_optional_authenticated_user),
    ):
        """Возвращает public или favorite reusable-вопросы для create/profile UI."""
        if scope == "favorites":
            if auth is None:
                raise HTTPException(status_code=401, detail="Session token is required")
            ensure_authenticated_identity_matches(
                auth,
                user_id=user_id,
                installation_public_id=installation_public_id,
            )
            user = auth.user
        else:
            if auth is not None:
                ensure_authenticated_identity_matches(
                    auth,
                    user_id=user_id,
                    installation_public_id=installation_public_id,
                )
                user = auth.user
            else:
                user = None
        return list_library_questions(
            db,
            scope=scope,
            user=user,
            category=category,
            search=search,
            origin_screen=origin_screen,
        )

    @app.get("/api/v1/me/favorites/questions", response_model=list[schemas.LibraryQuestionResponse])
    def get_my_favorite_questions(
        user_id: int | None = Query(default=None),
        installation_public_id: str | None = Query(default=None, max_length=36),
        category: str | None = Query(default=None),
        search: str | None = Query(default=None),
        origin_screen: schemas.OriginScreen | None = Query(default=None),
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Возвращает favorite reusable-вопросы текущего пользователя."""
        ensure_authenticated_identity_matches(
            auth,
            user_id=user_id,
            installation_public_id=installation_public_id,
        )
        return list_favorite_questions(
            db,
            user=auth.user,
            category=category,
            search=search,
            origin_screen=origin_screen,
        )

    @app.post("/api/v1/me/favorites/questions", response_model=schemas.LibraryQuestionResponse)
    def add_my_favorite_question(
        payload: schemas.FavoriteQuestionMutationRequest,
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Добавляет существующий reusable-вопрос в favorites или создаёт private reusable-копию."""
        ensure_authenticated_identity_matches(
            auth,
            user_id=payload.user_id,
            installation_public_id=payload.installation_public_id,
        )
        try:
            result = add_favorite_question(
                db,
                user=auth.user,
                source_question_public_id=payload.source_question_public_id,
                question_payload=payload.question.model_dump() if payload.question else None,
                origin_screen=payload.origin_screen,
            )
            db.commit()
            return result
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception:
            db.rollback()
            raise

    @app.delete("/api/v1/me/favorites/questions/{question_public_id}", status_code=204)
    def delete_my_favorite_question(
        question_public_id: str,
        user_id: int | None = Query(default=None),
        installation_public_id: str | None = Query(default=None, max_length=36),
        origin_screen: schemas.OriginScreen | None = Query(default=None),
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Удаляет reusable-вопрос из favorites текущего пользователя."""
        ensure_authenticated_identity_matches(
            auth,
            user_id=user_id,
            installation_public_id=installation_public_id,
        )
        removed = remove_favorite_question(
            db,
            user=auth.user,
            question_public_id=question_public_id,
            origin_screen=origin_screen,
        )
        if not removed:
            db.rollback()
            raise HTTPException(status_code=404, detail="Favorite question not found")
        db.commit()
        return Response(status_code=204)

    @app.get("/api/v1/templates/{template_public_id}/draft", response_model=schemas.TemplateDraftResponse)
    def get_template_draft(
        template_public_id: str,
        user_id: int | None = Query(default=None),
        installation_public_id: str | None = Query(default=None, max_length=36),
        origin_screen: schemas.OriginScreen | None = Query(default=None),
        db: Session = Depends(database.get_db),
        auth: AuthenticatedUserContext = Depends(get_current_authenticated_user),
    ):
        """Возвращает draft, восстановленный из шаблона, только для владельца шаблона."""
        ensure_authenticated_identity_matches(
            auth,
            user_id=user_id,
            installation_public_id=installation_public_id,
        )
        try:
            payload = get_template_draft_for_owner(
                db,
                template_public_id=template_public_id,
                user=auth.user,
                origin_screen=origin_screen,
            )
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        if payload is None:
            raise HTTPException(status_code=404, detail="Template not found")
        return payload
