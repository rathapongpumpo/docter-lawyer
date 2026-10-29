import os

os.environ.setdefault("AI_SERVICE_TOKEN", "test-token-0123456789abcdef")
os.environ.setdefault("AI_SERVICE_TOKEN_PREVIOUS", "old-token-0123456789abcdef")
for _name in ("PNC_ENABLED", "PNC_PRIMARY", "PNC_ALLOW_ORG", "PNC_CHATBOT_URL", "PNC_CHATBOT_KEY"):
    os.environ.pop(_name, None)  # tests never reach the real company KB, whatever the container env says

import json  # noqa: E402
import uuid  # noqa: E402
from collections.abc import AsyncIterator  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.answer.extractive import Answer  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.repositories.chat_repo import ChatRef  # noqa: E402

TOKEN = os.environ["AI_SERVICE_TOKEN"]


class FakeChatRepo:
    """In-memory stand-in for PgChatRepository."""

    def __init__(self) -> None:
        self.chats: dict[uuid.UUID, dict] = {}
        self.messages: list[dict] = []
        self.retrieval_logs: list[dict] = []
        self.guardrail_events: list[dict] = []

    async def get_owned_chat(self, chat_id, user):
        c = self.chats.get(chat_id)
        if c and c["user_id"] == user.user_id and c["guest_id"] == user.guest_id:
            return ChatRef(chat_id, False, c["message_count"])
        return None

    async def create_chat(self, user, scope, explain_level, context_type, context_id):
        cid = uuid.uuid4()
        self.chats[cid] = {"user_id": user.user_id, "guest_id": user.guest_id, "org_id": user.org_id,
                           "title": "", "title_source": "auto", "message_count": 0}
        return ChatRef(cid, True, 0)

    async def add_user_message(self, chat_id, content, scope, explain_level):
        self.messages.append({"id": len(self.messages) + 1, "chat_id": chat_id, "role": "user",
                              "status": "completed", "content": content, "is_active": True})
        return len(self.messages)

    async def deactivate_last_answer(self, chat_id):
        for m in reversed(self.messages):
            if m["chat_id"] == chat_id and m["role"] == "assistant" and m["is_active"]:
                m["is_active"] = False
                return m["id"]
        return None

    async def message_parent(self, message_id):
        for m in self.messages:
            if m["id"] == message_id:
                return m.get("parent")
        return None

    async def add_assistant_message(self, chat_id, content, status, model, scope, explain_level, guardrail,
                                    supersedes, ttft_ms, latency_ms, extras=None):
        self.messages.append({"id": len(self.messages) + 1, "chat_id": chat_id, "role": "assistant",
                              "status": status, "content": content, "model": model, "is_active": True,
                              "guardrail": guardrail, "supersedes": supersedes, "extras": extras})
        return len(self.messages)

    async def log_retrieval(self, message_id, query_masked, filters, candidates, selected, latency_ms):
        self.retrieval_logs.append({"message_id": message_id, "query": query_masked, "filters": filters,
                                    "selected": selected})

    async def log_guardrail(self, chat_id, message_id, user, stage, verdict, category, detail):
        self.guardrail_events.append({"message_id": message_id, "stage": stage, "verdict": verdict,
                                      "category": category})

    async def touch_chat(self, chat_id, added_messages):
        self.chats[chat_id]["message_count"] += added_messages

    async def set_title(self, chat_id, title):
        c = self.chats[chat_id]
        if c["title_source"] != "auto":
            return False
        c["title"] = title
        return True


@pytest.fixture
def repo() -> FakeChatRepo:
    fake = FakeChatRepo()
    app.state.chat_repo = fake
    yield fake
    app.state.chat_repo = None


class StubAnswerer:
    """Stands in for ExtractiveAnswerer (no database or embedding service): a fixed, citation-free answer."""

    text = "ข้อความทดสอบสำหรับตรวจลำดับ event ของ stream ไม่ใช่เนื้อหากฎหมาย " * 4

    async def answer(self, query, *, locale, as_of, scope=()):
        return Answer(self.text, "no_evidence"), None


@pytest.fixture
def fast_settings():
    """No inter-chunk delay and a stub answerer installed on the app (tests override or clear it as needed)."""
    s = get_settings()
    old = s.answer_chunk_delay_seconds
    s.answer_chunk_delay_seconds = 0.0
    app.state.answerer = StubAnswerer()
    yield s
    app.state.answerer = None
    s.answer_chunk_delay_seconds = old


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ai") as c:
        yield c


def user_header(user_id: int | str = 42, locale: str = "th", **extra) -> dict[str, str]:
    return {"X-Service-Token": TOKEN,
            "X-LC-User": json.dumps({"user_id": str(user_id), "role": "member", "locale": locale, **extra})}


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.split("\n\n"):
        if not block or block.startswith(":"):
            continue
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        events.append((lines["event"], json.loads(lines["data"])))
    return events
