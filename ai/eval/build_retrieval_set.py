"""Builds eval/golden/retrieval_th.jsonl — the retrieval-level golden set (docs/03-technical-spec.md §4.10).

Three kinds of case, none of which states a legal fact of its own:
  * section lookups  — one per statute section in the knowledge base ("ปพพ ม.383 ว่าอย่างไร"), in three phrasings
  * glossary lookups — one per glossary term ("เบี้ยปรับคืออะไร")
  * scenario questions — written the way a business owner would ask, each pointing at the knowledge-base document(s)
    that should be found (`expected_docs`); the documents, not the questions, carry the legal content.
`origin` is `synthetic` and `status` stays `draft`: a Legal Reviewer must confirm every expected document before the set
gates a release (CLAUDE.md §2.1 rule 4/6a). Run inside the ai container after `seed-kb`:

  python -m eval.build_retrieval_set eval/golden/retrieval_th.jsonl
"""

import json
import sys

import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings

LAW_NAME = {"ccc": "ปพพ", "unfair_terms_2540": "พ.ร.บ.ข้อสัญญาที่ไม่เป็นธรรม", "cpc": "ปวิพ"}
PHRASINGS = ["{law} ม.{n} ว่าอย่างไร", "มาตรา {n} {law} เขียนไว้ว่าอย่างไร", "{law} มาตรา {n}"]

PENALTY, DEFECT = "late-delivery-penalty", "defective-goods-no-termination-clause"
TERMINATION, PRESCRIPTION = "sudden-termination-mid-work", "prescription-for-contract-claims"
UNFAIR, DAMAGES = "one-sided-contract-terms", "damages-and-default-interest"
G_CLAIM = "claim-after-termination-mid-work"
G_CURE, G_DEFECT = "notice-to-cure-then-terminate", "notify-seller-of-defects"
G_RESERVE, G_RESPOND = "reserve-rights-when-accepting-late-work", "respond-to-penalty-deduction"
T_DEFECT, T_CURE, T_OBJ, T_RESERVE, T_TERM = ("defect-notice", "notice-to-cure", "penalty-objection",
                                              "reservation-of-rights", "termination-notice")

