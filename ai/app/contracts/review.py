"""Contract review backends (M12, step 2): clauses in, per-clause findings and a summary of key terms out.

The review itself is done by a COMPANY REVIEW API (`http` backend). Until it exists, a deterministic `mock` backend stands in so
the whole flow can be built and tested. Rules that hold for every backend:

* the input is already PII-masked by the caller (app/guardrails/pii.py) — nothing here sees raw identifiers;
* nothing in this module logs or stores contract text; errors carry a code, never the text;
* the mock NEVER cites a law, a section number or a figure of its own: its notes are generic and its summary only quotes
  what the contract itself says (CLAUDE.md §2.1 rules 2, 6a, 6b).

Selection: CONTRACT_REVIEW_BACKEND = off (default) | mock | http | pnc. `mock` is refused when APP_ENV=prod, `http` needs
CONTRACT_REVIEW_URL and CONTRACT_REVIEW_KEY, `pnc` needs PNC_ENABLED + PNC_CHATBOT_URL + PNC_CHATBOT_KEY (the company chat API
of app/external/company_kb.py); in each case the feature stays off when its settings are missing (see `effective_backend`).
The `http` wire format is documented in docs/03-technical-spec.md §7.16. `pnc` asks ONE question per clause and keeps the free-text
answer as the finding note: no risk level (`unrated`), no citations, never a figure of our own.
"""

import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import Settings
from app.core.logging import log
from app.external import company_kb

RATED = ("high", "medium", "low", "none")
RISKS = (*RATED, "unrated")       # `unrated` = an answer without a risk level (pnc): neither a risk nor "nothing found"
SCHEMA_VERSION = 1
MAX_NOTE = 600          # characters kept per note / suggestion
MAX_TERM = 300          # characters kept per summary value
MAX_REQUEST_CHARS = 400_000
PNC_MAX_CLAUSES = 30             # clauses asked per review; the rest are reported as not checked
PNC_CONCURRENCY = 3
PNC_MAX_NOTE = 2000              # characters of an answer kept per clause
PNC_MAX_CLAUSE_CHARS = 1800      # clause text sent per question (the company API is used with messages of up to ~2,000 characters)
PNC_BUDGET_S = 600.0             # no new question is started after this; with the per-clause timeout it stays inside the 15-minute "lost review" limit
PREAMBLE = "ส่วนต้น"            # text before the first numbered clause (parties, recitals)
SUMMARY_KEYS = ("term", "payment", "termination", "penalty", "governing_law")


@dataclass(frozen=True)
class ClauseIn:
    clause_no: str
    heading: str
    text: str


@dataclass
class Finding:
    clause_no: str
    risk: str                       # high | medium | low | none | unrated
    note: str
    suggestion: str
    state: str = "answered"         # answered | no_answer (pnc: the company service gave nothing usable for this clause)


@dataclass
class Summary:
    parties: list[str] = field(default_factory=list)
    term: str | None = None
    payment: str | None = None
    termination: str | None = None
    penalty: str | None = None
    governing_law: str | None = None

    def as_json(self) -> dict[str, Any]:
        return {"parties": self.parties, **{k: getattr(self, k) for k in SUMMARY_KEYS}}


@dataclass
class ReviewResult:
    summary: Summary
    findings: list[Finding]
    not_checked: int = 0            # clauses left out because the contract is longer than the backend's limit (pnc)


