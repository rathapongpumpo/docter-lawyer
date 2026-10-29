"""Contract review backends (app/contracts/review.py): the deterministic mock, the http client and backend selection."""

import json

import httpx
import pytest

from app.contracts import review
from app.contracts.review import ClauseIn, MockBackend, ReviewError


def settings(**over):
    from app.core.config import Settings
    return Settings(**{"ai_service_token": "x" * 20, **over})


CLAUSES = [
    ClauseIn("ส่วนต้น", "", 'สัญญานี้ทำระหว่าง บริษัท เอ็กซ์ก่อสร้าง จำกัด กับ บริษัท วายเทค จำกัด'),
    ClauseIn("ข้อ 1", "ระยะเวลาสัญญา", "สัญญานี้มีผลบังคับตั้งแต่วันที่ลงนามและมีอายุหนึ่งปี"),
    ClauseIn("ข้อ 2", "การชำระเงิน", "ผู้ว่าจ้างชำระค่าจ้างภายใน 30 วันนับแต่วันรับใบแจ้งหนี้"),
    ClauseIn("ข้อ 3", "ค่าปรับ", "หากส่งมอบล่าช้า ผู้รับจ้างยอมให้ปรับวันละ 20,000 บาท"),
    ClauseIn("ข้อ 4", "การเลิกสัญญา", "ผู้ว่าจ้างมีสิทธิบอกเลิกสัญญาทันทีโดยไม่ต้องบอกกล่าว"),
    ClauseIn("ข้อ 5", "กฎหมายที่ใช้บังคับ", "สัญญานี้อยู่ภายใต้กฎหมายไทย ศาลไทยมีเขตอำนาจ"),
    ClauseIn("ข้อ 6", "ทั่วไป", "คู่สัญญาตกลงให้ใช้ภาษาไทยในการติดต่อ"),
]


def test_mock_is_deterministic_and_covers_every_clause_in_order():
    a = MockBackend().review(CLAUSES, request_id="1")
    b = MockBackend().review(CLAUSES, request_id="2")
    assert a == b
    assert [f.clause_no for f in a.findings] == [c.clause_no for c in CLAUSES]


def test_mock_risk_levels_follow_the_keywords():
    risk = {f.clause_no: f.risk for f in MockBackend().review(CLAUSES).findings}
    assert risk["ส่วนต้น"] == "none"
    assert risk["ข้อ 2"] == "low"          # payment with a due period
    assert risk["ข้อ 3"] == "high"         # penalty without any cap in the text
    assert risk["ข้อ 4"] == "high"         # immediate termination without notice
    assert risk["ข้อ 5"] == "low"
    assert risk["ข้อ 6"] == "none"


def test_a_capped_penalty_is_only_medium_and_unclear_payment_is_flagged():
    out = MockBackend().review([ClauseIn("ข้อ 1", "ค่าปรับ", "ค่าปรับวันละ 1,000 บาท แต่ไม่เกินร้อยละ 10 ของค่าจ้าง"),
                                ClauseIn("ข้อ 2", "ชำระเงิน", "ผู้ว่าจ้างจะชำระค่าจ้างให้ผู้รับจ้าง")]).findings
    assert [f.risk for f in out] == ["medium", "medium"]


def test_mock_never_cites_law_or_invents_figures_in_notes():
    for f in MockBackend().review(CLAUSES).findings:
        text = f.note + f.suggestion
        assert "มาตรา" not in text and not any(ch.isdigit() for ch in text), text
        assert f.risk == "none" or (f.note and f.suggestion)


def test_mock_summary_quotes_the_contract_and_leaves_unknowns_empty():
    s = MockBackend().review(CLAUSES).summary
    assert s.parties == ["บริษัท เอ็กซ์ก่อสร้าง จำกัด", "บริษัท วายเทค จำกัด"]
    assert s.payment and "30 วัน" in s.payment
    assert s.penalty and "20,000" in s.penalty
    assert s.termination and s.termination.startswith("ข้อ 4:")
    assert s.governing_law and "กฎหมายไทย" in s.governing_law
    empty = MockBackend().review([ClauseIn("ข้อ 1", "", "ตกลงกัน")]).summary
    assert empty.parties == [] and empty.payment is None and empty.penalty is None and empty.governing_law is None


