"""Parsers for docs/knowledge-base/ files (format described in its README.md).

Statute text is kept verbatim: nothing here rewrites words inside a section body.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.kb.thai import normalize_section_no

_FRONT_RE = re.compile(r"^---\n(.*?)\n---\n?", re.S)
_SECTION_HEAD_RE = re.compile(r"^###\s+มาตรา\s+(.+?)\s*$")
_SOURCE_RE = re.compile(r"^แหล่งที่มา:\s*(S\d+)\b(.*)$")


def split_front_matter(text: str) -> tuple[dict[str, Any], str]:
    m = _FRONT_RE.match(text)
    if not m:
        return {}, text
    return yaml.safe_load(m.group(1)) or {}, text[m.end() :]


@dataclass
class LawSectionSrc:
    section_no: str
    body: str
    source_id: str | None
    notes: list[str] = field(default_factory=list)


@dataclass
class LawFile:
    path: str
    meta: dict[str, Any]
    sections: list[LawSectionSrc]
    skipped_blocks: list[str]


def parse_law_file(path: Path, root: Path) -> LawFile:
    """'### มาตรา ๓๘๑' blocks → sections. A '## …' heading ends the statute part (e.g. superseded historical text)."""
    meta, body = split_front_matter(path.read_text(encoding="utf-8"))
    sections: list[LawSectionSrc] = []
    skipped: list[str] = []
    current: LawSectionSrc | None = None
    lines: list[str] = []

    def close() -> None:
        nonlocal current, lines
        if current is not None:
            current.body = "\n".join(lines).strip()
            if not current.body:
                raise ValueError(f"{path.name}: empty section {current.section_no}")
            sections.append(current)
        current, lines = None, []

    in_statute = True
    for line in body.splitlines():
        if line.startswith("## "):  # everything after a '## ' heading is outside the current text (e.g. history)
            close()
            skipped.append(line[3:].strip())
            in_statute = False
            continue
        if not in_statute:
            continue
        head = _SECTION_HEAD_RE.match(line)
        if head:
            close()
            current = LawSectionSrc(normalize_section_no(head.group(1)), "", None)
            continue
        if line.startswith("# "):
            close()
            continue
        if current is None:
            continue
        src = _SOURCE_RE.match(line.strip())
        if src:
            current.source_id = src.group(1)
            if src.group(2).strip():
                current.notes.append(src.group(2).strip(" ()"))
            continue
        if line.startswith(">"):
            current.notes.append(line.lstrip("> ").strip())
            continue
        lines.append(line)
    close()

    declared = [normalize_section_no(s) for s in meta.get("sections", [])]
    found = [s.section_no for s in sections]
    if declared and sorted(declared) != sorted(found):
        raise ValueError(f"{path.name}: front-matter sections {declared} ≠ parsed {found}")
    return LawFile(str(path.relative_to(root)), meta, sections, skipped)


@dataclass
class MdSection:
    heading: str
    md: str


@dataclass
class MdDoc:
    path: str
    meta: dict[str, Any]
    title: str
    intro: str
    sections: list[MdSection]
    raw_body: str


def parse_md_doc(path: Path, root: Path) -> MdDoc:
    """Article / guide / template: H1 title, optional intro, then '## ' sections (### stays inside its section)."""
    meta, body = split_front_matter(path.read_text(encoding="utf-8"))
    doc = parse_md_text(body, meta.get("title", ""))
    return MdDoc(str(path.relative_to(root)), meta, doc.title, doc.intro, doc.sections, body)


def parse_md_text(body: str, title: str = "") -> MdDoc:
    """Same as parse_md_doc for a Markdown string already stored in the database."""
    meta: dict[str, Any] = {}
    intro: list[str] = []
    sections: list[MdSection] = []
    current: MdSection | None = None
    in_code = False
    for line in body.splitlines():
        if line.startswith("```"):
            in_code = not in_code
        if not in_code and line.startswith("# ") and not title:
            title = line[2:].strip()
            continue
        if not in_code and line.startswith("# "):
            continue
        if not in_code and line.startswith("## "):
            current = MdSection(line[3:].strip(), "")
            sections.append(current)
            continue
        if current is None:
            intro.append(line)
        else:
            current.md += line + "\n"
    for s in sections:
        s.md = s.md.strip()
    return MdDoc("", meta, title, "\n".join(intro).strip(), sections, body)


@dataclass
class GlossaryRow:
    term_th: str
    term_en: str | None
    aliases: list[str]
    short_def: str
    refs_md: str


def parse_glossary(path: Path) -> tuple[dict[str, Any], list[GlossaryRow]]:
    meta, body = split_front_matter(path.read_text(encoding="utf-8"))
    rows: list[GlossaryRow] = []
    for line in body.splitlines():
        if not line.startswith("|") or line.startswith("|---") or line.startswith("| คำ |"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 5:
            raise ValueError(f"{path.name}: glossary row needs 5 columns: {line}")
        term, en, aliases, short_def, refs_md = cells
        rows.append(GlossaryRow(
            term_th=term,
            term_en=None if en in ("", "—") else en,
            aliases=[] if aliases in ("", "—") else [a.strip() for a in aliases.split(",") if a.strip()],
            short_def=short_def,
            refs_md=refs_md,
        ))
    return meta, rows


def load_yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))