class ReviewError(Exception):
    """A review that could not be produced. `code` is stored on the review row and mapped to a message by the web tier."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class ReviewBackend(Protocol):
    name: str

    def review(self, clauses: list[ClauseIn], *, request_id: str) -> ReviewResult: ...


def effective_backend(settings: Settings) -> str:
    """off | mock | http | pnc after the safety rules: unknown values, `mock` in prod and an unconfigured `http`/`pnc` all mean off."""
    mode = settings.contract_review_backend.strip().lower()
    if mode == "mock":
        if settings.app_env == "prod":
            log.warning("contract_review_mock_refused_in_prod")
            return "off"
        return "mock"
    if mode == "http":
        if settings.contract_review_url and settings.contract_review_key:
            return "http"
        log.warning("contract_review_http_not_configured")
    if mode == "pnc":
        if company_kb.configured(settings):
            return "pnc"
        log.warning("contract_review_pnc_not_configured")
    return "off"


def get_backend(settings: Settings, transport: httpx.BaseTransport | None = None) -> ReviewBackend | None:
    mode = effective_backend(settings)
    if mode == "mock":
        return MockBackend()
    if mode == "http":
        return HttpBackend(settings.contract_review_url, settings.contract_review_key, settings.contract_review_timeout_s, transport)
    if mode == "pnc":
        return PncBackend(settings, transport)
    return None


# ---------------------------------------------------------------- mock

def _has(text: str, *words: str) -> bool:
    return any(w in text for w in words)


@dataclass(frozen=True)
class _Rule:
    name: str
    applies: Any            # callable(text) -> bool
    risk: str
    note: str
    suggestion: str


_UNLIMITED = ("ไม่จำกัดความรับผิด", "ไม่จำกัดจำนวน", "ความเสียหายทั้งหมด", "ความเสียหายทุกประการ")
_CAP = ("ไม่เกิน", "สูงสุด", "เพดาน")
_DUE = ("ภายใน", "ภายในวันที่", "ทุกวันที่", "ทุกสิ้นเดือน", "งวดที่", "ตามงวด", "ครบกำหนด")

# Order matters only for ties: the highest risk wins, then the earlier rule. Wording is deliberately generic.
_RULES: tuple[_Rule, ...] = (
    _Rule("one_sided_change", lambda t: _has(t, "ฝ่ายเดียว") and _has(t, "แก้ไข", "เปลี่ยนแปลง", "ปรับเปลี่ยน", "ยกเลิก"), "high",
          "ข้อนี้ให้คู่สัญญาฝ่ายใดฝ่ายหนึ่งแก้ไขหรือเปลี่ยนเงื่อนไขได้ฝ่ายเดียว อาจทำให้ขาดความแน่นอนของสัญญา",
          "พิจารณาให้การแก้ไขต้องได้รับความตกลงเป็นหนังสือจากทั้งสองฝ่าย หรือกำหนดเงื่อนไขและการบอกกล่าวล่วงหน้าให้ชัดเจน"),
    _Rule("unlimited_liability", lambda t: _has(t, *_UNLIMITED) and _has(t, "รับผิด", "ชดใช้", "ค่าเสียหาย"), "high",
          "ข้อนี้อาจทำให้ความรับผิดชอบหรือการชดใช้ความเสียหายไม่มีขอบเขตจำกัด",
          "พิจารณากำหนดขอบเขตและเพดานความรับผิด รวมถึงประเภทความเสียหายที่ชดใช้ ให้สมดุลกับมูลค่าของงาน"),
    _Rule("immediate_termination", lambda t: _has(t, "เลิกสัญญา", "บอกเลิก", "ยกเลิกสัญญา", "ยกเลิกการจ้าง")
          and _has(t, "ทันที", "โดยไม่ต้องบอกกล่าว", "โดยไม่ต้องแจ้ง", "ฝ่ายเดียว"), "high",
          "ข้อนี้ให้เลิกสัญญาได้ทันทีหรือโดยไม่ต้องบอกกล่าวล่วงหน้า ฝ่ายที่ถูกเลิกอาจไม่มีโอกาสแก้ไขข้อบกพร่อง",
          "พิจารณากำหนดให้มีการบอกกล่าวเป็นหนังสือและระยะเวลาให้แก้ไขการผิดสัญญาก่อนเลิกสัญญา"),
    _Rule("penalty_no_cap", lambda t: _has(t, "ค่าปรับ", "เบี้ยปรับ") and not _has(t, *_CAP), "high",
          "ข้อนี้มีค่าปรับหรือเบี้ยปรับ แต่ไม่พบการกำหนดเพดานหรือขอบเขตสูงสุดที่ชัดเจนในข้อความ",
          "ตรวจอัตราและวิธีคำนวณค่าปรับ และพิจารณากำหนดเพดานสูงสุดที่สมเหตุสมผลกับมูลค่าสัญญา"),
    _Rule("penalty_capped", lambda t: _has(t, "ค่าปรับ", "เบี้ยปรับ"), "medium",
          "ข้อนี้มีค่าปรับหรือเบี้ยปรับ ควรตรวจว่าอัตราและเงื่อนไขการใช้สิทธิสมเหตุสมผลกับทั้งสองฝ่าย",
          "เทียบอัตราและเพดานค่าปรับกับมูลค่างานและความเสียหายที่อาจเกิดขึ้นจริง"),
    _Rule("auto_renew", lambda t: _has(t, "ต่ออายุ") and _has(t, "โดยอัตโนมัติ", "อัตโนมัติ"), "medium",
          "ข้อนี้ให้สัญญาต่ออายุโดยอัตโนมัติ อาจผูกพันต่อไปหากไม่ได้บอกเลิกภายในกำหนด",
          "จดวันครบกำหนดและระยะเวลาแจ้งไม่ต่ออายุ หรือพิจารณาให้การต่ออายุต้องตกลงกันใหม่เป็นหนังสือ"),
    _Rule("liability", lambda t: _has(t, "รับผิดชอบ", "ชดใช้", "ค่าเสียหาย", "ค่าสินไหม", "ชดเชย"), "medium",
          "ข้อนี้กำหนดความรับผิดหรือการชดใช้ความเสียหาย ควรตรวจขอบเขตและเงื่อนไขว่าเป็นธรรมกับทั้งสองฝ่าย",
          "ตรวจว่ามีการกำหนดขอบเขต ประเภทความเสียหาย และขั้นตอนการเรียกร้องไว้ชัดเจนหรือไม่"),
    _Rule("termination", lambda t: _has(t, "เลิกสัญญา", "บอกเลิก", "ยกเลิกสัญญา", "สิ้นสุดสัญญา"), "medium",
          "ข้อนี้กำหนดเงื่อนไขการเลิกหรือสิ้นสุดสัญญา ควรตรวจว่าระยะเวลาบอกกล่าวและผลของการเลิกชัดเจนสำหรับทั้งสองฝ่าย",
          "ตรวจว่ากำหนดเหตุเลิกสัญญา ระยะเวลาบอกกล่าว และการจัดการงานหรือเงินที่ค้างอยู่เมื่อเลิกสัญญาไว้ครบถ้วน"),
    _Rule("payment_unclear", lambda t: _has(t, "ชำระ", "ค่าจ้าง", "ค่าสินค้า", "ราคา", "วางบิล") and not _has(t, *_DUE), "medium",
          "ข้อนี้เกี่ยวกับการชำระเงิน แต่ไม่พบกำหนดเวลาชำระที่ชัดเจนในข้อความ",
          "พิจารณาระบุกำหนดชำระ วิธีชำระ และผลของการชำระล่าช้าให้ชัดเจน"),
    _Rule("payment", lambda t: _has(t, "ชำระ", "ค่าจ้าง", "ค่าสินค้า", "ราคา", "วางบิล"), "low",
          "ข้อนี้กำหนดการชำระเงินและมีกำหนดเวลาระบุไว้ ควรตรวจให้ตรงกับที่ตกลงกันจริง",
          "ตรวจจำนวนเงิน กำหนดเวลา และเอกสารที่ต้องใช้ประกอบการชำระให้ตรงกับข้อตกลง"),
    _Rule("ip", lambda t: _has(t, "ทรัพย์สินทางปัญญา", "ลิขสิทธิ์", "เครื่องหมายการค้า", "สิทธิบัตร"), "low",
          "ข้อนี้เกี่ยวกับความเป็นเจ้าของหรือการใช้ทรัพย์สินทางปัญญา ควรตรวจว่าตรงกับเจตนาของคู่สัญญา",
          "ตรวจว่าสิทธิในงานที่ส่งมอบเป็นของฝ่ายใด และมีข้อจำกัดการนำไปใช้ต่ออย่างไร"),
    _Rule("confidential", lambda t: _has(t, "ความลับ", "ข้อมูลลับ"), "low",
          "ข้อนี้เกี่ยวกับการรักษาความลับ ควรตรวจขอบเขตของข้อมูลและระยะเวลาที่ต้องรักษาความลับ",
          "ตรวจว่านิยามข้อมูลลับ ข้อยกเว้น และระยะเวลาผูกพันชัดเจนหรือไม่"),
    _Rule("forum", lambda t: _has(t, "ศาล", "อนุญาโตตุลาการ", "กฎหมายที่ใช้บังคับ", "กฎหมายไทย"), "low",
          "ข้อนี้กำหนดกฎหมายที่ใช้บังคับหรือวิธีระงับข้อพิพาท ควรตรวจว่าสะดวกและเหมาะสมกับองค์กร",
          "ตรวจว่าสถานที่หรือวิธีระงับข้อพิพาทที่กำหนดเหมาะสมกับองค์กรของท่าน"),
)
_NO_FINDING = ("ไม่พบประเด็นที่น่ากังวลตามเกณฑ์ตรวจเบื้องต้นของระบบจำลอง", "")
_RANK = {r: i for i, r in enumerate(RISKS)}   # high=0 … none=3

_COMPANY = re.compile(r"(?:บริษัท|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ)\s*[^\s,()/]{1,40}(?:\s+[^\s,()/]{1,30}){0,2}?\s*(?:จำกัด\s*\(มหาชน\)|จำกัด)")
_TERM = ("ระยะเวลา", "มีอายุ", "มีผลบังคับ", "ตั้งแต่วันที่")
_PAYMENT = ("ชำระเงิน", "ชำระค่า", "ค่าจ้าง", "ค่าสินค้า", "งวด")
_TERMINATION = ("เลิกสัญญา", "บอกเลิก", "ยกเลิกสัญญา")
_PENALTY = ("ค่าปรับ", "เบี้ยปรับ")
_LAW = ("กฎหมายไทย", "กฎหมายแห่งประเทศไทย", "ศาล", "อนุญาโตตุลาการ", "กฎหมายที่ใช้บังคับ")


def _sentences(text: str) -> list[str]:
    parts = re.split(r"[\n\r]+|(?<=[.;])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _quote(clauses: list[ClauseIn], words: tuple[str, ...]) -> str | None:
    """The first sentence of the contract that mentions one of `words`, as written (trimmed) — a quotation, never a rewrite."""
    for c in clauses:
        sentences = _sentences(c.text)
        if sentences and _has(c.heading, *words):          # the clause is about it: its first sentence says what it provides
            return f"{c.clause_no}: {sentences[0]}"[:MAX_TERM]
        for s in sentences:
            if _has(s, *words):
                return f"{c.clause_no}: {s}"[:MAX_TERM]
    return None


class MockBackend:
    """Deterministic keyword heuristics. Same input → same output; nothing leaves the process."""

    name = "mock"

    def review(self, clauses: list[ClauseIn], *, request_id: str = "") -> ReviewResult:
        return ReviewResult(self._summary(clauses), [self._finding(c) for c in clauses])

    @staticmethod
    def _finding(c: ClauseIn) -> Finding:
        if c.clause_no == "ส่วนต้น":                       # text before the first numbered clause: parties, recitals
            return Finding(c.clause_no, "none", _NO_FINDING[0], _NO_FINDING[1])
        text = f"{c.heading}\n{c.text}"
        hits = [r for r in _RULES if r.applies(text)]
        if not hits:
            return Finding(c.clause_no, "none", *_NO_FINDING)
        best = min(hits, key=lambda r: _RANK[r.risk])      # min() keeps the earliest rule on a tie
        return Finding(c.clause_no, best.risk, best.note, best.suggestion)

    @staticmethod
    def _summary(clauses: list[ClauseIn]) -> Summary:
        parties: list[str] = []
        for c in clauses[:3]:
            for m in _COMPANY.finditer(c.text):
                name = re.sub(r"\s+", " ", m.group()).strip()
                if name not in parties:
                    parties.append(name[:120])
        return Summary(parties[:4], _quote(clauses, _TERM), _quote(clauses, _PAYMENT), _quote(clauses, _TERMINATION),
                       _quote(clauses, _PENALTY), _quote(clauses, _LAW))


# ---------------------------------------------------------------- pnc (company chat API, one question per clause)

PNC_PROMPT = ("ช่วยประเมินความเสี่ยงของข้อสัญญาต่อไปนี้ และแนะนำวิธีแก้ไขสั้น ๆ "
              "ตอบเป็นภาษาไทย ไม่เกิน 8 บรรทัด ไม่ต้องมีคำนำ")
PNC_TRUNCATED = "\n\n_(ตรวจจากข้อความช่วงแรกของข้อนี้เท่านั้น เพราะข้อยาวเกินกว่าจะส่งทั้งหมด)_"


def pnc_question(c: ClauseIn) -> str:
    title = f"{c.clause_no} {c.heading}".strip()
    return f"{PNC_PROMPT}\n\n{title}\n{c.text[:PNC_MAX_CLAUSE_CHARS]}"


class PncBackend:
    """Asks the company chat API (app/external/company_kb.py) about each clause: PII-masked text only, up to PNC_CONCURRENCY calls
    at a time, the first PNC_MAX_CLAUSES clauses. The answer text becomes the finding note, `unrated`: the API gives no level,
    no sources and no figures we could check. A clause with no usable answer (error, timeout, "not found") is a finding with
    state `no_answer`; only when no clause got an answer is the review itself an error."""

    name = "pnc"

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None,
                 budget_s: float = PNC_BUDGET_S):
        self.settings, self.transport, self.budget_s = settings, transport, budget_s

    def review(self, clauses: list[ClauseIn], *, request_id: str = "") -> ReviewResult:
        todo = [c for c in clauses if c.text.strip() and not (c.clause_no == PREAMBLE and len(clauses) > 1)]
        asked, not_checked = todo[:PNC_MAX_CLAUSES], max(0, len(todo) - PNC_MAX_CLAUSES)
        deadline = time.monotonic() + self.budget_s
        stop = threading.Event()          # set on an auth error: the key is wrong, the remaining questions would fail the same way
        timeout = self.settings.contract_review_timeout_s
        durations: list[int] = []         # milliseconds per question (no text): shows how slow the company API is
        with httpx.Client(timeout=timeout, transport=self.transport) as client:
            def one(c: ClauseIn) -> tuple[str, str]:
                started = time.monotonic()
                out = ask(c)
                durations.append(int((time.monotonic() - started) * 1000))
                return out

            def ask(c: ClauseIn) -> tuple[str, str]:
                """("ok", answer) | ("none", "") for a "not found" reply | ("error", code)."""
                if stop.is_set() or time.monotonic() > deadline:
                    return ("error", "REVIEW_TIMEOUT")
                try:
                    r = client.post(**company_kb.request_args(self.settings, pnc_question(c), max_chars=PNC_MAX_CLAUSE_CHARS + 400))
                except httpx.TimeoutException:
                    return ("error", "REVIEW_TIMEOUT")
                except httpx.HTTPError:
                    return ("error", "REVIEW_UNAVAILABLE")
                if r.status_code in (401, 403):
                    stop.set()
                    return ("error", "REVIEW_AUTH")
                if r.status_code == 429:
                    return ("error", "REVIEW_BUSY")
                if r.status_code in (408, 504):
                    return ("error", "REVIEW_TIMEOUT")
                if r.status_code >= 400:
                    return ("error", "REVIEW_UNAVAILABLE")
                try:
                    text = company_kb.useful_answer(r.json())
                except ValueError:
                    return ("error", "REVIEW_BAD_RESPONSE")
                return ("ok", text) if text else ("none", "")

            with ThreadPoolExecutor(max_workers=PNC_CONCURRENCY) as pool:
                outcomes = list(pool.map(one, asked))
        findings: list[Finding] = []
        for c, (kind, value) in zip(asked, outcomes, strict=True):
            if kind == "ok":
                note = value[:PNC_MAX_NOTE]
                if len(c.text) > PNC_MAX_CLAUSE_CHARS:
                    note += PNC_TRUNCATED
                findings.append(Finding(c.clause_no, "unrated", note, ""))
            else:
                findings.append(Finding(c.clause_no, "unrated", "", "", state="no_answer"))
        answered = sum(1 for k, _ in outcomes if k == "ok")
        errors = Counter(v for k, v in outcomes if k == "error")
        log.info("contract_review_pnc", extra={"request_id": request_id, "asked": len(asked), "answered": answered,
                                               "errors": dict(errors), "not_checked": not_checked,
                                               "max_call_ms": max(durations, default=0),
                                               "avg_call_ms": sum(durations) // max(len(durations), 1)})
        if answered == 0:
            if stop.is_set():
                raise ReviewError("REVIEW_AUTH")
            raise ReviewError(errors.most_common(1)[0][0] if errors else "REVIEW_NO_ANSWER")
        return ReviewResult(Summary(), findings, not_checked)


# ---------------------------------------------------------------- http

class HttpBackend:
    """POSTs the masked clauses to the company review API (schema: docs/03-technical-spec.md §7.16)."""

    name = "http"

    def __init__(self, url: str, key: str, timeout_s: float, transport: httpx.BaseTransport | None = None):
        self.url, self.key, self.timeout_s, self.transport = url, key, timeout_s, transport

    def review(self, clauses: list[ClauseIn], *, request_id: str = "") -> ReviewResult:
        payload = {"schema_version": SCHEMA_VERSION, "language": "th", "request_id": request_id,
                   "clauses": [{"clause_no": c.clause_no, "heading": c.heading, "text": c.text} for c in clauses]}
        if sum(len(c.text) + len(c.heading) for c in clauses) > MAX_REQUEST_CHARS:
            raise ReviewError("REVIEW_TOO_LARGE")
        try:
            with httpx.Client(timeout=self.timeout_s, transport=self.transport) as client:
                r = client.post(self.url, json=payload, headers={"Authorization": f"Bearer {self.key}"})
        except httpx.TimeoutException as exc:
            raise ReviewError("REVIEW_TIMEOUT") from exc
        except httpx.HTTPError as exc:
            raise ReviewError("REVIEW_UNAVAILABLE") from exc
        if r.status_code in (401, 403):
            raise ReviewError("REVIEW_AUTH")
        if r.status_code == 429:
            raise ReviewError("REVIEW_BUSY")
        if r.status_code in (408, 504):
            raise ReviewError("REVIEW_TIMEOUT")
        if r.status_code >= 400:
            raise ReviewError("REVIEW_UNAVAILABLE")
        try:
            return parse_response(r.json(), {c.clause_no for c in clauses})
        except (ValueError, TypeError, AttributeError) as exc:
            raise ReviewError("REVIEW_BAD_RESPONSE") from exc


def _s(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def parse_response(body: Any, known_clauses: set[str]) -> ReviewResult:
    """Validate the API answer. Findings for clauses we did not send are dropped; an unknown risk level is a bad response."""
    if not isinstance(body, dict) or not isinstance(body.get("findings"), list):
        raise ValueError("findings missing")
    raw = body.get("summary") if isinstance(body.get("summary"), dict) else {}
    parties = raw.get("parties") if isinstance(raw.get("parties"), list) else []
    summary = Summary([_s(p, 120) for p in parties if _s(p, 120)][:6],
                      **{k: (_s(raw.get(k), MAX_TERM) or None) for k in SUMMARY_KEYS})
    findings: list[Finding] = []
    for f in body["findings"]:
        if not isinstance(f, dict):
            raise ValueError("finding is not an object")
        risk = str(f.get("risk", "")).strip().lower()
        if risk not in RATED:
            raise ValueError("unknown risk")
        no = _s(f.get("clause_no"), 80)
        if no in known_clauses:
            findings.append(Finding(no, risk, _s(f.get("note"), MAX_NOTE), _s(f.get("suggestion"), MAX_NOTE)))
    return ReviewResult(summary, findings)
