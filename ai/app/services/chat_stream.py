"""Chat turn orchestration → SSE event stream (docs/03-technical-spec.md §1.3, §3.4, §4.2).

Answers are assembled verbatim from the knowledge base (extractive engine, no LLM); the company chatbot API is an
optional labelled supplement (app/external/company_kb.py).
The producer runs as its own task so heartbeats keep flowing while it waits, and so a client
disconnect can still persist the partial answer with status 'stopped'.
"""

import asyncio
import time
import unicodedata
from collections.abc import AsyncIterator
from datetime import date, datetime
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from app.answer.extractive import Answer, tx
from app.core.config import Settings
from app.core.logging import log
from app.external import company_kb
from app.guardrails.pii import mask_pii
from app.guardrails.triage import safety_triage
from app.i18n import ERRORS, UNAVAILABLE, pick, status_text
from app.kb.thai import format_date
from app.repositories.chat_repo import AnswerExtras, ChatRef, ChatRepository
from app.schemas import ChatStreamRequest, UserContext
from app.sse import HEARTBEAT, sse_event

TITLE_MAX = 40
STREAM_PIECE = 24  # characters per chunk event when streaming a composed answer
EXTRACTIVE_MODEL = "kb-extractive"
BANGKOK = ZoneInfo("Asia/Bangkok")
_DONE = object()


_THAI_LEADING_VOWELS = "เแโใไ"


def make_title(message: str) -> str:
    """First line of the question, capped at TITLE_MAX without splitting a Thai syllable."""
    one_line = " ".join(message.split())
    if len(one_line) <= TITLE_MAX:
        return one_line
    cut = TITLE_MAX - 1
    space = one_line.rfind(" ", 0, cut + 1)
    if space >= TITLE_MAX // 2:
        cut = space
    else:
        # never separate a base consonant from its vowel/tone marks, nor leave a dangling leading vowel
        while cut > 0 and unicodedata.category(one_line[cut]) == "Mn":
            cut -= 1
        while cut > 0 and one_line[cut - 1] in _THAI_LEADING_VOWELS:
            cut -= 1
    return one_line[:cut].rstrip() + "…"


def stream_pieces(text: str, size: int = STREAM_PIECE) -> list[str]:
    """Split for streaming without separating Thai combining marks from their base character."""
    pieces: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        while end < len(text) and unicodedata.category(text[end]) == "Mn":
            end += 1
        pieces.append(text[start:end])
        start = end
    return pieces


class Answerer(Protocol):
    async def answer(self, query: str, *, locale: str, as_of: date) -> tuple[Any, Any]: ...


def today_bangkok() -> date:
    return datetime.now(BANGKOK).date()


