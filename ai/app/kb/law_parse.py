"""Split the text of an official law (PDF / TXT) into sections (FR-ADM-008).

Pure functions: text in, sections and warnings out. The statute text itself is never rewritten — only wrapped lines are
joined back together and page furniture (page numbers, gazette headers) is dropped. Anything the parser is unsure about
is reported as a warning for the editor to look at; the result is a DRAFT that a reviewer must still approve.
"""

import re
from dataclasses import dataclass, field

from app.kb.thai import SECTION_SUFFIXES, arabic, normalize_section_no, section_sort_key

_NUM = r"[0-9๐-๙]+(?:\s*/\s*[0-9๐-๙]+)?(?:\s*(?:" + "|".join(SECTION_SUFFIXES) + r"))?"
_HEAD = re.compile(rf"^\s*มาตรา\s+({_NUM})(?:\s+(.*))?$")
_STRUCT = re.compile(r"^\s*(บรรพ|ลักษณะ|หมวด|ส่วนที่|ส่วน|ภาค|ตอน)\s*([0-9๐-๙]+)?\s*(.*)$")
_PAGE_NO = re.compile(r"^\s*[-–—]?\s*[0-9๐-๙]{1,4}\s*[-–—]?\s*$")
# only lines that BEGIN like a gazette header: statute text itself mentions the gazette ("ประกาศในราชกิจจานุเบกษา")
_FURNITURE = re.compile(r"^\s*(ราชกิจจานุเบกษา|เล่ม\s*[0-9๐-๙]+|หน้า\s*[0-9๐-๙]+|ตอนที่\s*[0-9๐-๙]+)")
_REPEALED = re.compile(r"^\(?\s*ยกเลิก\s*\)?\.?$")


@dataclass
class ParsedSection:
    section_no: str
    body: str
    structure: list[dict[str, str]] = field(default_factory=list)
    repealed: bool = False


@dataclass
class ParsedLaw:
    sections: list[ParsedSection]
    warnings: list[str]

    def summary(self) -> dict[str, int]:
        return {"sections": len(self.sections), "warnings": len(self.warnings)}


def _key(no: str) -> tuple[int, ...]:
    return tuple(section_sort_key(no))


def parse_law_text(text: str) -> ParsedLaw:
    """A line that starts with "มาตรา N" opens a section only if N sorts after the previous section: a wrapped line that
    begins with a cross-reference ("มาตรา 383 นั้น …") goes backwards or repeats and stays part of the running text."""
    sections: list[ParsedSection] = []
    warnings: list[str] = []
    structure: dict[str, dict[str, str]] = {}
    current: ParsedSection | None = None
    lines: list[str] = []
    last_key: tuple[int, ...] | None = None
    ignored_refs = 0

    def close() -> None:
        nonlocal current, lines
        if current is not None:
            current.body = "\n".join(lines).strip()
            if _REPEALED.match(current.body):
                current.repealed = True
            if not current.body:
                warnings.append(f"มาตรา {current.section_no}: ไม่พบข้อความ")
            sections.append(current)
        current, lines = None, []

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            if lines and lines[-1] != "":
                lines.append("")  # a blank line separates paragraphs (วรรค)
            continue
        if _PAGE_NO.match(line) or (_FURNITURE.search(line) and len(line) < 90):
            continue
        head = _HEAD.match(line)
        if head:
            try:
                no = normalize_section_no(head.group(1))
            except ValueError:
                no = None
            if no is not None:
                key = _key(no)
                if last_key is None or key > last_key:
                    close()
                    if last_key is not None and key[0] - last_key[0] > 1 and key[1:] == (0, 0):
                        warnings.append(f"ข้ามเลขมาตราจาก {last_key[0]} ไป {no}")
                    current = ParsedSection(no, "", [dict(v) for v in structure.values()])
                    last_key = key
                    rest = (head.group(2) or "").strip()
                    lines = [rest] if rest else []
                    continue
                if current is not None and no == current.section_no:
                    warnings.append(f"มาตรา {no} ซ้ำในเอกสาร")
                ignored_refs += 1  # a reference at the start of a wrapped line, not a new section
        struct = _STRUCT.match(line)
        if struct and struct.group(2) is not None and len(line) < 90 and struct.group(1) in _LEVEL_ORDER:
            level = struct.group(1)
            close()
            structure = {k: v for k, v in structure.items() if _LEVEL_ORDER.get(k, 9) < _LEVEL_ORDER[level]}
            structure[level] = {"level": level, "no": arabic(struct.group(2)), "title": struct.group(3).strip()}
            continue
        if current is not None:
            lines.append(line.strip())
    close()

    # join wrapped lines inside a paragraph (statute wording is kept; only the line breaks of the layout go away)
    for s in sections:
        s.body = _unwrap(s.body)
    seen: dict[str, int] = {}
    for s in sections:
        seen[s.section_no] = seen.get(s.section_no, 0) + 1
    for no, n in seen.items():
        if n > 1:
            warnings.append(f"มาตรา {no} พบ {n} ครั้ง")
    if ignored_refs:
        warnings.append(f'บรรทัดที่ขึ้นต้นด้วย "มาตรา N" แต่ถือเป็นการอ้างถึง ไม่ใช่มาตราใหม่: {ignored_refs} จุด (ตรวจว่าไม่ตกมาตราใด)')
    if not sections:
        warnings.append("ไม่พบมาตราในเอกสารนี้ (อาจเป็นไฟล์สแกนหรือรูปแบบที่ไม่รองรับ)")
    return ParsedLaw(sections, warnings)


_LEVEL_ORDER = {"ภาค": 0, "บรรพ": 1, "ลักษณะ": 2, "หมวด": 3, "ส่วนที่": 4, "ส่วน": 4, "ตอน": 5}


def _unwrap(body: str) -> str:
    paragraphs = re.split(r"\n\s*\n", body.strip())
    out: list[str] = []
    for p in paragraphs:
        parts = [ln.strip() for ln in p.split("\n") if ln.strip()]
        joined = ""
        for ln in parts:
            # numbered items "(๑) …" keep their own lines; wrapped text joins with one space (a PDF breaks lines at
            # layout points, not at word boundaries, so one space is the conservative join)
            if not joined:
                joined = ln
            elif re.match(r"^\([0-9๐-๙]+\)", ln):
                joined += "\n" + ln
            else:
                joined += " " + ln
        out.append(joined)
    return "\n\n".join(out)


def diff_versions(old: dict[str, str], new: dict[str, str]) -> dict[str, list[str]]:
    """{'added': […], 'amended': […], 'repealed': […]} between two {section_no: body} maps (FR-ADM-009)."""
    norm = lambda s: re.sub(r"\s+", "", arabic(s))  # noqa: E731
    return {
        "added": sorted(set(new) - set(old), key=lambda n: _key(n)),
        "amended": sorted((n for n in set(old) & set(new) if norm(old[n]) != norm(new[n])), key=lambda n: _key(n)),
        "repealed": sorted(set(old) - set(new), key=lambda n: _key(n)),
    }
