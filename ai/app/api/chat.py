"""POST /v1/chat/stream — one chat turn as a Server-Sent Events stream (§3.5.2)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import (
    answerer,
    api_error,
    chat_repository,
    request_id,
    require_service_token,
    user_context,
)
from app.core.config import Settings, get_settings
from app.core.logging import log
from app.repositories.chat_repo import ChatRepository
from app.schemas import ChatStreamRequest, UserContext
from app.services.chat_stream import ChatTurn, stream_turn
from app.sse import SSE_HEADERS

router = APIRouter(prefix="/v1", dependencies=[Depends(require_service_token)])


@router.post("/chat/stream")
async def chat_stream(
    body: ChatStreamRequest,
    user: Annotated[UserContext, Depends(user_context)],
    repo: Annotated[ChatRepository, Depends(chat_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
    rid: Annotated[str, Depends(request_id)],
    engine: Annotated[object, Depends(answerer)],
) -> StreamingResponse:
    # Ownership and regenerate preconditions fail as plain JSON before the stream starts.
    chat = None
    if body.chat_id is not None:
        chat = await repo.get_owned_chat(body.chat_id, user)
        if chat is None:
            raise api_error(404, "chat_not_found", "chat not found")
    elif body.regenerate:
        raise api_error(422, "regenerate_requires_chat", "regenerate requires chat_id")

    log.info("chat_turn_start", extra={
        "request_id": rid, "chat_id": str(body.chat_id) if body.chat_id else None,
        "user_id": user.user_id, "guest": user.guest_id is not None, "message_chars": len(body.message),
        "regenerate": body.regenerate,
    })
    turn = ChatTurn(repo, settings, body, user, chat, rid, engine)  # type: ignore[arg-type]
    return StreamingResponse(stream_turn(turn, settings.heartbeat_seconds),
                             media_type="text/event-stream; charset=utf-8", headers=SSE_HEADERS)
