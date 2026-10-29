import json

import pytest

from app.api.deps import parse_user_context, token_matches
from app.core.config import get_settings
from app.sse import sse_event
from tests.conftest import TOKEN


def test_sse_event_is_single_line_json_and_keeps_thai() -> None:
    out = sse_event("chunk", {"text": "บรรทัดแรก\nบรรทัดสอง"})
    assert out.startswith("event: chunk\ndata: ")
    assert out.endswith("\n\n")
    data_line = out.split("\n")[1]
    assert json.loads(data_line[len("data: "):]) == {"text": "บรรทัดแรก\nบรรทัดสอง"}
    assert "บรรทัดแรก" in data_line  # ensure_ascii=False
    assert out.count("\n") == 3      # event line, data line, blank line


def test_token_matches_current_and_previous_only() -> None:
    s = get_settings()
    assert token_matches(TOKEN, s)
    assert token_matches(s.ai_service_token_previous, s)
    assert not token_matches("wrong-token", s)
    assert not token_matches(None, s)
    assert not token_matches("", s)


@pytest.mark.parametrize("raw", [
    None, "", "not json", '{"role":"member"}',                        # no owner
    '{"user_id":"42","guest_id":"6f1c0c1e-7d7e-4b8a-9d57-0c7e3b1b5a10"}',  # both owners
    '{"user_id":"abc"}', '{"user_id":"1","locale":"fr"}',
    '{"guest_id":"6f1c0c1e-7d7e-4b8a-9d57-0c7e3b1b5a10","org_id":"6f1c0c1e-7d7e-4b8a-9d57-0c7e3b1b5a11"}',
])
def test_user_context_rejects_invalid(raw) -> None:
    with pytest.raises(Exception) as exc:
        parse_user_context(raw)
    assert getattr(exc.value, "status_code", None) == 400


def test_user_context_accepts_string_ids() -> None:
    u = parse_user_context('{"user_id":"42","role":"member","locale":"en","is_anonymous":false,"org_id":null}')
    assert u.user_id == 42 and u.locale == "en" and u.org_id is None


async def test_stream_requires_service_token(client, repo) -> None:
    r = await client.post("/v1/chat/stream", json={"message": "hi"},
                          headers={"X-LC-User": '{"user_id":"1"}'})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_healthz(client) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
