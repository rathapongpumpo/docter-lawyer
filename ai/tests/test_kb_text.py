from datetime import date
from pathlib import Path

import pytest

from app.guardrails.pii import mask_pii
from app.guardrails.triage import out_of_scope, safety_triage
from app.kb.refs import find_refs, law_refs
from app.kb.source_files import parse_glossary, parse_law_file, parse_md_text
from app.kb.thai import format_date, normalize_section_no, paragraph_label, section_sort_key, split_paragraphs
from app.services.chat_stream import stream_pieces


def test_section_numbers_normalize_thai_digits_and_suffixes() -> None:
    assert normalize_section_no("๑๙๓/๓๔") == "193/34"
    assert normalize_section_no("4ทวิ") == "4 ทวิ"
    assert normalize_section_no(" 224/1 ") == "224/1"
    with pytest.raises(ValueError):
        normalize_section_no("abc")
    assert section_sort_key("1336/1") == [1336, 1, 0]
    assert section_sort_key("4 ทวิ") == [4, 0, 2]


def test_paragraphs_keep_numbered_items_with_their_paragraph() -> None:
    body = "อายุความย่อมสะดุดหยุดลงในกรณีดังต่อไปนี้\n\n(๑)  ลูกหนี้รับสภาพหนี้\n\n(๒)  เจ้าหนี้ฟ้องคดี\n\nวรรคสอง"
    paras = split_paragraphs(body)
    assert len(paras) == 2 and "(๒)" in paras[0] and paras[1] == "วรรคสอง"
    assert paragraph_label(3) == "วรรคสาม"


def test_thai_date_uses_buddhist_era() -> None:
    assert format_date(date(2026, 9, 29)) == "29 กันยายน 2569"
    assert format_date(date(2026, 9, 29), "en") == "29 September 2026"


def test_refs_parse_law_paragraph_and_labels() -> None:
    refs = find_refs("ดู [[law:ccc:381#p3]] และ [[term:เบี้ยปรับ]] กับ [[law:unfair_terms_2540:4|ม.4]]")
    assert [r.kind for r in refs] == ["law", "term", "law"]
    assert refs[0].law == ("ccc", "381", 3)
    assert refs[2].label == "ม.4"
    assert law_refs("[[law:ccc:383]] [[law:ccc:383#p2]] [[law:ccc:193/34]]") == [("ccc", "383"), ("ccc", "193/34")]


def test_law_file_parser_keeps_body_verbatim_and_skips_historical_block(tmp_path: Path) -> None:
    f = tmp_path / "laws" / "x.md"
    f.parent.mkdir()
    f.write_text(
        "---\ntype: law_extract\nlaw: ccc\nsections: [\"224\", \"224/1\"]\n---\n\n# title\n\nintro\n\n"
        "### มาตรา ๒๒๔\n\nหนี้เงินนั้น ท่านให้คิดดอกเบี้ย\n\nวรรคสอง\n\nแหล่งที่มา: S3\n\n"
        "### มาตรา ๒๒๔/๑\n\nข้อความ\n\n> หมายเหตุ: ตรวจแล้ว\n\nแหล่งที่มา: S3\n\n"
        "## ข้อความเดิมของมาตรา ๒๒๔\n\n### มาตรา ๒๒๔\n\nข้อความเก่า\n", encoding="utf-8")
    lf = parse_law_file(f, tmp_path)
    assert [s.section_no for s in lf.sections] == ["224", "224/1"]
    assert lf.sections[0].body == "หนี้เงินนั้น ท่านให้คิดดอกเบี้ย\n\nวรรคสอง"
    assert lf.sections[0].source_id == "S3"
    assert lf.sections[1].notes == ["หมายเหตุ: ตรวจแล้ว"]
    assert lf.skipped_blocks == ["ข้อความเดิมของมาตรา ๒๒๔"]


def test_md_sections_and_glossary(tmp_path: Path) -> None:
    doc = parse_md_text("# หัวเรื่อง\n\nนำ\n\n## สรุปสั้น\n- ก\n### ย่อย\nข\n## อื่น\nค\n")
    assert doc.title == "หัวเรื่อง" and doc.intro == "นำ"
    assert [s.heading for s in doc.sections] == ["สรุปสั้น", "อื่น"]
    assert "### ย่อย" in doc.sections[0].md
    g = tmp_path / "g.md"
    g.write_text("---\ntype: glossary_set\n---\n| คำ | English | คำค้นที่ใช้ highlight | ความหมายสั้น | มาตรา |\n"
                 "|---|---|---|---|---|\n| มัดจำ | deposit | เงินมัดจำ | สิ่งที่ให้ไว้ | [[law:ccc:377]] |\n"
                 "| พ้นวิสัย | impossibility | — | ทำไม่ได้ | [[law:ccc:218]] |\n", encoding="utf-8")
    _, rows = parse_glossary(g)
    assert rows[0].aliases == ["เงินมัดจำ"] and rows[1].aliases == [] and rows[1].term_en == "impossibility"


def test_pii_masking_types_and_no_false_positives() -> None:
    m = mask_pii("บัตร 1-2345-67890-12-1 โทร 081-234-5678 อีเมล a.b@example.co.th โอนเข้าบัญชี 123-4-56789-0")
    assert m.text == "บัตร [เลขบัตรประชาชน] โทร [เบอร์โทร] อีเมล [อีเมล] โอนเข้าบัญชี [เลขบัญชี]"
    assert m.pii_types == ["bank_account", "email", "national_id", "phone"]
    assert mask_pii("บัตรเครดิต 4111 1111 1111 1111").pii_types == ["credit_card"]
    # amounts, dates and invalid ids stay as they are
    plain = "ค่าปรับวันละ 20,000 บาท รวม 300,000 บาท ตั้งแต่ปี 2569 เลข 1234567890123"
    assert mask_pii(plain).text == plain


def test_safety_and_scope_prefilters() -> None:
    hit = safety_triage("สามีทำร้ายทุกวัน และถูกข่มขู่")
    assert hit and hit.level == "urgent" and hit.notice("th")["contacts"] == []
    assert safety_triage("ได้รับหมายศาลคดีผิดสัญญา").category == "deadline_imminent"
    assert safety_triage("ส่งงานช้าโดนปรับ") is None
    assert out_of_scope("ถูกนายจ้างเลิกจ้างไม่จ่ายค่าชดเชย") == "LABOR"
    assert out_of_scope("ทำสัญญาจ้างงานกับนายจ้าง") == "LABOR"
    assert out_of_scope("ผู้ว่าจ้างเลิกจ้างเรากลางงานรับเหมา") is None
    assert out_of_scope("ภรรยาเซ็นสัญญาซื้อของกับซัพพลายเออร์") is None
    assert out_of_scope("อยากหย่า") == "FAMILY"


def test_stream_pieces_never_split_combining_marks() -> None:
    text = "ที่ปรึกษากฎหมาย" * 5
    pieces = stream_pieces(text, 7)
    assert "".join(pieces) == text
    assert all(not p or p[0] not in "่้๊๋ิีึืุูั็์" for p in pieces)
