"""PromptNow company legal knowledge base (chatbot API): a supplementary source for questions our library cannot answer.

The API takes one message and returns one free-text answer, with no citations and no sources. It is therefore never
treated as evidence: its text is shown only in a clearly labelled block, only when our library found nothing
(no_evidence / out_of_scope), the turn is logged as an unverified-section warning, and the block says plainly that no
source came with it (CLAUDE.md §2.1 rules 2, 3, 6a).

Privacy: only the PII-masked question leaves this service; nothing is sent for organization workspaces (their data
stays inside the tenant boundary, rule 6c) unless PNC_ALLOW_ORG=true; the request and answer text are never logged.
"""

import re
import time
from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.core.logging import log

MAX_CHARS = 6000
# The API answers "ขออภัย ไม่พบข้อมูล…" when its own knowledge base has nothing: not worth showing.
_NOT_FOUND = re.compile(r"^\s*(ขออภัย|ขอโทษ|ไม่พบข้อมูล|ไม่สามารถ)[^\n]{0,40}(ไม่พบ|ไม่มีข้อมูล)", re.I)

LABEL = {
    "th": ("**ข้อมูลเพิ่มเติมจากฐานความรู้ของบริษัท (PromptNow)**\n\n"
           "> ส่วนนี้มาจากระบบภายนอกนิติมิตร **ไม่มีแหล่งอ้างอิงแนบมา** และยังไม่ผ่านผู้ตรวจเนื้อหา "
           "โปรดตรวจกับตัวบทหรือปรึกษาผู้เชี่ยวชาญก่อนนำไปใช้\n\n"),
    "en": ("**Additional information from the company knowledge base (PromptNow)**\n\n"
           "> This part comes from a system outside Nitimitr, **with no source attached**, and has not been reviewed. "
           "Check it against the law or ask a professional before relying on it.\n\n"),
}


@dataclass
class ExternalAnswer:
    text: str
    model: str | None
    input_tokens: int
    output_tokens: int
    duration_ms: int


def configured(settings: Settings) -> bool:
    """The company API is switched on and has its URL and key (chat supplement and contract review `pnc` backend)."""
    return bool(settings.pnc_enabled and settings.pnc_chatbot_url and settings.pnc_chatbot_key)


def enabled(settings: Settings, *, org_workspace: bool) -> bool:
    if not configured(settings):
        return False
    return settings.pnc_allow_org or not org_workspace


def primary(settings: Settings, *, org_workspace: bool) -> bool:
    """True when the company KB is asked first (PNC_PRIMARY) and may be used for this user."""
    return settings.pnc_primary and enabled(settings, org_workspace=org_workspace)


def request_args(settings: Settings, message: str, *, max_chars: int = 2000) -> dict:
    """Keyword arguments for `post`: the only things that go over the wire are the message and the Bearer key."""
    return {"url": settings.pnc_chatbot_url, "json": {"message": message[:max_chars]},
            "headers": {"Authorization": f"Bearer {settings.pnc_chatbot_key}"}}


def useful_answer(body: object) -> str:
    """The answer text of a response body, or "" when it is empty, malformed or a "not found" reply."""
    text = str(body.get("answer") or "").strip() if isinstance(body, dict) else ""
    return "" if _NOT_FOUND.match(text) else text


async def ask(settings: Settings, masked_question: str, *, request_id: str,
              transport: httpx.AsyncBaseTransport | None = None) -> ExternalAnswer | None:
    """One call; a failure or an empty / "not found" answer returns None (the chat then answers without it)."""
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.pnc_timeout_s, transport=transport) as client:
            r = await client.post(**request_args(settings, masked_question))
        r.raise_for_status()
        body = r.json()
        text = str(body.get("answer") or "").strip()
        usage = body.get("usage") or {}
    except Exception as exc:
        log.warning("company_kb_unavailable", extra={"request_id": request_id, "error": type(exc).__name__})
        return None
    ms = int((time.perf_counter() - started) * 1000)
    useful = bool(text) and not _NOT_FOUND.match(text)   # same rule as useful_answer()
    log.info("company_kb_call", extra={"request_id": request_id, "useful": useful, "duration_ms": ms,
                                       "answer_chars": len(text), "model": body.get("model")})
    if not useful:
        return None
    return ExternalAnswer(text[:MAX_CHARS], body.get("model"), int(usage.get("input_tokens") or 0),
                          int(usage.get("output_tokens") or 0), ms)


def primary_text(ext: ExternalAnswer, closing: str) -> str:
    """The whole answer when the company KB is primary: its text, then as-of + disclaimer (no source label)."""
    return f"{ext.text}\n\n---\n\n_{closing}_"


def append_block(answer_text: str, ext: ExternalAnswer, locale: str) -> str:
    return f"{answer_text.rstrip()}\n\n---\n\n{LABEL.get(locale, LABEL['th'])}{ext.text}"