def test_selection_off_by_default_mock_refused_in_prod_http_needs_url_and_key(monkeypatch):
    for name in ("CONTRACT_REVIEW_BACKEND", "CONTRACT_REVIEW_URL", "CONTRACT_REVIEW_KEY"):
        monkeypatch.delenv(name, raising=False)
    assert review.get_backend(settings()) is None
    assert isinstance(review.get_backend(settings(contract_review_backend="mock")), MockBackend)
    assert review.get_backend(settings(contract_review_backend="mock", app_env="prod", kb_serve_drafts=False)) is None
    assert review.get_backend(settings(contract_review_backend="http")) is None
    assert review.get_backend(settings(contract_review_backend="http", contract_review_url="https://r.example/x")) is None
    assert review.get_backend(settings(contract_review_backend="bogus")) is None
    http = review.get_backend(settings(contract_review_backend="http", contract_review_url="https://r.example/x",
                                       contract_review_key="k", app_env="prod", kb_serve_drafts=False))
    assert isinstance(http, review.HttpBackend)


def http_backend(handler):
    return review.HttpBackend("https://r.example/review", "k-secret", 5, httpx.MockTransport(handler))


def ok_body(**over):
    body = {"summary": {"parties": ["บริษัท เอ จำกัด"], "term": "1 ปี", "payment": None, "termination": "30 วัน",
                        "penalty": "", "governing_law": "กฎหมายไทย"},
            "findings": [{"clause_no": "ข้อ 3", "risk": "HIGH", "note": "n", "suggestion": "s"},
                         {"clause_no": "ข้อ 99", "risk": "low", "note": "unknown clause", "suggestion": ""}]}
    return {**body, **over}


def test_http_sends_masked_clauses_with_bearer_and_parses_the_answer():
    seen: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.headers["authorization"], request.headers["content-type"], json.loads(request.content)))
        return httpx.Response(200, json=ok_body())

    result = http_backend(handler).review(CLAUSES, request_id="42")
    auth, ctype, body = seen[0]
    assert auth == "Bearer k-secret" and ctype == "application/json"
    assert body["schema_version"] == 1 and body["request_id"] == "42" and body["language"] == "th"
    assert body["clauses"][3] == {"clause_no": "ข้อ 3", "heading": "ค่าปรับ", "text": CLAUSES[3].text}
    assert [(f.clause_no, f.risk) for f in result.findings] == [("ข้อ 3", "high")]     # case folded, unknown clause dropped
    assert result.summary.parties == ["บริษัท เอ จำกัด"] and result.summary.term == "1 ปี"
    assert result.summary.payment is None and result.summary.penalty is None


@pytest.mark.parametrize(("status", "code"), [(401, "REVIEW_AUTH"), (403, "REVIEW_AUTH"), (429, "REVIEW_BUSY"), (504, "REVIEW_TIMEOUT"),
                                              (500, "REVIEW_UNAVAILABLE"), (404, "REVIEW_UNAVAILABLE")])
def test_http_status_codes_map_to_error_codes(status, code):
    with pytest.raises(ReviewError) as e:
        http_backend(lambda _r: httpx.Response(status, json={})).review(CLAUSES)
    assert e.value.code == code


def test_http_timeouts_connection_errors_and_bad_bodies_are_errors_without_the_text():
    def slow(_r):
        raise httpx.ReadTimeout("slow")

    def down(_r):
        raise httpx.ConnectError("refused")

    with pytest.raises(ReviewError) as e:
        http_backend(slow).review(CLAUSES)
    assert e.value.code == "REVIEW_TIMEOUT"
    with pytest.raises(ReviewError) as e:
        http_backend(down).review(CLAUSES)
    assert e.value.code == "REVIEW_UNAVAILABLE"
    for bad in ({"summary": {}}, {"findings": "x"}, {"findings": [{"clause_no": "ข้อ 1", "risk": "critical"}]}, {"findings": ["x"]}):
        with pytest.raises(ReviewError) as e:
            http_backend(lambda _r, b=bad: httpx.Response(200, json=b)).review(CLAUSES)
        assert e.value.code == "REVIEW_BAD_RESPONSE"
    with pytest.raises(ReviewError) as e:
        http_backend(lambda _r: httpx.Response(200, content=b"not json")).review(CLAUSES)
    assert e.value.code == "REVIEW_BAD_RESPONSE"


