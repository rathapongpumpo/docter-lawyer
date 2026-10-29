"""Thai tone marks stored as ASCII by a PDF font map (FR-CR-002): repair by context, never a fixed table."""

from app.contracts.extract import clean
from app.contracts.pdf_marks import _build_tounicode, _parse_tounicode, resolve_marks

P1, P2, P3 = "", "", ""
PH = {P1: ("F", 1), P2: ("F", 2), P3: ("F", 3)}


def test_tounicode_blocks_are_read_apart_and_round_trip():
    cmap = ("1 begincodespacerange <00> <FF> endcodespacerange\n"
            "2 beginbfchar\n<52> <0030>\n<53> <0031>\nendbfchar\n"
            "2 beginbfrange\n<21><21><0e2b>\n<22><23><0e19>\nendbfrange")
    got = _parse_tounicode(cmap)
    assert got == {0x52: "0", 0x53: "1", 0x21: "ห", 0x22: "น", 0x23: "บ"}
    assert _parse_tounicode(_build_tounicode(got, 1).decode("ascii")) == got


def test_each_placeholder_becomes_the_mark_that_makes_real_words():
    text = (f"ข้อมูลที{P1}เป็นความลับ ตามที{P1}ตกลง เมื่อมีสิทธิ{P3} ผู้รับจ้างต้องเก็บรักษาไว้ "
            f"ขึ{P2}นสู่ศาล ทำให{P2}")
    out = resolve_marks(text, PH)
    assert out.startswith("ข้อมูลที่เป็นความลับ ตามที่ตกลง")
    assert "ขึ้นสู่ศาล" in out and out.endswith("ทำให้")
    assert not any(ch in out for ch in (P1, P2, P3))


def test_an_undecidable_placeholder_is_dropped_not_left_as_a_stray_letter():
    out = resolve_marks(f"ก{P1}ข", {P1: ("F", 1)})
    assert out == "กข"


def test_clean_reorders_nikhahit_and_closes_gaps_before_marks():
    assert clean("ทำซํ้า") == "ทำซ้ำ"
    assert clean("เป ็น ลิขสิทธิ ์") == "เป็น ลิขสิทธิ์"
    assert clean("A  B") == "A B"
