"""Thai text helpers shared by the importer, retrieval and answer composer (docs/03-technical-spec.md §4.2, §6)."""

import re
from datetime import date

_THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")
SECTION_SUFFIXES = ("ทวิ", "ตรี", "จัตวา", "เบญจ", "ฉ", "สัตต", "อัฏฐ", "นว", "ทศ")
_ORDINALS = ("หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า", "สิบ")
_MONTHS = ("มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
           "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม")
_MONTHS_EN = ("January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December")
_SECTION_RE = re.compile(r"^(\d+)(?:/(\d+))?(?:\s*(" + "|".join(SECTION_SUFFIXES) + r"))?$")


def arabic(text: str) -> str:
    """Thai digits → Arabic digits (used for tokens and section numbers, never for stored statute text)."""
    return text.translate(_THAI_DIGITS)


def normalize_section_no(raw: str) -> str:
    """'๑๙๓/๓๔' → '193/34', '4ทวิ' → '4 ทวิ' (format of kb.law_sections.section_no)."""
    s = re.sub(r"\s+", "", arabic(raw.strip()))
    for suffix in SECTION_SUFFIXES:
        if s.endswith(suffix) and not s[: -len(suffix)].endswith(" "):
            s = s[: -len(suffix)] + " " + suffix
            break
    if not _SECTION_RE.match(s):
        raise ValueError(f"not a section number: {raw!r}")
    return s


def section_sort_key(section_no: str) -> list[int]:
    """'1336/1' → [1336, 1, 0]; '4 ทวิ' → [4, 0, 2] (docs/03-technical-spec.md §2.3.2)."""
    m = _SECTION_RE.match(section_no)
    if not m:
        raise ValueError(section_no)
    suffix = SECTION_SUFFIXES.index(m.group(3)) + 2 if m.group(3) else 0
    return [int(m.group(1)), int(m.group(2) or 0), suffix]


def paragraph_label(n: int) -> str:
    """1 → 'วรรคหนึ่ง'."""
    return "วรรค" + (_ORDINALS[n - 1] if 1 <= n <= len(_ORDINALS) else str(n))


def split_paragraphs(body: str) -> list[str]:
    """Statute text → paragraphs (วรรค). Numbered items '(๑) …' belong to the paragraph before them."""
    paragraphs: list[str] = []
    for block in re.split(r"\n\s*\n", body.strip()):
        block = block.strip()
        if not block:
            continue
        if paragraphs and re.match(r"^\([๐-๙0-9]+\)", block):
            paragraphs[-1] += "\n" + block
        else:
            paragraphs.append(block)
    return paragraphs


def format_date(d: date, locale: str = "th") -> str:
    """Display date: '29 กันยายน 2569' (Buddhist era) for th, '29 September 2026' for en (CLAUDE.md §6)."""
    if locale == "th":
        return f"{d.day} {_MONTHS[d.month - 1]} {d.year + 543}"
    return f"{d.day} {_MONTHS_EN[d.month - 1]} {d.year}"
