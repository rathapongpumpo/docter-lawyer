"""PromptNow company knowledge base as a labelled, unverified supplement (app/external/company_kb.py)."""

import json
from types import SimpleNamespace

import httpx

from app.answer.extractive import Answer
from app.core.config import Settings
from app.external import company_kb
from app.services.chat_stream import ChatTurn


def settings(**over) -> Settings:
    base = dict(ai_service_token="x" * 20, pnc_enabled=True, pnc_chatbot_url="https://kb.example/chat",
                pnc_chatbot_key="k-secret")
    return Settings(**{**base, **over})


def transport(answer: str, seen: list | None = None, status: int = 200) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append((request.headers.get("authorization"), json.loads(request.content)))
        return httpx.Response(status, json={"answer": answer, "model": "PDPA_Pilot",
                                            "usage": {"input_tokens": 10, "output_tokens": 5}})
    return httpx.MockTransport(handler)


def test_disabled_by_default_and_never_for_organization_workspaces_unless_allowed(monkeypatch):
    for name in ("PNC_ENABLED", "PNC_CHATBOT_URL", "PNC_CHATBOT_KEY", "PNC_ALLOW_ORG", "PNC_PRIMARY"):
        monkeypatch.delenv(name, raising=False)  # the container env may switch the feature on
    assert not company_kb.enabled(Settings(ai_service_token="x" * 20), org_workspace=False)
    assert company_kb.enabled(settings(), org_workspace=False)
    assert not company_kb.enabled(settings(), org_workspace=True)
    assert company_kb.enabled(settings(pnc_allow_org=True), org_workspace=True)
    assert not company_kb.enabled(settings(pnc_chatbot_key=""), org_workspace=False)


async def test_sends_only_the_message_with_the_bearer_key_and_returns_the_answer():
    seen: list = []
    ext = await company_kb.ask(settings(), "คำถามที่ปกปิดแล้ว", request_id="r1", transport=transport("คำตอบ", seen))
    assert seen == [("Bearer k-secret", {"message": "คำถามที่ปกปิดแล้ว"})]
    assert ext and ext.text == "คำตอบ" and ext.model == "PDPA_Pilot" and ext.output_tokens == 5


async def test_a_not_found_answer_an_error_or_a_timeout_adds_nothing():
    nf = "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องกับเรื่องนี้ในฐานข้อมูลที่มีอยู่\n\nรบกวนระบุเพิ่มเติม"
    assert await company_kb.ask(settings(), "q", request_id="r", transport=transport(nf)) is None
    assert await company_kb.ask(settings(), "q", request_id="r", transport=transport("x", status=500)) is None
    assert await company_kb.ask(settings(), "q", request_id="r", transport=transport("")) is None

    def boom(_request):
        raise httpx.ConnectTimeout("slow")
    assert await company_kb.ask(settings(), "q", request_id="r", transport=httpx.MockTransport(boom)) is None


def fake_turn(**over):
    base = dict(settings=settings(), user=SimpleNamespace(org_id=None), request_id="r", locale="th",
                status=lambda name: None)
    return SimpleNamespace(**{**base, **over})


async def test_chat_turn_appends_a_labelled_block_only_when_the_library_has_nothing(monkeypatch):
    async def fake_ask(*_a, **_k):
        return company_kb.ExternalAnswer("ข้อมูลจากบริษัท", "PDPA_Pilot", 1, 1, 5)
    monkeypatch.setattr(company_kb, "ask", fake_ask)

    empty = Answer("ยังไม่พบข้อมูล", "no_evidence")
    await ChatTurn._maybe_company_kb(fake_turn(), empty, "q")
    assert "ไม่มีแหล่งอ้างอิงแนบมา" in empty.text and empty.text.endswith("ข้อมูลจากบริษัท")
    assert empty.verification_status == "warned" and empty.verification["issues"] == ["external_kb_uncited"]
    assert empty.citations == []  # never invents a citation

    covered = Answer("คำตอบจากบทความ", "article")
    await ChatTurn._maybe_company_kb(fake_turn(), covered, "q")
    assert covered.text == "คำตอบจากบทความ" and covered.verification_status is None

    org = Answer("ยังไม่พบข้อมูล", "no_evidence")
    turn = fake_turn()
    turn.user = SimpleNamespace(org_id="some-org")
    await ChatTurn._maybe_company_kb(turn, org, "q")
    assert org.text == "ยังไม่พบข้อมูล"


async def test_primary_mode_answers_from_the_company_kb_and_falls_back_to_the_library(monkeypatch):
    from datetime import date
    calls: list[str] = []

    async def fake_ask(*_a, **_k):
        calls.append("ask")
        return company_kb.ExternalAnswer("คำตอบจากบริษัท", "Lawyer AI", 1, 1, 5)
    monkeypatch.setattr(company_kb, "ask", fake_ask)
    turn = fake_turn(settings=settings(pnc_primary=True))
    ans = await ChatTurn._company_kb_primary(turn, "q", date(2026, 10, 1))
    assert ans and ans.mode == "company_kb" and ans.citations == [] and ans.model == "Lawyer AI"
    assert ans.text.startswith("คำตอบจากบริษัท") and "ไม่มีแหล่งอ้างอิงแนบมา" not in ans.text  # no label in primary mode
    assert "ข้อมูล ณ วันที่" in ans.text and "ไม่ใช่คำปรึกษา" in ans.text  # as-of + disclaimer still present
    assert ans.verification_status == "warned" and ans.verification["external_kb"]["primary"] is True

    # the supplement hook must not ask a second time in the same turn
    lib = Answer("ยังไม่พบข้อมูล", "no_evidence")
    await ChatTurn._maybe_company_kb(turn, lib, "q")
    assert calls == ["ask"] and lib.text == "ยังไม่พบข้อมูล"

    async def failing(*_a, **_k):
        return None  # error / timeout / "not found"
    monkeypatch.setattr(company_kb, "ask", failing)
    assert await ChatTurn._company_kb_primary(fake_turn(settings=settings(pnc_primary=True)), "q",
                                              date(2026, 10, 1)) is None


def test_primary_mode_is_off_by_default_and_never_for_organization_workspaces():
    assert not company_kb.primary(settings(), org_workspace=False)
    assert company_kb.primary(settings(pnc_primary=True), org_workspace=False)
    assert not company_kb.primary(settings(pnc_primary=True), org_workspace=True)
    assert not company_kb.primary(settings(pnc_primary=True, pnc_enabled=False), org_workspace=False)
