"""POST /v1/kb/search — hybrid search over the knowledge library for /library/search (FR-KB-009/010)."""

import re
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.api.deps import api_error, request_id, require_service_token
from app.core.config import Settings, get_settings
from app.core.logging import log
from app.rag.tokens import tokenize

router = APIRouter(prefix="/v1/kb", dependencies=[Depends(require_service_token)])

# A semantic-only hit below this cosine score is noise for a browse-style search (chat uses stricter bars).
DENSE_MIN = 0.45
KINDS = ("article", "guide", "template", "glossary", "law_section")


class SearchRequest(BaseModel):
    q: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=20, ge=1, le=40)
    kinds: list[str] = Field(default_factory=list, max_length=len(KINDS))
    scope: list[str] = Field(default_factory=list, max_length=18)


class SearchResult(BaseModel):
    kind: str
    title: str
    heading: str | None
    snippet: str
    url: str
    status: str | None
    exact: bool


class SearchResponse(BaseModel):
    results: list[SearchResult]
    terms: list[str]  # query tokens, so the page can highlight them in the snippets
    missing_sections: list[str]  # "ccc 1336/1" the user asked for that the library does not have
    degraded: bool


def _snippet(content: str, terms: list[str]) -> str:
    text = re.sub(r"\s+", " ", content).strip()
    if len(text) <= 220:
        return text
    pos = min((i for t in terms if (i := text.find(t)) >= 0), default=0)
    start = max(0, pos - 60)
    return ("…" if start else "") + text[start:start + 220].strip() + "…"


@router.post("/search", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    rid: Annotated[str, Depends(request_id)],
) -> SearchResponse:
    engine = getattr(request.app.state, "answerer", None)
    if engine is None:
        raise api_error(503, "search_unavailable", "search is not available")
    kinds = [k for k in body.kinds if k in KINDS]
    r = await engine.retriever.search(body.q, as_of=date.today(), include_drafts=settings.kb_serve_drafts,
                                      scope=body.scope)
    terms = tokenize(body.q)
    results: list[SearchResult] = []
    seen: set[str] = set()
    for h in r.hits:  # already ranked: pinned exact sections first, then reciprocal-rank fusion
        if kinds and h.source_type not in kinds:
            continue
        if not h.pinned and h.lexical is None and (h.dense or 0.0) < DENSE_MIN:
            continue
        md: dict[str, Any] = h.metadata or {}
        url = md.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        title = md.get("doc_title") or h.title
        heading = md.get("heading")
        results.append(SearchResult(kind=h.source_type, title=title, heading=heading if heading != title else None,
                                    snippet=_snippet(h.content, terms), url=url, status=md.get("status"),
                                    exact=h.pinned))
        if len(results) >= body.limit:
            break

    found = {(str(h.metadata.get("law_code")), str(h.metadata.get("section_no"))) for h in r.hits if h.pinned}
    missing = [f"{code or ''} {sec}".strip() for code, sec in r.requested_sections
               if not any(sec == s and (code is None or code == c) for c, s in found)]
    log.info("kb_search", extra={"request_id": rid, "query_chars": len(body.q), "results": len(results),
                                 "missing_sections": len(missing), "degraded": r.degraded})
    return SearchResponse(results=results, terms=terms, missing_sections=missing, degraded=r.degraded)