def test_http_refuses_an_oversized_request_before_sending():
    sent: list = []
    big = [ClauseIn("ข้อ 1", "", "ก" * (review.MAX_REQUEST_CHARS + 1))]
    with pytest.raises(ReviewError) as e:
        http_backend(lambda r: sent.append(r) or httpx.Response(200, json=ok_body())).review(big)
    assert e.value.code == "REVIEW_TOO_LARGE" and not sent


# ---------------------------------------------------------------- pnc (company chat API, one question per clause)

import threading  # noqa: E402
import time  # noqa: E402

KEY = "k-secret-pnc"


def pnc_settings(**over):
    return settings(**{"contract_review_backend": "pnc", "pnc_enabled": True, "pnc_chatbot_url": "https://kb.example/chat",
                       "pnc_chatbot_key": KEY, "contract_review_timeout_s": 5, **over})


def pnc_backend(handler, **over):
    return review.PncBackend(pnc_settings(**over), httpx.MockTransport(handler))


def answer_for_all(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"answer": "**ความเสี่ยง** สูง\n- ข้อ ก\n- ข้อ ข", "model": "x"})


def test_pnc_selection_needs_the_switch_url_and_key_and_is_allowed_in_prod(monkeypatch):
    for name in ("PNC_ENABLED", "PNC_CHATBOT_URL", "PNC_CHATBOT_KEY", "CONTRACT_REVIEW_BACKEND"):
        monkeypatch.delenv(name, raising=False)
    assert review.get_backend(settings(contract_review_backend="pnc")) is None
    assert review.get_backend(pnc_settings(pnc_enabled=False)) is None
    assert review.get_backend(pnc_settings(pnc_chatbot_key="")) is None
    assert review.get_backend(pnc_settings(pnc_chatbot_url="")) is None
    assert isinstance(review.get_backend(pnc_settings()), review.PncBackend)
    assert isinstance(review.get_backend(pnc_settings(app_env="prod", kb_serve_drafts=False)), review.PncBackend)


def test_pnc_asks_one_question_per_clause_with_the_key_and_keeps_answers_unrated():
    seen: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.headers["authorization"], json.loads(request.content)))
        return answer_for_all(request)

    result = pnc_backend(handler).review(CLAUSES, request_id="7")
    assert len(seen) == len(CLAUSES) - 1                       # the preamble is not a clause
    assert all(auth == f"Bearer {KEY}" and list(body) == ["message"] for auth, body in seen)
    messages = [body["message"] for _, body in seen]
    assert all(m.startswith(review.PNC_PROMPT) for m in messages)
    assert any("ข้อ 3 ค่าปรับ" in m and "วันละ 20,000 บาท" in m for m in messages)
    assert [f.clause_no for f in result.findings] == [c.clause_no for c in CLAUSES[1:]]
    for f in result.findings:
        assert f.risk == "unrated" and f.state == "answered" and f.suggestion == "" and f.note.startswith("**ความเสี่ยง**")
    assert result.summary == review.Summary() and result.not_checked == 0


def test_pnc_a_clause_without_a_usable_answer_is_a_finding_not_an_error():
    def handler(request: httpx.Request) -> httpx.Response:
        text = json.loads(request.content)["message"]
        if "ข้อ 1 " in text:
            return httpx.Response(200, json={"answer": "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้อง"})
        if "ข้อ 2 " in text:
            raise httpx.ReadTimeout("slow")
        if "ข้อ 3 " in text:
            return httpx.Response(500, json={})
        return answer_for_all(request)

    result = pnc_backend(handler).review(CLAUSES)
    by = {f.clause_no: f for f in result.findings}
    for no in ("ข้อ 1", "ข้อ 2", "ข้อ 3"):
        assert by[no].state == "no_answer" and by[no].risk == "unrated" and by[no].note == ""
    assert by["ข้อ 4"].state == "answered" and by["ข้อ 4"].note


def test_pnc_all_clauses_failing_is_a_review_error_with_a_code():
    def code_for(handler):
        with pytest.raises(ReviewError) as e:
            pnc_backend(handler).review(CLAUSES)
        return e.value.code

    def timeout(_r):
        raise httpx.ReadTimeout("slow")

    assert code_for(timeout) == "REVIEW_TIMEOUT"
    assert code_for(lambda _r: httpx.Response(503, json={})) == "REVIEW_UNAVAILABLE"
    assert code_for(lambda _r: httpx.Response(429, json={})) == "REVIEW_BUSY"
    assert code_for(lambda _r: httpx.Response(200, content=b"not json")) == "REVIEW_BAD_RESPONSE"
    assert code_for(lambda _r: httpx.Response(200, json={"answer": "ขออภัย ไม่พบข้อมูลในระบบ"})) == "REVIEW_NO_ANSWER"