# (question, category, expected document slugs, [expected statute sections]) — any one of them counts as a hit.
# Where the library has the statute but no article yet, only the section is expected: those cases mark content gaps.
SCENARIOS: list[tuple[str, str, list[str]] | tuple[str, str, list[str], list[str]]] = [
    # late delivery and contractual penalty
    ("ส่งงานช้า ลูกค้าหักค่าปรับวันละ 2 หมื่น ต้องจ่ายเต็มไหม", "CONTRACT.PENALTY", [PENALTY, G_RESPOND]),
    ("ค่าปรับส่งงานล่าช้าในสัญญาสูงเกินไป ขอลดได้ไหม", "CONTRACT.PENALTY", [PENALTY, G_RESPOND]),
    ("รับงานจากผู้รับเหมาที่ส่งช้า อยากเรียกค่าปรับ ต้องทำอะไรตอนรับงาน", "CONTRACT.PENALTY", [G_RESERVE, PENALTY]),
    ("ลืมบอกว่าจะเรียกค่าปรับตอนรับมอบงาน ตอนนี้ยังเรียกได้ไหม", "CONTRACT.PENALTY", [G_RESERVE, PENALTY]),
    ("ลูกค้าหักค่าปรับจากงวดสุดท้ายไปแล้ว ทำอย่างไรดี", "CONTRACT.PENALTY", [G_RESPOND, T_OBJ]),
    ("อยากทำหนังสือโต้แย้งเรื่องถูกหักค่าปรับ", "CONTRACT.PENALTY", [T_OBJ, G_RESPOND]),
    ("มีแบบหนังสือสงวนสิทธิเรียกค่าปรับไหม", "CONTRACT.PENALTY", [T_RESERVE, G_RESERVE]),
    ("ส่งงานช้าเพราะลูกค้าสั่งแก้แบบ ยังต้องเสียค่าปรับไหม", "CONTRACT.PENALTY", [PENALTY, G_RESPOND]),
    ("ค่าปรับรายวันในสัญญาจ้างเหมา ศาลลดให้ได้ไหม", "CONTRACT.PENALTY", [PENALTY]),
    ("จ่ายค่าปรับไปแล้ว ขอคืนได้หรือเปล่า", "CONTRACT.PENALTY", [PENALTY, G_RESPOND]),
    # defective goods, notice, termination
    ("ซัพพลายเออร์ส่งของไม่ได้มาตรฐาน สัญญาไม่มีข้อเลิกสัญญา ทำอย่างไร", "CONTRACT.SALE", [DEFECT, G_DEFECT]),
    ("รับสินค้าที่ชำรุดมาแล้วโดยไม่ได้ทักท้วง ยังเรียกร้องได้ไหม", "CONTRACT.SALE", [DEFECT, G_DEFECT]),
    ("พบของเสียหลังรับมอบมาหลายเดือน ต้องรีบฟ้องภายในกี่ปี", "CONTRACT.SALE", [DEFECT, PRESCRIPTION, G_DEFECT]),
    ("ต้องแจ้งผู้ขายอย่างไรเมื่อสินค้าชำรุดบกพร่อง", "CONTRACT.SALE", [G_DEFECT, T_DEFECT]),
    ("ขอแบบหนังสือแจ้งสินค้าชำรุด", "CONTRACT.SALE", [T_DEFECT, G_DEFECT]),
    ("สัญญาไม่มีข้อให้เลิกสัญญา เลิกได้ไหมถ้าอีกฝ่ายไม่ทำตามสัญญา", "CONTRACT.BREACH", [G_CURE, DEFECT]),
    ("ต้องบอกกล่าวให้อีกฝ่ายแก้ไขก่อนเลิกสัญญาไหม", "CONTRACT.BREACH", [G_CURE, T_CURE]),
    ("ให้เวลาอีกฝ่ายแก้ไขกี่วันก่อนเลิกสัญญา", "CONTRACT.BREACH", [G_CURE, T_CURE]),
    ("อยากได้แบบหนังสือบอกเลิกสัญญา", "CONTRACT.BREACH", [T_TERM, G_CURE]),
    ("อยากได้แบบหนังสือบอกกล่าวให้ปฏิบัติตามสัญญา", "CONTRACT.BREACH", [T_CURE, G_CURE]),
    ("ส่งหนังสือเลิกสัญญาไปแล้ว ถอนคืนได้ไหม", "CONTRACT.BREACH", [G_CURE]),
    ("เลิกสัญญาแล้วต้องคืนของหรือเงินกันอย่างไร", "CONTRACT.BREACH", [G_CURE]),
    ("ซัพพลายเออร์ส่งของมาน้อยกว่าที่สั่ง ทำอย่างไรได้บ้าง", "CONTRACT.SALE", [DEFECT, G_DEFECT, G_CURE]),
    # termination in the middle of hire of work
    ("ลูกค้าบอกเลิกสัญญาจ้างกลางงาน เรียกค่างานได้ไหม", "CONTRACT.HIRE", [TERMINATION, G_CLAIM]),
    ("ผู้ว่าจ้างเลิกจ้างตอนงานทำไปแล้วครึ่งหนึ่ง ผู้รับเหมาเรียกอะไรได้บ้าง", "CONTRACT.HIRE", [TERMINATION, G_CLAIM]),
    ("ต้องเก็บหลักฐานอะไรเมื่อถูกเลิกสัญญากลางงาน", "CONTRACT.HIRE", [G_CLAIM]),
    ("ผู้ว่าจ้างอ้างว่างานช้าเลยเลิกสัญญา ทำได้ไหม", "CONTRACT.HIRE", [TERMINATION, G_CLAIM]),
    ("จะทวงค่างานที่ทำไปแล้วหลังถูกเลิกสัญญา ทำหนังสืออย่างไร", "CONTRACT.HIRE", [G_CLAIM]),
    # damages, interest, prescription, unfair terms
    ("ลูกหนี้ไม่ชำระหนี้ เรียกค่าเสียหายอะไรได้บ้าง", "CONTRACT.OBLIG", [DAMAGES]),
    ("ผิดนัดชำระเงิน คิดดอกเบี้ยผิดนัดอย่างไร", "CONTRACT.OBLIG", [DAMAGES]),
    ("ดอกเบี้ยผิดนัดตามกฎหมายปัจจุบันกี่เปอร์เซ็นต์", "CONTRACT.OBLIG", [DAMAGES]),
    ("ค่าเสียหายที่เรียกได้มีขอบเขตแค่ไหน", "CONTRACT.OBLIG", [DAMAGES]),
    ("เรียกร้องตามสัญญามีอายุความกี่ปี", "PERSON.PRESCRIPT", [PRESCRIPTION]),
    ("อายุความของสินค้าชำรุดบกพร่องสั้นกว่าปกติไหม", "PERSON.PRESCRIPT", [PRESCRIPTION, DEFECT, G_DEFECT]),
    ("อายุความสะดุดหยุดลงเมื่อไร", "PERSON.PRESCRIPT", [PRESCRIPTION]),
    ("ทวงถามหนี้แล้ว อายุความเริ่มนับใหม่ไหม", "PERSON.PRESCRIPT", [PRESCRIPTION]),
    ("ได้สัญญาที่ลูกค้าร่างมา ควรตรวจข้อไหนก่อนเซ็น", "CONTRACT.UNFAIR", [UNFAIR]),
    ("ข้อสัญญาที่เอาเปรียบเกินไป ศาลบังคับได้แค่ไหน", "CONTRACT.UNFAIR", [UNFAIR]),
    ("สัญญาสำเร็จรูปมีข้อยกเว้นความรับผิดของอีกฝ่ายทั้งหมด ใช้ได้ไหม", "CONTRACT.UNFAIR", [UNFAIR]),
    ("สัญญาที่เขียนไว้ให้เราเสียเปรียบตั้งแต่ต้น กฎหมายช่วยอะไรได้", "CONTRACT.UNFAIR", [UNFAIR]),
    # deposit, reciprocal contracts, other
    ("ให้เงินมัดจำไปแล้วผู้ขายไม่ยอมโอน ขอคืนได้ไหม", "CONTRACT.DEPOSIT", [], ["ccc:377", "ccc:378"]),
    ("เงินมัดจำกับเบี้ยปรับต่างกันอย่างไร", "CONTRACT.DEPOSIT", [PENALTY, DAMAGES]),
    ("อีกฝ่ายยังไม่ส่งของ เรายังไม่จ่ายเงินได้ไหม", "CONTRACT.OBLIG", [], ["ccc:369"]),
    ("สัญญาจ้างทำของกับสัญญาจ้างแรงงานต่างกันอย่างไร", "CONTRACT.HIRE", [TERMINATION, G_CLAIM]),
    ("ผู้รับจ้างเอางานไปให้คนอื่นทำต่อได้ไหม", "CONTRACT.HIRE", [], ["ccc:607"]),
    ("ผู้รับจ้างทำงานบกพร่อง ผู้ว่าจ้างทำอะไรได้บ้าง", "CONTRACT.HIRE", [G_CURE, T_CURE], ["ccc:594"]),
    ("ฟ้องเรียกค่าปรับต้องฟ้องศาลไหน", "PROCEDURE.CIVIL", [PENALTY, PRESCRIPTION]),
    ("ทำหนังสือถึงคู่สัญญาแล้ว ควรส่งด้วยวิธีไหนให้พิสูจน์ได้", "CONTRACT.BREACH", [G_CURE, T_CURE]),
    ("คู่สัญญาหลายคน ต้องบอกเลิกสัญญาต่อทุกคนไหม", "CONTRACT.BREACH", [G_CURE]),
    ("สัญญาซื้อกระเบื้อง ส่งมาแตกหลายล็อต ทำอะไรได้บ้าง", "CONTRACT.SALE", [DEFECT, G_DEFECT]),
    ("รับเหมาตกแต่งร้าน ลูกค้าไม่จ่ายงวดสุดท้าย เรียกอะไรได้", "CONTRACT.HIRE", [TERMINATION, G_CLAIM, DAMAGES]),
]


