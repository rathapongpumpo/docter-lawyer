"""Request dependencies: service-token auth, user context, repository."""

import hmac
import json
import uuid
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.repositories.chat_repo import ChatRepository, PgChatRepository
from app.schemas import UserContext


def api_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def token_matches(given: str | None, settings: Settings) -> bool:
    if not given:
        return False
    candidates = [settings.ai_service_token, settings.ai_service_token_previous]
    ok = False
    for expected in candidates:
        if expected:
            # compare every candidate so timing does not reveal which one matched
            ok |= hmac.compare_digest(given.encode(), expected.encode())
    return ok


def require_service_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_service_token: Annotated[str | None, Header()] = None,
) -> None:
    if not token_matches(x_service_token, settings):
        raise api_error(401, "unauthorized", "invalid service token")


def parse_user_context(raw: str | None) -> UserContext:
    if not raw:
        raise api_error(400, "missing_user", "X-LC-User header is required")
    try:
        return UserContext.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError, TypeError):
        raise api_error(400, "invalid_user", "X-LC-User header is invalid") from None


def user_context(x_lc_user: Annotated[str | None, Header()] = None) -> UserContext:
    return parse_user_context(x_lc_user)


def request_id(x_request_id: Annotated[str | None, Header()] = None) -> str:
    return (x_request_id or str(uuid.uuid4()))[:64]


def chat_repository(request: Request) -> ChatRepository:
    override = getattr(request.app.state, "chat_repo", None)
    if override is not None:
        return override  # type: ignore[no-any-return]
    return PgChatRepository(request.app.state.pool)


def answerer(request: Request) -> Any:
    """ExtractiveAnswerer built at startup (app.main.lifespan); tests may set app.state.answerer to a fake."""
    return getattr(request.app.state, "answerer", None)

