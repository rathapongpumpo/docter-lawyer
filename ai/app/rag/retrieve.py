"""Hybrid retrieval over kb.chunks — docs/03-technical-spec.md §4.5.

exact (มาตรา N [+ law alias]) ∥ dense (bge-m3 / pgvector) ∥ lexical (PyThaiNLP tokens / tsvector) → RRF.
"""

import re
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from psycopg_pool import AsyncConnectionPool

from app.core.logging import log
from app.kb.thai import SECTION_SUFFIXES, arabic, normalize_section_no
from app.rag.embed import Embedder, to_pgvector
from app.rag.tokens import tokenize, tsquery_any

_SECTION_REF = re.compile(
    r"(?:มาตรา|ม\.)\s*(\d+)(?:\s*/\s*(\d+))?(?:\s*(" + "|".join(SECTION_SUFFIXES) + r"))?")
W_DENSE, W_LEXICAL = 1.0, 0.8

_VISIBLE = """(c.is_published OR %(drafts)s)
  AND (c.effective_from IS NULL OR c.effective_from <= %(as_of)s)
  AND (c.effective_to IS NULL OR c.effective_to > %(as_of)s)"""
# user-chosen legal categories (empty = automatic); a parent code such as CONTRACT also covers CONTRACT.BREACH …
_SCOPE = """(cardinality(%(scope)s::text[]) = 0 OR c.category_ids && (
    SELECT coalesce(array_agg(k.id), '{}'::smallint[]) FROM kb.categories k
    WHERE k.code = ANY(%(scope)s::text[]) OR k.code LIKE ANY(%(likes)s::text[])))"""
_COLUMNS = ("c.id, c.source_type::text AS source_type, c.source_id, c.source_version, c.law_id, c.title, c.content, "
            "c.metadata")


@dataclass
class Hit:
    chunk_id: int
    source_type: str
    source_id: int
    source_version: int
    law_id: int | None
    title: str
    content: str
    metadata: dict[str, Any]
    dense: float | None = None
    lexical: float | None = None
    rrf: float = 0.0
    pinned: bool = False

    def log_row(self) -> dict[str, Any]:
        return {"chunk_id": self.chunk_id, "dense_score": self.dense, "lexical_score": self.lexical,
                "rrf": round(self.rrf, 5), "pinned": self.pinned}


@dataclass
class Retrieval:
    hits: list[Hit]
    requested_sections: list[tuple[str | None, str]] = field(default_factory=list)
    degraded: bool = False  # dense search unavailable → lexical only (§4.9 fail policy)
    latency_ms: int = 0
    law_names: dict[str, str] = field(default_factory=dict)


def parse_section_refs(query: str, laws: list[dict[str, Any]]) -> list[tuple[str | None, str]]:
    """'ปพพ ม.381' → [('ccc', '381')]; law is None when the question names no law."""
    text = arabic(query)
    lowered = text.lower().replace(" ", "")
    named = [law["law_code"] for law in laws
             if any(a.lower().replace(" ", "") in lowered for a in [*law["aliases"], law["short_name_th"] or ""] if a)]
    refs: list[tuple[str | None, str]] = []

    def add(code: str | None, num: str, sub: str | None, suffix: str | None) -> None:
        raw = num + (f"/{sub}" if sub else "") + (f" {suffix}" if suffix else "")
        try:
            sec = normalize_section_no(raw)
        except ValueError:
            return
        if (code, sec) not in refs:
            refs.append((code, sec))

    for m in _SECTION_REF.finditer(text):
        for code in named or [None]:
            add(code, m.group(1), m.group(2), m.group(3))
    # "ปพพ 420", "ป.พ.พ. 420", "CCC 420": the law's name straight before the number, no "มาตรา" needed (FR-KB-010)
    for law in laws:
        for alias in {*law["aliases"], law["short_name_th"] or ""}:
            key = alias.lower().replace(".", "").replace(" ", "")
            if len(key) < 2:
                continue
            name = "".join(re.escape(ch) + r"[.\s]*" for ch in key)
            after = r"(?:มาตรา|ม\.)?\s*(\d+)(?:\s*/\s*(\d+))?(?:\s*(" + "|".join(SECTION_SUFFIXES) + r"))?"
            for m in re.finditer(name + after, text, re.IGNORECASE):
                add(law["law_code"], m.group(1), m.group(2), m.group(3))
    return refs


