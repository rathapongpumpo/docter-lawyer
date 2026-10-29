"""PII masking before text leaves the request (company KB API, retrieval logs) — docs/03-technical-spec.md §4.3.1.

Masking is deterministic (regex + checksum). Names are not masked in Phase 1 (§4.3.1 note).
"""

import re
from dataclasses import dataclass

from app.kb.thai import arabic

_SEP = r"[-\s]?"
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CARD = re.compile(r"(?<!\d)(?:\d[-\s]?){12,18}\d(?!\d)")
_IDCARD = re.compile(rf"(?<!\d)\d{_SEP}\d{{4}}{_SEP}\d{{5}}{_SEP}\d{{2}}{_SEP}\d(?!\d)")
_ACCOUNT = re.compile(r"(?<!\d)\d(?:[-\s]?\d){9,11}(?!\d)")
_ACCOUNT_CONTEXT = re.compile(r"บัญชี|ธนาคาร|โอน|account|bank", re.I)
_PHONE = re.compile(rf"(?<![\d+])(?:\+66{_SEP}|0)"
                    rf"(?:[689]\d{_SEP}\d{{3}}{_SEP}\d{{4}}|[2-7]{_SEP}\d{{3}}{_SEP}\d{{4}})(?!\d)")
_PASSPORT = re.compile(r"(?<![A-Z0-9])[A-Z]{1,2}\d{6,7}(?![A-Z0-9])")
_PASSPORT_CONTEXT = re.compile(r"พาสปอร์ต|หนังสือเดินทาง|passport", re.I)

PLACEHOLDER = {
    "email": "[อีเมล]",
    "credit_card": "[เลขบัตร]",
    "national_id": "[เลขบัตรประชาชน]",
    "bank_account": "[เลขบัญชี]",
    "phone": "[เบอร์โทร]",
    "passport": "[เลขหนังสือเดินทาง]",
}


@dataclass(frozen=True)
class Masked:
    text: str
    pii_types: list[str]


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def _thai_id_ok(d: str) -> bool:
    if len(d) != 13:
        return False
    total = sum(int(d[i]) * (13 - i) for i in range(12))
    return (11 - total % 11) % 10 == int(d[12])


def _luhn_ok(d: str) -> bool:
    if not 13 <= len(d) <= 19:
        return False
    total = 0
    for i, ch in enumerate(reversed(d)):
        n = int(ch)
        if i % 2:
            n = n * 2 - 9 if n * 2 > 9 else n * 2
        total += n
    return total % 10 == 0


def _near(text: str, start: int, end: int, pattern: re.Pattern[str], window: int = 20) -> bool:
    return bool(pattern.search(text[max(0, start - window) : end + window]))


def mask_pii(text: str) -> Masked:
    # Detect on Arabic digits; the translation is 1:1 per character so spans line up with the original text.
    work = arabic(text)
    spans: list[tuple[int, int, str]] = []

    def taken(s: int, e: int) -> bool:
        return any(s < te and e > ts for ts, te, _ in spans)

    def add(pattern: re.Pattern[str], kind: str, check=None, context: re.Pattern[str] | None = None) -> None:
        for m in pattern.finditer(work):
            s, e = m.span()
            if taken(s, e) or (check and not check(_digits(m.group()))):
                continue
            if context is not None and not _near(work, s, e, context):
                continue
            spans.append((s, e, kind))

    add(_EMAIL, "email")
    add(_IDCARD, "national_id", _thai_id_ok)
    add(_CARD, "credit_card", _luhn_ok)
    add(_PHONE, "phone")
    add(_ACCOUNT, "bank_account", context=_ACCOUNT_CONTEXT)
    add(_PASSPORT, "passport", context=_PASSPORT_CONTEXT)

    out, pos = [], 0
    for s, e, kind in sorted(spans):
        out.append(text[pos:s])
        out.append(PLACEHOLDER[kind])
        pos = e
    out.append(text[pos:])
    return Masked("".join(out), sorted({k for _, _, k in spans}))
