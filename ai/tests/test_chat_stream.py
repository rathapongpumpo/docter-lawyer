import uuid

from app.main import app
from app.services.chat_stream import make_title
from tests.conftest import StubAnswerer, parse_sse, user_header


async def test_new_chat_stream_event_order(client, repo, fast_settings) -> None:
    r = await client.post("/v1/chat/stream", json={"message": "ส่งงานช้า 15 วัน ลูกค้าจะหักค่าปรับ"},
                          headers=user_header())
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["x-accel-buffering"] == "no"
    events = parse_sse(r.text)
    names = [e for e, _ in events]

    assert names[0] == "chat_id"
    statuses = [d["status"] for e, d in events if e == "status"]
    assert statuses == ["analyzing", "retrieving", "generating", "verifying"]
    assert names.count("chunk") >= 5
    # fixed tail order: citations → suggestions → complete → title_update
    assert names[-4:] == ["citations", "suggestions", "complete", "title_update"]

    chat_id = uuid.UUID(events[0][1]["chat_id"])
    answer = "".join(d["text"] for e, d in events if e == "chunk")
    assert answer == StubAnswerer.text

    complete = dict(events)["complete"]
    assert complete["status"] == "completed" and isinstance(complete["message_id"], int)
    assert dict(events)["title_update"]["chat_id"] == str(chat_id)

    roles = [(m["role"], m["status"]) for m in repo.messages]
    assert roles == [("user", "completed"), ("assistant", "completed")]
    assert repo.chats[chat_id]["message_count"] == 2
    assert repo.chats[chat_id]["title"]


async def test_existing_chat_has_no_chat_id_or_title_events(client, repo, fast_settings) -> None:
    first = parse_sse((await client.post("/v1/chat/stream", json={"message": "hello"},
                                         headers=user_header(locale="en"))).text)
    chat_id = first[0][1]["chat_id"]
    events = parse_sse((await client.post("/v1/chat/stream", json={"message": "again", "chat_id": chat_id},
                                          headers=user_header(locale="en"))).text)
    names = [e for e, _ in events]
    assert "chat_id" not in names and "title_update" not in names
    assert names[-1] == "complete"
    assert [d["text"] for e, d in events if e == "status"][0] == "Analyzing your question…"


async def test_regenerate_supersedes_previous_answer(client, repo, fast_settings) -> None:
    first = parse_sse((await client.post("/v1/chat/stream", json={"message": "q"}, headers=user_header())).text)
    chat_id = first[0][1]["chat_id"]
    await client.post("/v1/chat/stream", json={"message": "q", "chat_id": chat_id, "regenerate": 1},
                      headers=user_header())
    users = [m for m in repo.messages if m["role"] == "user"]
    answers = [m for m in repo.messages if m["role"] == "assistant"]
    assert len(users) == 1 and len(answers) == 2
    assert answers[0]["is_active"] is False and answers[1]["supersedes"] == answers[0]["id"]


async def test_foreign_chat_is_404_before_streaming(client, repo, fast_settings) -> None:
    first = parse_sse((await client.post("/v1/chat/stream", json={"message": "q"}, headers=user_header(1))).text)
    chat_id = first[0][1]["chat_id"]
    r = await client.post("/v1/chat/stream", json={"message": "q", "chat_id": chat_id}, headers=user_header(2))
    assert r.status_code == 404 and r.json()["error"]["code"] == "chat_not_found"


async def test_validation_errors_are_json(client, repo) -> None:
    r = await client.post("/v1/chat/stream", json={"message": "   "}, headers=user_header())
    assert r.status_code == 422
    r = await client.post("/v1/chat/stream", json={"message": "x" * 4001}, headers=user_header())
    assert r.status_code == 422
    r = await client.post("/v1/chat/stream", json={"message": "x", "regenerate": 1}, headers=user_header())
    assert r.status_code == 422 and r.json()["error"]["code"] == "regenerate_requires_chat"


async def test_answerer_unavailable_emits_guardrail(client, repo, fast_settings) -> None:
    app.state.answerer = None  # knowledge-base search not started
    events = parse_sse((await client.post("/v1/chat/stream", json={"message": "q"}, headers=user_header())).text)
    names = [e for e, _ in events]
    assert names == ["chat_id", "status", "guardrail", "complete"]
    assert dict(events)["guardrail"]["kind"] == "unavailable"
    assert repo.messages[-1]["status"] == "error"


def test_make_title_single_line_and_capped() -> None:
    assert make_title("  สวัสดี\nครับ  ") == "สวัสดี ครับ"
    long = "ก" * 100
    t = make_title(long)
    assert len(t) == 40 and t.endswith("…")


def test_make_title_does_not_split_thai_syllables() -> None:
    title = make_title("ส่งงานช้า ลูกค้าจะหักค่าปรับวันละ 2 หมื่น ต้องจ่ายเต็มไหม")
    assert title.endswith("…")
    body = title[:-1]
    assert not body.endswith("หมื")  # tone mark must stay with its syllable
    assert len(body) <= 39


def test_make_title_backs_off_combining_marks_without_spaces() -> None:
    title = make_title("ก" * 38 + "ที่" + "ข" * 10)
    assert title == "ก" * 38 + "…"