def main(out: str) -> None:
    s = get_settings()
    with psycopg.connect(s.db_conninfo, row_factory=dict_row) as conn:
        secs = conn.execute("""SELECT l.law_code, s.section_no FROM kb.law_sections s
            JOIN kb.law_versions v ON v.id = s.law_version_id JOIN kb.laws l ON l.id = v.law_id
            WHERE v.status <> 'archived' ORDER BY l.law_code, s.sort_key""").fetchall()
        gloss = conn.execute("SELECT slug, term_th FROM kb.glossary_terms ORDER BY id").fetchall()
    rows: list[dict] = []
    base = {"set_name": "retrieval_th", "locale": "th", "as_of": None, "history": [], "scope": "auto",
            "must_not_include": [], "origin": "synthetic", "status": "draft"}
    for i, r in enumerate(secs):
        law = LAW_NAME.get(r["law_code"], r["law_code"])
        rows.append({**base, "id": f"RET-S-{i + 1:03d}", "intent": "section_lookup", "category": [],
                     "question": PHRASINGS[i % 3].format(law=law, n=r["section_no"]),
                     "expected_sections": [f"{r['law_code']}:{r['section_no']}"], "expected_docs": []})
    for i, g in enumerate(gloss):
        term = g["term_th"].split(" / ")[0].split(" (")[0]
        rows.append({**base, "id": f"RET-G-{i + 1:03d}", "intent": "glossary", "category": ["CONTRACT"],
                     "question": f"{term} คืออะไร", "expected_sections": [], "expected_docs": [g["slug"]]})
    for i, sc in enumerate(SCENARIOS):
        q, cat, docs = sc[0], sc[1], sc[2]
        secs_expected = sc[3] if len(sc) > 3 else []
        rows.append({**base, "id": f"RET-Q-{i + 1:03d}", "intent": "scenario", "category": [cat], "question": q,
                     "expected_sections": secs_expected, "expected_docs": docs})
    with open(out, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"{len(rows)} cases → {out}: {len(secs)} section lookups, {len(gloss)} glossary, {len(SCENARIOS)} scenarios")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "eval/golden/retrieval_th.jsonl")