class Retriever:
    def __init__(self, pool: AsyncConnectionPool, embedder: Embedder, topk_dense: int = 40,
                 topk_lexical: int = 40, rrf_k: int = 60) -> None:
        self.pool = pool
        self.embedder = embedder
        self.topk_dense = topk_dense
        self.topk_lexical = topk_lexical
        self.rrf_k = rrf_k

    async def laws(self) -> list[dict[str, Any]]:
        async with self.pool.connection() as conn:
            cur = await conn.execute("SELECT law_code, aliases, short_name_th FROM kb.laws")
            return list(await cur.fetchall())

    async def search(self, query: str, *, as_of: date, include_drafts: bool, scope: Sequence[str] = ()) -> Retrieval:
        """`scope` = legal-category codes picked for this chat (FR-CHAT-011); a parent code includes its children.
        It narrows the semantic and lexical searches; an exact section the user names is still found."""
        started = time.monotonic()
        params = {"drafts": include_drafts, "as_of": as_of, "scope": list(scope), "likes": [f"{c}.%" for c in scope]}
        laws = await self.laws()
        refs = parse_section_refs(query, laws)
        hits: dict[int, Hit] = {}
        degraded = False

        async with self.pool.connection() as conn:
            for code, sec in refs:  # exact lookup → pinned
                cur = await conn.execute(
                    f"""SELECT {_COLUMNS} FROM kb.chunks c
                        WHERE c.source_type = 'law_section' AND c.metadata->>'section_no' = %(sec)s
                          AND (%(code)s::text IS NULL OR c.metadata->>'law_code' = %(code)s) AND {_VISIBLE}
                        ORDER BY (c.metadata->>'law_code' = 'ccc') DESC LIMIT 3""",
                    {**params, "sec": sec, "code": code},
                )
                for row in await cur.fetchall():
                    hits.setdefault(row["id"], Hit(row["id"], row["source_type"], row["source_id"],
                                                   row["source_version"], row["law_id"], row["title"],
                                                   row["content"], row["metadata"])).pinned = True

            try:
                vec = (await self.embedder.embed([query]))[0]
                cur = await conn.execute(
                    f"""SELECT {_COLUMNS}, 1 - (c.embedding <=> %(q)s::vector) AS score FROM kb.chunks c
                        WHERE {_VISIBLE} AND {_SCOPE} ORDER BY c.embedding <=> %(q)s::vector LIMIT %(k)s""",
                    {**params, "q": to_pgvector(vec), "k": self.topk_dense},
                )
                for rank, row in enumerate(await cur.fetchall(), start=1):
                    h = hits.setdefault(row["id"], self._hit(row))
                    h.dense = round(float(row["score"]), 4)
                    h.rrf += W_DENSE / (self.rrf_k + rank)
            except Exception:
                degraded = True
                log.exception("dense_retrieval_failed")

            tsq = tsquery_any(tokenize(query))
            if tsq:
                cur = await conn.execute(
                    f"""SELECT {_COLUMNS}, ts_rank_cd(c.tsv, q) AS score
                        FROM kb.chunks c, to_tsquery('simple', %(tsq)s) q
                        WHERE c.tsv @@ q AND {_VISIBLE} AND {_SCOPE} ORDER BY score DESC LIMIT %(k)s""",
                    {**params, "tsq": tsq, "k": self.topk_lexical},
                )
                for rank, row in enumerate(await cur.fetchall(), start=1):
                    h = hits.setdefault(row["id"], self._hit(row))
                    h.lexical = round(float(row["score"]), 4)
                    h.rrf += W_LEXICAL / (self.rrf_k + rank)

        ranked = sorted(hits.values(), key=lambda h: (h.pinned, h.rrf), reverse=True)
        return Retrieval(ranked, refs, degraded, int((time.monotonic() - started) * 1000),
                         {law["law_code"]: law["short_name_th"] or law["law_code"] for law in laws})

    @staticmethod
    def _hit(row: dict[str, Any]) -> Hit:
        return Hit(row["id"], row["source_type"], row["source_id"], row["source_version"], row["law_id"],
                   row["title"], row["content"], row["metadata"])
