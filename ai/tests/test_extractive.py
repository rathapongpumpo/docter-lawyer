from datetime import date

import pytest

from app.answer.extractive import Answer, Citation, ExtractiveAnswerer
from app.core.config import get_settings
from app.main import app
from app.rag.retrieve import Hit, Retrieval
from app.repositories.kb_repo import DocRow, SectionRow
from tests.conftest import parse_sse, user_header

AS_OF = date(2026, 9, 29)
ARTICLE_MD = """# ส่งงานช้าแล้วโดนปรับ

## สรุปสั้น
- ค่าปรับคือ "เบี้ยปรับ" [[law:ccc:379]]
- ต้องสงวนสิทธิไว้ในเวลารับ [[law:ccc:381#p3]] [[law:ccc:379]]

## ต้องทำอย่างไร
- [ ] เก็บสัญญา (`contract`)
- ดู [[guide:respond-to-penalty-deduction]] (slug `x`)

## ฐานกฎหมาย
[[law:ccc:379]] [[law:ccc:381]]
"""


def section(sid: int, no: str, status: str = "draft") -> SectionRow:
    return SectionRow(sid, "ccc", no, f"ตัวบทมาตรา {no}\n\nวรรคสอง", None, "https://example.go.th/ccc.pdf", 7, status,
                      "ฉบับรวบรวม", "ป.พ.พ.", "ประมวลกฎหมายแพ่งและพาณิชย์")


class FakeKb:
    def __init__(self, status: str = "draft") -> None:
        self.status = status

    async def sections(self, pairs, *, drafts, as_of):
        return {(c, s): section(100 + i, s, self.status) for i, (c, s) in enumerate(pairs) if s in ("379", "381")}

    async def doc(self, kind, source_id, *, drafts):
        return DocRow("article", source_id, 3, "late-delivery-penalty", "ส่งงานช้าแล้วโดนปรับ", "สรุป", ARTICLE_MD,
                      self.status)

    async def titles(self, kind, slugs, *, drafts):
        return {"respond-to-penalty-deduction": "รับมือเมื่อถูกหักค่าปรับ"} if kind == "guide" else {}

    async def articles_citing(self, code, sec, *, drafts, limit=3):
        return [("late-delivery-penalty", "ส่งงานช้าแล้วโดนปรับ")]

    async def article_titles(self, *, drafts, limit=3):
        return ["ส่งงานช้าแล้วโดนปรับ"]

    async def category_name(self, code, locale):
        return "แรงงานและประกันสังคม"

    async def glossary(self, term_id, *, drafts):
        return None


def hit(source_type: str, source_id: int, dense: float, **meta) -> Hit:
    return Hit(source_id * 10, source_type, source_id, 1, None, "t", "c", {"doc_title": "อื่น", **meta}, dense,
               None, 0.01)


def composer(status: str = "draft") -> ExtractiveAnswerer:
    return ExtractiveAnswerer(None, FakeKb(status), include_drafts=True)  # type: ignore[arg-type]


async def test_article_answer_numbers_citations_and_links() -> None:
    r = Retrieval([hit("article", 3, 0.72), hit("guide", 5, 0.6, doc_title="รับมือเมื่อถูกหักค่าปรับ")])
    ans = await composer().compose("ส่งงานช้าโดนปรับ", r, locale="th", as_of=AS_OF)
    assert ans.mode == "article"
    kinds = [(c.n, c.kind, c.label) for c in ans.citations]
    assert kinds == [(1, "article", "บทความ"), (2, "law_section", "ป.พ.พ. ม.379"), (3, "law_section", "ป.พ.พ. ม.381")]
    assert "**ส่งงานช้าแล้วโดนปรับ** [1]" in ans.text
    assert 'เบี้ยปรับ" [2]' in ans.text and "[3][2]" in ans.text  # adjacent markers, one number per section
    assert "(/guides/respond-to-penalty-deduction)" in ans.text and "slug" not in ans.text
    assert "- เก็บสัญญา\n" in ans.text  # checklist box and key removed
    assert "### ฐานกฎหมาย" not in ans.text
    assert "ฉบับร่าง" not in ans.text  # no draft banner in answers (2026-10-01)
    assert "ข้อมูล ณ วันที่ 29 กันยายน 2569" in ans.text
    assert ans.next_steps == [{"type": "guide", "slug": "respond-to-penalty-deduction",
                               "title": "รับมือเมื่อถูกหักค่าปรับ"}]
    assert ans.followups == ["รับมือเมื่อถูกหักค่าปรับ"]
    assert ans.citations[1].sse()["url"] == "/law/ccc/379"


