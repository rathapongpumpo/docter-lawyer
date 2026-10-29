"""Repair Thai tone marks that a PDF's font map stores as ASCII letters (M12, FR-CR-002).

Word and similar tools export Thai text with fonts such as Angsana New. Marks drawn in a shifted position (a tone mark
above a tall letter, thanthakhat, …) are separate glyphs with no Unicode name ("glyph201"), and the PDF's ToUnicode map
gives them arbitrary ASCII characters: "ที่" comes out as "ที%", "ขึ้น" as "ขึKน", "สิทธิ์" as "สิทธิQ". The same glyph gets
a different letter in every font subset, so no fixed table can undo it.

What is certain from the font file itself: a glyph that has no advance width (it only adds a mark to the previous
letter) yet is mapped to a plain ASCII character is a Thai combining mark. We swap those characters for private
placeholders before extraction, then decide per placeholder which mark it is by asking which choice makes real
Thai words (PyThaiNLP word list) across the whole document. A placeholder that cannot be decided is dropped:
a missing mark is easier to read than a stray letter.
"""

import io
import re
from collections import defaultdict
from functools import lru_cache

_PLACEHOLDER_BASE = 0xE100          # private use area, outside the 0xF700 range clean() translates
_MARKS = "่้๊๋์็ัิีึืุูํฺ"
_THAI = re.compile(r"[ก-ฺเ-๎]")
_TRIPLE = re.compile(r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>")
_PAIR = re.compile(r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>")


def _parse_tounicode(cmap: str) -> dict[int, str]:
    """code → text, reading the bfchar and bfrange blocks separately (their entries look alike)."""
    out: dict[int, str] = {}
    for block in re.findall(r"beginbfchar(.*?)endbfchar", cmap, re.S):
        for src, dst in _PAIR.findall(block):
            try:
                out[int(src, 16)] = bytes.fromhex(dst).decode("utf-16-be")
            except (ValueError, UnicodeDecodeError):
                continue
    for block in re.findall(r"beginbfrange(.*?)endbfrange", cmap, re.S):
        for lo, hi, dst in _TRIPLE.findall(block):
            first, last = int(lo, 16), int(hi, 16)
            for code in range(first, min(last, first + 512) + 1):
                try:
                    text = bytes.fromhex(dst).decode("utf-16-be")
                except (ValueError, UnicodeDecodeError):
                    continue
                out[code] = text[:-1] + chr(ord(text[-1]) + code - first) if text else ""
    return out


def _build_tounicode(mapping: dict[int, str], width: int) -> bytes:
    lines = [f"<{code:0{width * 2}X}> <{value.encode('utf-16-be').hex().upper()}>"
             for code, value in sorted(mapping.items()) if value]
    body = "\n".join(lines)
    head = ("/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
            "/CMapName /Adobe-Identity-UCS def /CMapType 2 def")
    tail = "endcmap CMapName currentdict /CMap defineresource pop end end"
    return (f"{head}\n1 begincodespacerange <{'00' * width}> <{'FF' * width}> endcodespacerange\n"
            f"{len(lines)} beginbfchar\n{body}\nendbfchar\n{tail}").encode("ascii")


def _font_marks(font_dict) -> tuple[dict[int, str], list[int]] | None:
    """(ToUnicode map, codes of zero-width glyphs mapped to ASCII) for a simple TrueType font, else None."""
    from fontTools.ttLib import TTFont

    desc = font_dict.get("/FontDescriptor")
    data = desc.get_object().get("/FontFile2") if desc is not None else None
    if data is None or "/ToUnicode" not in font_dict:
        return None
    try:
        tt = TTFont(io.BytesIO(data.get_object().get_data()), lazy=True)
        glyphs: dict[int, str] = {}
        for table in tt["cmap"].tables:
            for code, glyph in table.cmap.items():
                glyphs[code & 0xFF if code >= 0xF000 else code] = glyph
        hmtx = tt["hmtx"]
        text = font_dict["/ToUnicode"].get_object().get_data().decode("latin1")
    except Exception:  # an unreadable font program is left alone
        return None
    mapping = _parse_tounicode(text)
    if not mapping or max(mapping) > 0xFF:
        return None  # CID fonts (two-byte codes) are not handled here
    codes = [c for c, g in glyphs.items()
             if g in hmtx.metrics and hmtx[g][0] == 0 and len(mapping.get(c, "")) == 1
             and mapping[c].isascii() and mapping[c].isprintable() and not mapping[c].isspace()]
    return (mapping, codes) if codes else None


def neutralise_unnamed_marks(reader) -> dict[str, tuple[str, int]]:
    """Point the ToUnicode map of every affected font at placeholders. Returns placeholder → (font name, code)."""
    from pypdf.generic import DecodedStreamObject, NameObject

    placeholders: dict[str, tuple[str, int]] = {}
    done: set[int] = set()
    for page in reader.pages:
        fonts = (page.get("/Resources") or {}).get("/Font") or {}
        for ref in fonts.values():
            font = ref.get_object()
            if id(font) in done:
                continue
            done.add(id(font))
            found = _font_marks(font)
            if not found:
                continue
            mapping, codes = found
            for code in codes:
                ph = chr(_PLACEHOLDER_BASE + len(placeholders))
                placeholders[ph] = (str(font.get("/BaseFont")), code)
                mapping[code] = ph
            stream = DecodedStreamObject()
            stream.set_data(_build_tounicode(mapping, 1))
            font[NameObject("/ToUnicode")] = stream
    return placeholders


@lru_cache(maxsize=1)
def _words() -> frozenset[str]:
    from pythainlp.corpus.common import thai_words

    return frozenset(w for w in thai_words() if len(w) >= 3)


def _score(text: str, at: int, mark: str) -> int:
    """How many dictionary words of 3+ letters this choice creates around position `at`."""
    left = _run(text[:at][::-1])[::-1]
    right = _run(text[at + 1:])
    s = left + mark + right
    i = len(left)
    words = _words()
    return sum(1 for a in range(max(0, i - 8), i + 1) for b in range(i + 1, min(len(s), i + 9) + 1)
               if b - a >= 3 and s[a:b] in words)


def _run(text: str) -> str:
    out = []
    for ch in text[:10]:
        if not _THAI.match(ch):
            break
        out.append(ch)
    return "".join(out)


def resolve_marks(text: str, placeholders: dict[str, tuple[str, int]]) -> str:
    """Replace each placeholder by the mark that forms the most real Thai words; drop the ones that stay undecided."""
    for ph in placeholders:
        spots = [m.start() for m in re.finditer(re.escape(ph), text)]
        if not spots:
            continue
        totals: dict[str, int] = defaultdict(int)
        for at in spots:
            for mark in _MARKS:
                totals[mark] += _score(text, at, mark)
        ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
        best, second = ranked[0], ranked[1]
        choice = best[0] if best[1] > 0 and best[1] > second[1] else ""
        text = text.replace(ph, choice)
    return text