def test_pnc_a_wrong_key_stops_asking():
    calls: list = []

    def handler(r: httpx.Request) -> httpx.Response:
        calls.append(r)
        return httpx.Response(401, json={})

    many = [ClauseIn(f"ข้อ {i}", "", f"เนื้อหาข้อ {i}") for i in range(1, 21)]
    with pytest.raises(ReviewError) as e:
        pnc_backend(handler).review(many)
    assert e.value.code == "REVIEW_AUTH"
    assert len(calls) <= review.PNC_CONCURRENCY + 1            # the pool stops after the first rejections


def test_pnc_asks_only_the_first_30_clauses_and_reports_the_rest():
    seen: list = []
    many = [ClauseIn(f"ข้อ {i}", "", f"เนื้อหาข้อที่ {i}") for i in range(1, 36)]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["message"])
        return answer_for_all(request)

    result = pnc_backend(handler).review(many)
    assert len(seen) == 30 and len(result.findings) == 30 and result.not_checked == 5
    assert result.findings[-1].clause_no == "ข้อ 30"


def test_pnc_concurrency_is_bounded_at_three():
    lock, running, peak = threading.Lock(), [0], [0]

    def handler(request: httpx.Request) -> httpx.Response:
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        time.sleep(0.05)
        with lock:
            running[0] -= 1
        return answer_for_all(request)

    many = [ClauseIn(f"ข้อ {i}", "", f"เนื้อหาข้อที่ {i}") for i in range(1, 13)]
    pnc_backend(handler).review(many)
    assert 1 < peak[0] <= 3


def test_pnc_the_overall_budget_stops_new_questions():
    sent: list = []
    many = [ClauseIn(f"ข้อ {i}", "", f"เนื้อหาข้อที่ {i}") for i in range(1, 7)]

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(1)
        time.sleep(0.06)
        return answer_for_all(request)

    backend = review.PncBackend(pnc_settings(), httpx.MockTransport(handler), budget_s=0.03)
    result = backend.review(many)
    assert len(sent) < len(many)
    assert any(f.state == "no_answer" for f in result.findings) and any(f.state == "answered" for f in result.findings)


def test_pnc_long_answers_and_long_clauses_are_capped_and_marked():
    long_clause = ClauseIn("ข้อ 1", "", "ก" * (review.PNC_MAX_CLAUSE_CHARS + 500))
    sent: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content)["message"])
        return httpx.Response(200, json={"answer": "ข" * 5000})

    f = pnc_backend(handler).review([long_clause]).findings[0]
    assert len(sent[0]) <= review.PNC_MAX_CLAUSE_CHARS + 400
    assert f.note.startswith("ข" * review.PNC_MAX_NOTE) and "ช่วงแรกของข้อนี้" in f.note


def test_pnc_a_contract_without_numbered_clauses_still_asks_about_its_text():
    seen: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(1)
        return answer_for_all(request)

    out = pnc_backend(handler).review([ClauseIn("ส่วนต้น", "", "ข้อความทั้งฉบับ")])
    assert len(seen) == 1 and out.findings[0].clause_no == "ส่วนต้น"


def test_pnc_sends_only_what_it_is_given_and_never_logs_the_key_or_text(caplog):
    # the worker masks every clause before any backend (worker.jobs.review_contract); the backend must forward exactly that text
    from app.guardrails.pii import mask_pii

    raw = "ติดต่อ 081-234-5678 หรือ somchai@example.com เลขบัตร 1101700230708"
    masked = ClauseIn("ข้อ 1", mask_pii("หัวข้อ").text, mask_pii(raw).text)
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.content.decode())
        return answer_for_all(request)

    with caplog.at_level("DEBUG"):
        pnc_backend(handler).review([masked], request_id="9")
    wire = seen[0]
    for secret in ("081-234-5678", "somchai@example.com", "1101700230708"):
        assert secret not in wire
    logged = " ".join(r.getMessage() + str(r.__dict__) for r in caplog.records)
    assert KEY not in logged and "ข้อ 1" not in logged and "ติดต่อ" not in logged and "ความเสี่ยง" not in logged
