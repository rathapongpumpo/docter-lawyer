"""Retrieval-level evaluation over eval/golden/retrieval_th.jsonl — no model, no cost (docs/03-technical-spec.md §4.10).

  section_lookup : the exact section is the first hit (pinned by the section-number lookup)
  glossary       : the term's glossary entry is among the first 3 documents
  scenario       : one of the expected documents or statute sections is among the first 3 (hit@3) / is first (hit@1)

Documents are de-duplicated by URL, so several chunks of one article count once.
  docker compose … exec ai python -m eval.retrieval_eval [--set eval/golden/retrieval_th.jsonl] [--show-misses]
Exit code 1 when a threshold in THRESHOLDS is missed, so a change to retrieval or to the knowledge base
cannot lower it silently.
"""

import argparse
import asyncio
import json
import sys
import time
from collections import defaultdict
from datetime import date

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.core.config import get_settings
from app.rag.embed import Embedder
from app.rag.retrieve import Retriever

THRESHOLDS = {"section_lookup": (1.0, 1), "glossary": (0.9, 3), "scenario": (0.9, 3)}  # (min rate, rank window)


def docs_of(hits) -> list[tuple[str, dict]]:  # noqa: ANN001
    seen: set[str] = set()
    out: list[tuple[str, dict]] = []
    for h in hits:
        md = h.metadata or {}
        key = md.get("url") or f"{h.source_type}:{h.source_id}"
        if key in seen:
            continue
        seen.add(key)
        out.append((key, {"slug": md.get("slug"), "source_type": h.source_type, "law": md.get("law_code"),
                          "section": md.get("section_no")}))
    return out


def rank_of(case: dict, docs: list[tuple[str, dict]]) -> int | None:
    for i, (_key, d) in enumerate(docs, start=1):
        by_section = f"{d['law']}:{d['section']}" in case["expected_sections"]
        by_doc = bool(d["slug"]) and d["slug"] in case["expected_docs"]
        if by_section or by_doc:
            return i
    return None


async def main(path: str, show_misses: bool) -> int:
    with open(path, encoding="utf-8") as f:  # noqa: ASYNC230 — one small file, read once before any I/O
        cases = [json.loads(line) for line in f]
    s = get_settings()
    pool = AsyncConnectionPool(s.db_conninfo, kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    retriever = Retriever(pool, Embedder(s.embed_url, s.embed_dim), s.rag_topk_dense, s.rag_topk_lexical, s.rag_rrf_k)
    ranks: dict[str, list[int | None]] = defaultdict(list)
    misses: list[str] = []
    started = time.perf_counter()
    for c in cases:
        r = await retriever.search(c["question"], as_of=date.today(), include_drafts=True)
        rank = rank_of(c, docs_of(r.hits))
        ranks[c["intent"]].append(rank)
        if rank is None or rank > THRESHOLDS[c["intent"]][1]:
            misses.append(f"{c['id']} rank={rank} {c['question']}")
    await pool.close()
    failed = False
    print(f"{len(cases)} cases in {time.perf_counter() - started:.0f} s")
    for intent, rs in ranks.items():
        need, window = THRESHOLDS[intent]
        hit1 = sum(r == 1 for r in rs) / len(rs)
        hitw = sum(r is not None and r <= window for r in rs) / len(rs)
        ok = hitw >= need
        failed |= not ok
        print(f"{'OK  ' if ok else 'FAIL'} {intent:15} n={len(rs):3}  hit@1 {hit1:.2f}  "
              f"hit@{window} {hitw:.2f}  (need {need:.2f})")
    if show_misses or failed:
        print("\n".join(misses))
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default="eval/golden/retrieval_th.jsonl")
    ap.add_argument("--show-misses", action="store_true")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.set, a.show_misses)))
