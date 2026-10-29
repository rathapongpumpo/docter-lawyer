"""POST /v1/documents/render — lay out a finished letter as DOCX or PDF (FR-TPL-006). Stateless; never logs content."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.api.deps import request_id, require_service_token
from app.core.logging import log
from app.docgen.render import render_docx, render_pdf

router = APIRouter(prefix="/v1/documents", dependencies=[Depends(require_service_token)])

MEDIA = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


class RenderRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    lines: list[Annotated[str, Field(max_length=2000)]] = Field(max_length=400)
    footer: str = Field(default="", max_length=600)
    format: Literal["docx", "pdf"]


@router.post("/render")
async def render(body: RenderRequest, rid: Annotated[str, Depends(request_id)]) -> Response:
    fn = render_docx if body.format == "docx" else render_pdf
    data = await run_in_threadpool(fn, body.title, body.lines, body.footer)
    log.info("document_rendered", extra={"request_id": rid, "format": body.format, "lines": len(body.lines),
                                         "bytes": len(data)})
    return Response(data, media_type=MEDIA[body.format], headers={"Cache-Control": "no-store"})
