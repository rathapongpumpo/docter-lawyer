"""Routing check for the extractive answer engine (Phase 2A).

Questions are taken from docs/knowledge-base/eval/breach-of-contract-cases.md (facts + question, as a user would
type them), the chat's example prompts, and out-of-scope / greeting / section / definition probes. For each one
it prints the answer mode, the document chosen, the best dense score and whether that matches the expectation.

  docker compose … exec ai python -m eval.extractive_check [--verbose]
Exit code 1 when any expectation fails — use after changing thresholds in app/answer/extractive.py.
"""

import argparse
import asyncio
import sys
from datetime import date

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.answer.extractive import ExtractiveAnswerer
from app.core.config import get_settings
from app.rag.embed import Embedder
from app.rag.retrieve import Retriever
from app.repositories.kb_repo import KbRepository

PENALTY, DEFECT = "late-delivery-penalty", "defective-goods-no-termination-clause"
TERMINATION, PRESCRIPTION = "sudden-termination-mid-work", "prescription-for-contract-claims"
UNFAIR, DAMAGES = "one-sided-contract-terms", "damages-and-default-interest"

# (question, expected mode(s), acceptable document slugs — empty = any)
CASES: list[tuple[str, set[str], set[str]]] = [
    # chat example prompts (web/messages/th.json chat.example1–4)
    ("ส่งงานช้า ลูกค้าจะหักค่าปรับวันละ 2 หมื่น ต้องจ่ายเต็มไหม", {"article", "guide"},
     {PENALTY, "respond-to-penalty-deduction"}),
    ("ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน แต่สัญญาไม่มีข้อให้ยกเลิก", {"article", "guide"},
     {DEFECT, "notify-seller-of-defects"}),
    ("ลูกค้าบอกเลิกสัญญาจ้างกลางงาน เรียกค่างานได้ไหม", {"article", "guide"},
     {TERMINATION, "claim-after-termination-mid-work"}),
    ("ได้สัญญาจ้างที่ลูกค้าร่างมาให้เซ็น ควรตรวจข้อไหนก่อน", {"article"}, {UNFAIR, PENALTY}),
    # eval cases A–C (facts + question)
    ("รับเหมาตกแต่งร้าน ส่งงานช้า 15 วันเพราะวัสดุมาช้า ลูกค้ารับมอบงานไปแล้วโดยไม่ได้พูดเรื่องค่าปรับ "
     "ตอนนี้จะหักค่าปรับวันละ 20,000 บาท รวม 300,000 บาท ต้องจ่ายเต็มไหม", {"article", "guide"},
     {PENALTY, "respond-to-penalty-deduction", "reserve-rights-when-accepting-late-work"}),
    ("ในใบตรวจรับงานลูกค้าเขียนว่าสงวนสิทธิเรียกค่าปรับ ยังขอลดค่าปรับได้ไหม", {"article", "guide"},
     {PENALTY, "respond-to-penalty-deduction", "reserve-rights-when-accepting-late-work"}),
    ("งานช้า 15 วัน แต่ 10 วันเป็นเพราะลูกค้าสั่งแก้แบบ ต้องเสียค่าปรับทั้งหมดไหม", {"article", "guide"},
     {PENALTY, "respond-to-penalty-deduction"}),
    ("ลูกค้าหักค่าปรับออกจากงวดสุดท้ายไปแล้ว ทำอะไรได้บ้าง", {"article", "guide"},
     {PENALTY, "respond-to-penalty-deduction"}),
    ("สัญญาซื้อกระเบื้อง 12 เดือน ไม่มีข้อให้เลิกสัญญา ซัพพลายเออร์ส่งกระเบื้องแตกร้าวหลายล็อต ทำอะไรได้บ้าง",
     {"article", "guide"}, {DEFECT, "notify-seller-of-defects", "notice-to-cure-then-terminate"}),
    ("กระเบื้องแตกเห็นชัดตอนส่ง แต่พนักงานเซ็นรับไปโดยไม่ทักท้วง ยังเรียกร้องได้ไหม", {"article", "guide"},
     {DEFECT, "notify-seller-of-defects"}),
    ("ซัพพลายเออร์ส่งของมาน้อยกว่าที่สั่ง ทำอย่างไรได้บ้าง", {"article", "guide"},
     {DEFECT, "notify-seller-of-defects"}),
    ("พบของชำรุดมา 14 เดือนแล้ว ยังฟ้องผู้ขายได้ไหม", {"article", "guide"},
     {DEFECT, PRESCRIPTION, "notify-seller-of-defects"}),
    ("ลูกค้าบอกเลิกสัญญาจ้างกลางงาน ทำไปแล้ว 60% และไม่จ่ายงวดที่ค้าง เรียกอะไรได้บ้าง", {"article", "guide"},
     {TERMINATION, "claim-after-termination-mid-work"}),
    ("ลูกค้าอ้างว่าเลิกสัญญาเพราะงานชักช้าจนคาดว่าไม่เสร็จตามกำหนด เขาทำได้ไหม", {"article", "guide"},
     {TERMINATION, "claim-after-termination-mid-work", PENALTY}),
    ("ต้องฟ้องเรียกค่างานภายในกี่ปี", {"article", "guide"},
     {PRESCRIPTION, TERMINATION, "claim-after-termination-mid-work"}),
    ("ลูกค้าจ่ายเงินช้า คิดดอกเบี้ยผิดนัดได้เท่าไร", {"article"}, {DAMAGES}),
    # sections & definitions
    ("มาตรา 383 ว่าอย่างไร", {"section"}, set()),
    ("ป.พ.พ. ม.381 บัญญัติไว้ว่าอะไร", {"section"}, set()),
    ("เบี้ยปรับคืออะไร", {"definition", "article"}, set()),
    ("มัดจำหมายถึงอะไร", {"definition", "article"}, set()),
    # greeting & out of scope
    ("สวัสดีครับ", {"greeting"}, set()),
    ("อยากหย่ากับภรรยา ต้องทำอย่างไร", {"out_of_scope", "no_evidence"}, set()),
    ("โดนใบสั่งจราจรต้องจ่ายที่ไหน", {"out_of_scope", "no_evidence"}, set()),
    ("สูตรต้มยำกุ้ง", {"no_evidence"}, set()),
    ("ถูกนายจ้างเลิกจ้างไม่จ่ายค่าชดเชย", {"out_of_scope"}, set()),
    ("ทำสัญญาจ้างงานกับนายจ้าง แล้วโดนไล่ออก", {"out_of_scope"}, set()),
    ("ผู้ว่าจ้างเลิกจ้างเรากลางงานรับเหมา เรียกค่างานได้ไหม", {"article", "guide"},
     {TERMINATION, "claim-after-termination-mid-work"}),
    ("ให้เงินมัดจำซื้อที่ดินไปแล้ว ผู้ขายไม่ยอมโอน ขอมัดจำคืนได้ไหม", {"article", "guide", "laws", "no_evidence"},
     set()),
    ("ภรรยาเป็นคนเซ็นสัญญาซื้อของกับซัพพลายเออร์ ของส่งมาเสีย", {"article", "guide"}, {DEFECT, "notify-seller-of-defects"}),
]


async def main(verbose: bool) -> int:
    s = get_settings()
    pool = AsyncConnectionPool(s.db_conninfo, min_size=1, max_size=4, kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    answerer = ExtractiveAnswerer(Retriever(pool, Embedder(s.embed_url, s.embed_dim)), KbRepository(pool),
                                  include_drafts=True)
    failures = 0
    try:
        for question, modes, slugs in CASES:
            ans, r = await answerer.answer(question, locale="th", as_of=date.today())
            doc = next((c.url.rsplit("/", 1)[-1] for c in ans.citations if c.kind in ("article", "guide")), "")
            top = sorted(r.hits, key=lambda h: h.dense or 0, reverse=True)[:3]
            ok = ans.mode in modes and (not slugs or doc in slugs)
            failures += not ok
            print(f"{'OK ' if ok else 'BAD'} {ans.mode:<11} {doc:<42} {r.latency_ms:>4}ms  {question[:60]}")
            if verbose or not ok:
                for h in top:
                    print(f"        {h.dense or 0:.3f} {h.source_type:<11} {h.title[:70]}")
    finally:
        await pool.close()
    print(f"\n{len(CASES) - failures}/{len(CASES)} as expected")
    return 1 if failures else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args().verbose)))