class ChatTurn:
    """One request → one assistant answer. Emits (event, data) tuples onto a queue."""

    def __init__(self, repo: ChatRepository, settings: Settings, req: ChatStreamRequest,
                 user: UserContext, chat: ChatRef | None, request_id: str, answerer: Answerer | None = None) -> None:
        self.repo = repo
        self.settings = settings
        self.req = req
        self.user = user
        self.chat = chat
        self.request_id = request_id
        self.answerer = answerer
        self.locale = user.locale
        self.scope: list[str] = [] if req.scope == "auto" else list(req.scope)
        self.explain_level = req.explain_level or user.explain_level
        self.queue: asyncio.Queue[Any] = asyncio.Queue()
        self.partial: list[str] = []
        self.finished = False
        self.superseded: int | None = None
        self.user_message_id: int | None = None
        self.model = EXTRACTIVE_MODEL
        self.notice: dict[str, Any] | None = None
        self.started = time.monotonic()
        self.ttft_ms: int | None = None

    def emit(self, event: str, data: Any) -> None:
        self.queue.put_nowait((event, data))

    def status(self, name: str) -> None:
        self.emit("status", {"status": name, "text": status_text(name, self.locale)})

    async def run(self) -> None:
        try:
            await self._run()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("chat_turn_failed", extra={"request_id": self.request_id})
            self.emit("error", {"error": pick(ERRORS["internal"], self.locale)})
        finally:
            self.queue.put_nowait(_DONE)

    async def _run(self) -> None:
        req, repo = self.req, self.repo
        if self.chat is None:
            ctx = req.context
            self.chat = await repo.create_chat(self.user, self.scope, self.explain_level,
                                               ctx.source_type if ctx else None, ctx.source_id if ctx else None)
            self.emit("chat_id", {"chat_id": str(self.chat.id)})
        chat = self.chat

        added = 0
        if req.regenerate:
            self.superseded = await repo.deactivate_last_answer(chat.id)
            if self.superseded is not None:  # the new answer belongs to the same question as the one it replaces
                self.user_message_id = await repo.message_parent(self.superseded)
        else:
            self.user_message_id = await repo.add_user_message(chat.id, req.message, self.scope, self.explain_level)
            added += 1

        self.status("analyzing")
        masked = mask_pii(req.message)
        safety = safety_triage(req.message)
        if safety:
            self.notice = safety.notice(self.locale)
            self.emit("safety_notice", self.notice)

        if self.answerer is None:
            await self._unavailable(added, safety)
            return

        as_of = req.as_of or today_bangkok()
        if company_kb.primary(self.settings, org_workspace=self.user.org_id is not None):
            if (answer := await self._company_kb_primary(masked.text, as_of)) is not None:
                await self._complete(answer, None, masked, safety, as_of, added)
                return
        self.status("retrieving")
        answer, retrieval = await self.answerer.answer(masked.text, locale=self.locale, as_of=as_of, scope=self.scope)
        await self._maybe_company_kb(answer, masked.text)
        await self._complete(answer, retrieval, masked, safety, as_of, added)

    async def _company_kb_primary(self, masked_text: str, as_of: date) -> Answer | None:
        """PNC_PRIMARY: the company KB answers first. None (error, timeout, "not found") = fall back to our library."""
        self.status("retrieving")
        self._pnc_tried = True
        ext = await company_kb.ask(self.settings, masked_text, request_id=self.request_id)
        if ext is None:
            return None
        self.model = ext.model or "company-kb"
        closing = tx("closing", self.locale, date=format_date(as_of, self.locale))
        return Answer(
            text=company_kb.primary_text(ext, closing), mode="company_kb", model=self.model,
            verification={"engine": "company_kb", "mode": "company_kb", "issues": ["external_kb_uncited"],
                          "external_kb": {"model": ext.model, "duration_ms": ext.duration_ms, "primary": True}},
            verification_status="warned")  # no citation exists: logged as an unverified section for the reviewers

    async def _maybe_company_kb(self, answer: Any, masked_text: str) -> None:
        """When our library has nothing, add the company knowledge base's answer as a labelled, unverified block."""
        if getattr(self, "_pnc_tried", False):
            return  # PNC_PRIMARY already asked it this turn; do not ask twice
        if answer.mode not in ("no_evidence", "out_of_scope") or not company_kb.enabled(
                self.settings, org_workspace=self.user.org_id is not None):
            return
        self.status("retrieving")
        ext = await company_kb.ask(self.settings, masked_text, request_id=self.request_id)
        if ext is None:
            return
        answer.text = company_kb.append_block(answer.text, ext, self.locale)
        answer.verification = {**(answer.verification or {"engine": "extractive", "mode": answer.mode}),
                               "external_kb": {"model": ext.model, "duration_ms": ext.duration_ms},
                               "issues": ["external_kb_uncited"]}
        answer.verification_status = "warned"  # logged as an unverified section for the reviewers

    async def _complete(self, answer: Any, retrieval: Any, masked: Any, safety: Any, as_of: date, added: int) -> None:
        """Send the tail of a finished answer (citations, suggestions), persist it and its logs, close the stream."""
        repo, chat = self.repo, self.chat
        assert chat is not None
        self.status("generating")
        for piece in stream_pieces(answer.text):
            if self.ttft_ms is None:
                self.ttft_ms = self._elapsed_ms()
            self.partial.append(piece)
            self.emit("chunk", {"text": piece})
            if self.settings.answer_chunk_delay_seconds:
                await asyncio.sleep(self.settings.answer_chunk_delay_seconds)
        self.status("verifying")

        verification = {**(answer.verification or {"engine": "extractive", "mode": answer.mode}),
                        "draft_sources": answer.draft_sources, "pii_types": masked.pii_types,
                        "retrieval_degraded": bool(retrieval and retrieval.degraded)}
        if answer.model:
            self.model = answer.model

        text, status = "".join(self.partial), "completed"
        suggestions = answer.suggestions()
        self.emit("citations", {"items": [c.sse() for c in answer.citations]})
        self.emit("suggestions", suggestions)

        extras = AnswerExtras(
            suggestions=suggestions, safety_notice=self.notice, verification=verification,
            verification_status=answer.verification_status or "passed", citations=answer.citations,
            parent_message_id=self.user_message_id)
        message_id = await repo.add_assistant_message(
            chat.id, text, status, self.model, self.scope, self.explain_level, None, self.superseded,
            self.ttft_ms, self._elapsed_ms(), extras)
        await repo.touch_chat(chat.id, added + 1)
        if retrieval is not None:
            await repo.log_retrieval(message_id, masked.text,
                                     {"scope": self.scope, "as_of": as_of.isoformat(),
                                      "drafts": self.settings.kb_serve_drafts, "mode": answer.mode},
                                     [h.log_row() for h in retrieval.hits[:40]], answer.selected_chunk_ids,
                                     retrieval.latency_ms)
        if safety:
            await repo.log_guardrail(chat.id, message_id, self.user, "input", "flagged", f"safety.{safety.category}",
                                     {"severity": "high" if safety.level == "urgent" else "medium",
                                      "detector": "keyword"})
        if answer.verification_status in ("warned", "failed"):
            await repo.log_guardrail(chat.id, message_id, self.user, "output", "flagged", "unverified_section",
                                     {"issues": verification.get("issues", [])})
        self.finished = True
        self.emit("complete", {"status": "completed", "message_id": message_id,
                               "usage": {"input_tokens": 0, "output_tokens": 0}})
        await self._title(chat, masked.text)

    async def _unavailable(self, added: int, safety: Any) -> None:
        assert self.chat is not None
        texts = UNAVAILABLE.get(self.locale) or UNAVAILABLE["th"]
        guardrail = {"kind": "unavailable", "stage": "input", "title": texts["title"], "text": texts["text"],
                     "reason": None}
        self.emit("guardrail", guardrail)
        message_id = await self.repo.add_assistant_message(
            self.chat.id, "", "error", "none", self.scope, self.explain_level, guardrail, self.superseded,
            None, self._elapsed_ms(), AnswerExtras(safety_notice=self.notice,
                                                   parent_message_id=self.user_message_id))
        await self.repo.touch_chat(self.chat.id, added + 1)
        self.finished = True
        self.emit("complete", {"status": "completed", "message_id": message_id,
                               "usage": {"input_tokens": 0, "output_tokens": 0}})

    async def _title(self, chat: ChatRef, text: str) -> None:
        if chat.is_new and not self.req.regenerate:
            title = make_title(text)  # masked text: titles must not carry PII (§4.8)
            if await self.repo.set_title(chat.id, title):
                self.emit("title_update", {"chat_id": str(chat.id), "title": title})

    async def persist_stopped(self) -> None:
        """Client went away mid-answer: keep what was generated, marked 'stopped'."""
        if self.finished or self.chat is None or not self.partial:
            return
        try:
            await self.repo.add_assistant_message(
                self.chat.id, "".join(self.partial), "stopped", self.model, self.scope, self.explain_level,
                None, self.superseded, self.ttft_ms, self._elapsed_ms(),
                AnswerExtras(safety_notice=self.notice, parent_message_id=self.user_message_id))
            await self.repo.touch_chat(self.chat.id, 1)
        except Exception:
            log.exception("persist_stopped_failed", extra={"request_id": self.request_id})

    def _elapsed_ms(self) -> int:
        return int((time.monotonic() - self.started) * 1000)


async def stream_turn(turn: ChatTurn, heartbeat_seconds: float) -> AsyncIterator[str]:
    """Run the turn in a task and relay its events as SSE, with `: ping` heartbeats while idle."""
    task = asyncio.create_task(turn.run())
    try:
        while True:
            try:
                item = await asyncio.wait_for(turn.queue.get(), timeout=heartbeat_seconds)
            except TimeoutError:
                yield HEARTBEAT
                continue
            if item is _DONE:
                break
            event, data = item
            yield sse_event(event, data)
        await task
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            # Shield so the partial answer is saved even though our own task is being cancelled.
            await asyncio.shield(turn.persist_stopped())
        log.info("chat_turn_end", extra={
            "request_id": turn.request_id,
            "chat_id": str(turn.chat.id) if turn.chat else None,
            "finished": turn.finished,
            "answer_chars": sum(len(p) for p in turn.partial),
            "elapsed_ms": turn._elapsed_ms(),
        })
