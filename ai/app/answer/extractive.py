"""Knowledge-grounded answers without an LLM (answer engine `extractive`, Phase 2A).

Every sentence in an answer comes from knowledge-base text (articles, guides, glossary, verbatim statutes);
this module only selects, orders and formats it. Statute references become `[n]` markers with Citation objects
(docs/03-technical-spec.md §3.3, §4.7). When the knowledge base has nothing relevant the answer says so
(no-evidence mode, §4.5) instead of guessing.
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.guardrails.triage import out_of_scope
from app.kb.refs import Ref, law_refs, replace_refs
from app.kb.source_files import parse_md_text
from app.kb.thai import format_date, split_paragraphs
from app.rag.retrieve import Hit, Retrieval, Retriever
from app.repositories.kb_repo import DocRow, KbRepository, SectionRow

# bge-m3 cosine similarity thresholds — calibrated with ai/eval/extractive_check.py on the KB eval cases
DOC_MIN = 0.575       # best article/guide chunk must reach this to answer from that document
LAW_MIN = 0.52        # statute-only answers
GLOSSARY_MIN = 0.60   # definition answers
FOLLOW_MIN = 0.48     # other documents offered as follow-up questions
MAX_LAW_QUOTES = 3
SNIPPET_MAX = 400

_SLUG_NOTE = re.compile(r"\s*\(slug `[^`]+`\)")
_CHECKLIST = re.compile(r"^(\s*)- \[ \] ", re.M)
_KEY_NOTE = re.compile(r"\s*\(`[a-z_]+`\)")
_GREETING = re.compile(r"^\s*(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey|ขอบคุณ|thank)", re.I)
_DEFINITION = re.compile(r"คืออะไร|หมายถึง|แปลว่า|หมายความว่า|what is|meaning", re.I)
SKIP_HEADINGS = {"ฐานกฎหมาย"}

T: dict[str, dict[str, str]] = {
    "intro_article": {"th": "คำถามของคุณเกี่ยวข้องกับหัวข้อ **{title}** {cite} ในคลังความรู้ของนิติมิตร สรุปได้ดังนี้",
                      "en": "Your question relates to **{title}** {cite} in the Nitimitr knowledge base "
                            "(content is in Thai):"},
    "intro_guide": {"th": "เรื่องนี้มีคู่มือขั้นตอน **{title}** {cite} ในคลังความรู้ของนิติมิตร สรุปได้ดังนี้",
                    "en": "The knowledge base has a step-by-step guide, **{title}** {cite} (content is in Thai):"},
    "closing": {"th": "ข้อมูล ณ วันที่ {date} · ข้อมูลนี้เป็นความรู้ทั่วไป ไม่ใช่คำปรึกษาทางกฎหมายสำหรับกรณีเฉพาะของคุณ",
                "en": "Information as of {date} · General legal information, not legal advice for your specific case."},
    "section_intro": {"th": "**{title} มาตรา {sec}** {cite} บัญญัติว่า",
                      "en": "**{title}, section {sec}** {cite} provides (official Thai text):"},
    "section_version": {"th": "ข้อความจาก: {label}", "en": "Text from: {label}"},
    "section_missing": {"th": "ยังไม่มี{law}มาตรา {sec} ในคลังความรู้ของนิติมิตร",
                        "en": "Section {sec}{law} is not in the Nitimitr knowledge base yet."},
    "section_articles": {"th": "หัวข้อในคลังความรู้ที่อ้างมาตรานี้:", "en": "Knowledge-base topics that cite it:"},
    "laws_intro": {"th": "ยังไม่มีบทความในคลังความรู้ที่ตอบคำถามนี้โดยตรง ตัวบทที่ค้นพบว่าอาจเกี่ยวข้องมีดังนี้",
                   "en": "No knowledge-base article answers this directly. These statute sections may be relevant:"},
    "laws_caveat": {"th": "ระบบยังอธิบายไม่ได้ว่าตัวบทเหล่านี้ใช้กับข้อเท็จจริงของคุณอย่างไร หากเรื่องมีมูลค่าสูง "
                          "หรือมีกำหนดเวลาที่ต้องดำเนินการ ควรปรึกษาทนายความ",
                    "en": "The system cannot yet explain how these sections apply to your facts. If the amount is "
                          "large or a deadline is involved, consult a lawyer."},
    "definition": {"th": "**{term}** {cite} — {definition}", "en": "**{term}** {cite} — {definition}"},
    "definition_refs": {"th": "มาตราที่เกี่ยวข้อง:", "en": "Related sections:"},
    "no_evidence": {"th": "ยังไม่พบข้อมูลในคลังความรู้ของนิติมิตรที่ตอบคำถามนี้ได้ จึงยังไม่ให้คำตอบเพื่อไม่ให้ข้อมูลคลาดเคลื่อน\n\n"
                          "ขณะนี้คลังความรู้ครอบคลุม**สัญญาทางการค้าและการผิดสัญญา** เช่น ค่าปรับส่งงานล่าช้า "
                          "ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน การถูกเลิกสัญญากลางงาน ข้อสัญญาที่เสียเปรียบ "
                          "ค่าเสียหายและดอกเบี้ยผิดนัด และอายุความของสิทธิตามสัญญา\n\n"
                          "หากเรื่องของคุณเร่งด่วน มีมูลค่าสูง หรือมีกำหนดเวลา ควรปรึกษาทนายความ",
                    "en": "The Nitimitr knowledge base has nothing that answers this yet, so no answer is given "
                          "rather than risk being wrong.\n\nIt currently covers **commercial contracts and breach of "
                          "contract** — late-delivery penalties, substandard supplies, termination mid-work, one-sided "
                          "terms, damages and default interest, and limitation periods.\n\nIf your matter is urgent, "
                          "high-value or has a deadline, consult a lawyer."},
    "out_of_scope": {"th": "คำถามนี้เป็นเรื่อง**{category}** ซึ่งยังไม่อยู่ในคลังความรู้ของนิติมิตร "
                           "จึงยังไม่ให้คำตอบเพื่อไม่ให้ข้อมูลคลาดเคลื่อน\n\n"
                           "ขณะนี้คลังความรู้ครอบคลุม**สัญญาทางการค้าและการผิดสัญญา** เช่น ค่าปรับส่งงานล่าช้า "
                           "ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน และการถูกเลิกสัญญากลางงาน\n\n"
                           "สำหรับเรื่องนี้ ควรปรึกษาทนายความหรือหน่วยงานที่รับผิดชอบเรื่องนั้นโดยตรง",
                     "en": "This question is about **{category}**, which the Nitimitr knowledge base does not cover "
                           "yet, so no answer is given rather than risk being wrong.\n\nIt currently covers "
                           "**commercial contracts and breach of contract**.\n\nFor this matter, consult a lawyer or "
                           "the agency responsible for it."},
    "degraded": {"th": "_ระบบค้นคลังความรู้ขัดข้องบางส่วน ผลการค้นอาจไม่ครบ_",
                 "en": "_Knowledge-base search is partly unavailable; results may be incomplete._"},
    "greeting": {"th": "สวัสดีครับ นิติมิตรช่วยอธิบายกฎหมายเรื่อง**สัญญาทางการค้าและการผิดสัญญา** พร้อมอ้างอิงตัวบท "
                       "เช่น ค่าปรับส่งงานล่าช้า ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน หรือถูกเลิกสัญญากะทันหัน\n\n"
                       "เล่าเรื่องของคุณด้วยภาษาของคุณเองได้เลย เช่น ทำสัญญากับใคร ตกลงอะไรไว้ และเกิดอะไรขึ้น",
                 "en": "Hello! Nitimitr explains Thai law on **commercial contracts and breach of contract**, with "
                       "citations — for example late-delivery penalties, substandard supplies or sudden termination."
                       "\n\nDescribe your situation in your own words: who the contract is with, what was agreed and "
                       "what happened."},
    "guide_link": {"th": "คู่มือ “{title}”", "en": "guide “{title}”"},
    "template_link": {"th": "แบบหนังสือ “{title}”", "en": "letter template “{title}”"},
}


def tx(key: str, locale: str, **kw: Any) -> str:
    table = T[key]
    return (table.get(locale) or table["th"]).format(**kw)


@dataclass
class Citation:
    n: int
    kind: str
    ref_id: int
    ref_version: int | None
    label: str
    title: str
    snippet: str | None
    cited_text: str | None
    url: str
    official_url: str | None
    as_of: date
    effective_from: date | None
    chunk_id: int | None = None
    draft: bool = False

    def sse(self) -> dict[str, Any]:
        return {"n": self.n, "kind": self.kind, "ref_id": self.ref_id, "label": self.label, "title": self.title,
                "snippet": self.snippet, "url": self.url, "official_url": self.official_url,
                "as_of": self.as_of.isoformat(),
                "effective_from": self.effective_from.isoformat() if self.effective_from else None}


@dataclass
class Answer:
    text: str
    mode: str  # article | guide | section | laws | definition | no_evidence | greeting
    citations: list[Citation] = field(default_factory=list)
    followups: list[str] = field(default_factory=list)
    next_steps: list[dict[str, str]] = field(default_factory=list)
    selected_chunk_ids: list[int] = field(default_factory=list)
    quick_replies: list[str] = field(default_factory=list)   # always empty; kept for the SSE suggestions shape
    model: str | None = None
    verification: dict[str, Any] | None = None
    verification_status: str | None = None

    @property
    def draft_sources(self) -> bool:
        return any(c.draft for c in self.citations)

    def suggestions(self) -> dict[str, Any]:
        return {"followups": self.followups, "quick_replies": self.quick_replies, "next_steps": self.next_steps}


class CitationBook:
    """Assigns [n] in order of first appearance, one number per source (§4.7 step 2)."""

    def __init__(self, as_of: date, hits: list[Hit]) -> None:
        self.as_of = as_of
        self.items: list[Citation] = []
        self._keys: dict[tuple[str, int], int] = {}
        self._chunks = {(h.source_type, h.source_id): h.chunk_id for h in hits}

    def law(self, s: SectionRow) -> int:
        return self._add(("law_section", s.id), lambda n: Citation(
            n, "law_section", s.id, s.version_id, f"{s.short_name} ม.{s.section_no}",
            f"{s.law_title} มาตรา {s.section_no}", _clip(s.body), s.body, f"/law/{s.law_code}/{s.section_no}",
            s.official_url, self.as_of, s.effective_from, draft=s.version_status != "published"))

    def doc(self, d: DocRow) -> int:
        label = "บทความ" if d.kind == "article" else "คู่มือ"
        return self._add((d.kind, d.id), lambda n: Citation(
            n, d.kind, d.id, d.version_id, label, f"{label}: {d.title}", d.summary, None, d.url, None,
            self.as_of, None, draft=d.status != "published"))

    def _add(self, key: tuple[str, int], make: Callable[[int], Citation]) -> int:
        if key not in self._keys:
            c = make(len(self.items) + 1)
            c.chunk_id = self._chunks.get(key)
            self.items.append(c)
            self._keys[key] = c.n
        return self._keys[key]


def _clip(text: str, limit: int = SNIPPET_MAX) -> str:
    one = " ".join(text.split())
    return one if len(one) <= limit else one[: limit - 1].rstrip() + "…"


def _quote(text: str) -> str:
    return "\n>\n".join("> " + p.replace("\n", "  \n> ") for p in split_paragraphs(text))


class ExtractiveAnswerer:
    def __init__(self, retriever: Retriever, kb: KbRepository, *, include_drafts: bool) -> None:
        self.retriever = retriever
        self.kb = kb
        self.drafts = include_drafts

    async def answer(self, query: str, *, locale: str, as_of: date,
                     scope: Sequence[str] = ()) -> tuple[Answer, Retrieval]:
        retrieval = await self.retriever.search(query, as_of=as_of, include_drafts=self.drafts, scope=scope)
        answer = await self.compose(query, retrieval, locale=locale, as_of=as_of)
        return answer, retrieval

    async def direct(self, query: str, r: Retrieval, *, locale: str, as_of: date) -> Answer | None:
        """Cases answered verbatim from the knowledge base with no generation: greeting, out-of-scope, exact section
        lookups and glossary definitions. """
        hits = r.hits
        best_dense = max((h.dense or 0.0 for h in hits), default=0.0)
        if _GREETING.match(query) and len(query) <= 30 and best_dense < DOC_MIN:
            return await self._greeting(locale, as_of)

        notes: list[str] = [tx("degraded", locale)] if r.degraded else []
        if not r.requested_sections and (oos := out_of_scope(query)):
            ans = Answer("", "out_of_scope", followups=await self.kb.article_titles(drafts=self.drafts))
            name = await self.kb.category_name(oos, locale)
            ans.text = self._assemble([tx("out_of_scope", locale, category=name)], ans, locale, as_of, notes)
            return ans
        if r.requested_sections:
            ans = await self._sections(query, r, locale, as_of, notes)
            if ans:
                return ans

        if _DEFINITION.search(query):
            g = next((h for h in hits if h.source_type == "glossary" and (h.dense or 0) >= GLOSSARY_MIN), None)
            if g:
                ans = await self._definition(g, hits, locale, as_of, notes)
                if ans:
                    return ans
        return None

    async def greeting(self, locale: str, as_of: date) -> Answer:
        return await self._greeting(locale, as_of)

    async def no_evidence(self, locale: str, as_of: date, degraded: bool = False) -> Answer:
        return await self._no_evidence(locale, as_of, [tx("degraded", locale)] if degraded else [])

    async def compose(self, query: str, r: Retrieval, *, locale: str, as_of: date) -> Answer:
        hits = r.hits
        notes: list[str] = [tx("degraded", locale)] if r.degraded else []
        if (direct := await self.direct(query, r, locale=locale, as_of=as_of)) is not None:
            return direct

        doc_hit = self._best_doc(hits)
        if doc_hit:
            doc = await self.kb.doc(doc_hit.source_type, doc_hit.source_id, drafts=self.drafts)
            if doc:
                return await self._from_doc(doc, hits, locale, as_of, notes)

        law_hits = [h for h in hits if h.source_type == "law_section" and (h.dense or 0) >= LAW_MIN]
        if law_hits:
            return await self._laws(law_hits[:MAX_LAW_QUOTES], hits, locale, as_of, notes)
        return await self._no_evidence(locale, as_of, notes)

    # ------------------------------------------------------------------ selection
    @staticmethod
    def _best_doc(hits: list[Hit]) -> Hit | None:
        docs = [h for h in hits if h.source_type in ("article", "guide") and (h.dense or 0) >= DOC_MIN]
        if not docs:
            return None
        # articles answer "what are my rights"; prefer them unless a guide is clearly closer
        best = max(docs, key=lambda h: (h.dense or 0) + (0.02 if h.source_type == "article" else 0) + h.rrf)
        return best

    def _followups(self, hits: list[Hit], exclude: set[tuple[str, int]]) -> list[str]:
        seen: list[str] = []
        for h in sorted(hits, key=lambda h: h.dense or 0, reverse=True):
            key = (h.source_type, h.source_id)
            if h.source_type not in ("article", "guide") or key in exclude or (h.dense or 0) < FOLLOW_MIN:
                continue
            title = h.metadata.get("doc_title")
            if title and title not in seen:
                seen.append(title)
            if len(seen) == 3:
                break
        return seen

    # ------------------------------------------------------------------ answer modes
    async def _from_doc(self, doc: DocRow, hits: list[Hit], locale: str, as_of: date, notes: list[str]) -> Answer:
        book = CitationBook(as_of, hits)
        cite = f"[{book.doc(doc)}]"
        sections = await self.kb.sections(law_refs(doc.body_md), drafts=self.drafts, as_of=as_of)
        slugs = {k: [r.value for r in _refs_of(doc.body_md, k)] for k in ("guide", "template")}
        titles = {k: await self.kb.titles(k, v, drafts=self.drafts) for k, v in slugs.items()}
        next_steps: list[dict[str, str]] = []

        def render(ref: Ref) -> str:
            if ref.kind == "law":
                code, sec, _ = ref.law
                s = sections.get((code, sec))
                return f"[{book.law(s)}]" if s else ""
            if ref.kind in ("guide", "template"):
                title = titles[ref.kind].get(ref.value)
                if not title:
                    return ref.label or ""
                if not any(n["slug"] == ref.value for n in next_steps):
                    next_steps.append({"type": ref.kind, "slug": ref.value, "title": title})
                url = f"/guides/{ref.value}" if ref.kind == "guide" else f"/templates/{ref.value}"
                return f"[{tx(ref.kind + '_link', locale, title=title)}]({url})"
            return ref.label or ref.value

        parsed = parse_md_text(doc.body_md, doc.title)
        parts = [tx("intro_article" if doc.kind == "article" else "intro_guide", locale, title=doc.title, cite=cite)]
        if parsed.intro:
            parts.append(_tidy(replace_refs(parsed.intro, render)))
        for s in parsed.sections:
            if s.heading in SKIP_HEADINGS or not s.md:
                continue
            body = _tidy(replace_refs(s.md, render))
            parts.append(f"### {s.heading}\n\n{_demote(body)}")
        ans = Answer("", doc.kind, book.items,
                     self._followups(hits, {(doc.kind, doc.id)}), next_steps[:3],
                     [h.chunk_id for h in hits if (h.source_type, h.source_id) == (doc.kind, doc.id)])
        ans.selected_chunk_ids += [c.chunk_id for c in book.items if c.kind == "law_section" and c.chunk_id]
        ans.text = self._assemble(parts, ans, locale, as_of, notes)
        return ans

    async def _sections(self, query: str, r: Retrieval, locale: str, as_of: date, notes: list[str]) -> Answer | None:
        pinned = [h for h in r.hits if h.pinned][:MAX_LAW_QUOTES]
        pairs = [(h.metadata["law_code"], h.metadata["section_no"]) for h in pinned]
        found = await self.kb.sections(pairs, drafts=self.drafts, as_of=as_of)
        missing = [tx("section_missing", locale, law=_law_name(code, r, locale), sec=sec)
                   for code, sec in r.requested_sections if not any(p[1] == sec for p in pairs)]
        if not found:
            notes.extend(missing)
            return None
        book = CitationBook(as_of, r.hits)
        parts: list[str] = []
        followups: list[str] = []
        for s in found.values():
            n = book.law(s)
            parts.append(tx("section_intro", locale, title=s.law_title, sec=s.section_no, cite=f"[{n}]"))
            parts.append(_quote(s.body))
            if s.version_status != "published":
                parts.append("_" + tx("section_version", locale, label=s.version_label) + "_")
            citing = await self.kb.articles_citing(s.law_code, s.section_no, drafts=self.drafts)
            if citing:
                links = "\n".join(f"- [{title}](/library/articles/{slug})" for slug, title in citing)
                parts.append(f"{tx('section_articles', locale)}\n\n{links}")
                followups += [t for _, t in citing if t not in followups]
        ans = Answer("", "section", book.items, followups[:3], [], [h.chunk_id for h in pinned])
        ans.text = self._assemble(parts, ans, locale, as_of, notes + missing)
        return ans

    async def _definition(self, g: Hit, hits: list[Hit], locale: str, as_of: date,
                          notes: list[str]) -> Answer | None:
        row = await self.kb.glossary(g.source_id, drafts=self.drafts)
        if not row:
            return None
        pairs = [(a, b) for a, b in (row["refs"] or [])]
        sections = await self.kb.sections(pairs, drafts=self.drafts, as_of=as_of)
        book = CitationBook(as_of, hits)
        cites = " ".join(f"[{book.law(s)}]" for s in sections.values())
        parts = [tx("definition", locale, term=row["term_th"], cite=cites, definition=row["short_def"])]
        if sections:
            parts.append(tx("definition_refs", locale) + "\n\n" + "\n".join(
                f"- **{s.short_name} มาตรา {s.section_no}** [{book.law(s)}] — {_clip(s.body, 160)}"
                for s in sections.values()))
        ans = Answer("", "definition", book.items, self._followups(hits, set()), [], [g.chunk_id])
        ans.text = self._assemble(parts, ans, locale, as_of, notes)
        return ans

    async def _laws(self, law_hits: list[Hit], hits: list[Hit], locale: str, as_of: date, notes: list[str]) -> Answer:
        pairs = [(h.metadata["law_code"], h.metadata["section_no"]) for h in law_hits]
        sections = await self.kb.sections(pairs, drafts=self.drafts, as_of=as_of)
        book = CitationBook(as_of, hits)
        parts = [tx("laws_intro", locale)]
        for pair in pairs:
            s = sections.get(pair)
            if s:
                first = split_paragraphs(s.body)[0]
                parts.append(f"**{s.short_name} มาตรา {s.section_no}** [{book.law(s)}]\n\n> {_clip(first, 300)}")
        parts.append(tx("laws_caveat", locale))
        ans = Answer("", "laws", book.items, self._followups(hits, set()), [], [h.chunk_id for h in law_hits])
        ans.text = self._assemble(parts, ans, locale, as_of, notes)
        return ans

    async def _no_evidence(self, locale: str, as_of: date, notes: list[str]) -> Answer:
        ans = Answer("", "no_evidence", followups=await self.kb.article_titles(drafts=self.drafts))
        ans.text = self._assemble([tx("no_evidence", locale)], ans, locale, as_of, notes)
        return ans

    async def _greeting(self, locale: str, as_of: date) -> Answer:
        return Answer(tx("greeting", locale), "greeting", followups=await self.kb.article_titles(drafts=self.drafts))

    @staticmethod
    def _assemble(parts: list[str], ans: Answer, locale: str, as_of: date, notes: list[str]) -> str:
        tail = ["---", "_" + tx("closing", locale, date=format_date(as_of, locale)) + "_"]
        return "\n\n".join([*notes, *parts, *tail]).strip() + "\n"


def _refs_of(md: str, kind: str) -> list[Ref]:
    from app.kb.refs import find_refs

    return [r for r in find_refs(md) if r.kind == kind]


def _tidy(md: str) -> str:
    md = _SLUG_NOTE.sub("", md)
    md = _CHECKLIST.sub(r"\1- ", md)
    md = _KEY_NOTE.sub("", md)
    md = re.sub(r"[ \t]+\n", "\n", md)
    md = re.sub(r"(\[\d+\]) (?=\[\d+\])", r"\1", md)  # "[2] [3]" → "[2][3]"
    return md.strip()


def _demote(md: str) -> str:
    return re.sub(r"^### ", "#### ", md, flags=re.M)


def _law_name(code: str | None, r: Retrieval, locale: str) -> str:
    if code is None:
        return ""
    name = r.law_names.get(code, code)
    return f" {name} " if locale == "th" else f" of {name}"