async def test_published_sources_are_not_flagged_as_draft() -> None:
    ans = await composer("published").compose("q", Retrieval([hit("article", 3, 0.72)]), locale="th", as_of=AS_OF)
    assert "ฉบับร่าง" not in ans.text and not ans.draft_sources


async def test_low_scores_give_no_evidence_answer() -> None:
    ans = await composer().compose("สูตรอาหาร", Retrieval([hit("article", 3, 0.3)]), locale="th", as_of=AS_OF)
    assert ans.mode == "no_evidence" and ans.citations == [] and "ยังไม่พบข้อมูล" in ans.text
    assert "ข้อมูล ณ วันที่" in ans.text


async def test_out_of_scope_beats_similar_contract_article() -> None:
    ans = await composer().compose("ถูกนายจ้างเลิกจ้างไม่จ่ายค่าชดเชย", Retrieval([hit("guide", 5, 0.66)]),
                                   locale="th", as_of=AS_OF)
    assert ans.mode == "out_of_scope" and "แรงงานและประกันสังคม" in ans.text and ans.citations == []


async def test_section_request_quotes_statute_verbatim() -> None:
    h = hit("law_section", 101, 0.5, law_code="ccc", section_no="381")
    h.pinned = True
    ans = await composer().compose("มาตรา 381 ว่าอย่างไร", Retrieval([h], [(None, "381")]), locale="th", as_of=AS_OF)
    assert ans.mode == "section"
    assert "> ตัวบทมาตรา 381\n>\n> วรรคสอง" in ans.text
    assert ans.followups == ["ส่งงานช้าแล้วโดนปรับ"]


class FakeAnswerer:
    def __init__(self) -> None:
        self.queries: list[str] = []

    async def answer(self, query, *, locale, as_of, scope=()):
        self.queries.append(query)
        cite = Citation(1, "law_section", 101, 7, "ป.พ.พ. ม.379", "ประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 379", "ตัวบท",
                        "ตัวบท", "/law/ccc/379", None, as_of, None, chunk_id=55)
        ans = Answer("คำตอบ [1]\n", "article", [cite], ["ถามต่อ"], [], [55])
        return ans, Retrieval([hit("law_section", 101, 0.7)])


@pytest.fixture
def extractive(fast_settings):
    s = get_settings()
    old = s.answer_chunk_delay_seconds
    s.answer_chunk_delay_seconds = 0.0
    fake = FakeAnswerer()
    app.state.answerer = fake
    yield fake
    app.state.answerer = None
    s.answer_chunk_delay_seconds = old


async def test_extractive_stream_persists_citations_and_masks_pii(client, repo, extractive) -> None:
    r = await client.post("/v1/chat/stream", json={"message": "โทร 081-234-5678 ส่งงานช้าโดนปรับ ได้หมายศาลแล้ว"},
                          headers=user_header())
    events = parse_sse(r.text)
    names = [e for e, _ in events]
    assert names[:3] == ["chat_id", "status", "safety_notice"]
    assert names[-4:] == ["citations", "suggestions", "complete", "title_update"]
    assert "".join(d["text"] for e, d in events if e == "chunk") == "คำตอบ [1]\n"
    assert dict(events)["citations"]["items"][0]["url"] == "/law/ccc/379"
    assert dict(events)["safety_notice"]["category"] == "deadline_imminent"
    # the phone number never reaches retrieval, logs or the chat title
    assert extractive.queries == ["โทร [เบอร์โทร] ส่งงานช้าโดนปรับ ได้หมายศาลแล้ว"]
    assert "081" not in dict(events)["title_update"]["title"]
    answer = repo.messages[-1]
    assert answer["model"] == "kb-extractive" and answer["extras"].verification_status == "passed"
    assert answer["extras"].citations[0].chunk_id == 55 and answer["extras"].parent_message_id == 1
    assert repo.retrieval_logs[0]["selected"] == [55]
    assert repo.guardrail_events[0]["category"] == "safety.deadline_imminent"

