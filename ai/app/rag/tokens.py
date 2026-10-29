"""Lexical tokens for kb.chunks.content_tokens / law_sections.body_tokens and for queries
(docs/03-technical-spec.md §4.5).

PyThaiNLP newmm word segmentation, Thai digits → Arabic, stopwords and punctuation dropped.
"""

import re
from functools import lru_cache

from app.kb.thai import arabic

_KEEP_RE = re.compile(r"[0-9A-Za-z฀-๿]")
_EXTRA_STOP = {"ๆ", "ฯ", "ครับ", "ค่ะ", "คะ", "นะ", "จ้ะ", "จ้า", "ไหม", "มั้ย", "หรือเปล่า", "บ้าง", "อยู่", "แล้ว"}


@lru_cache(maxsize=1)
def _engine():  # imported lazily: loading the dictionary takes ~1 s
    from pythainlp.corpus import thai_stopwords
    from pythainlp.tokenize import word_tokenize

    return word_tokenize, frozenset(thai_stopwords()) | _EXTRA_STOP


def tokenize(text: str) -> list[str]:
    word_tokenize, stop = _engine()
    out: list[str] = []
    for tok in word_tokenize(arabic(text).lower(), engine="newmm", keep_whitespace=False):
        tok = tok.strip()
        if not tok or tok in stop or not _KEEP_RE.search(tok):
            continue
        out.append(tok)
    return out


def token_string(text: str) -> str:
    return " ".join(tokenize(text))


def tsquery_any(tokens: list[str]) -> str | None:
    """OR-query for to_tsquery('simple', …); every lexeme is quoted so user text cannot inject operators."""
    uniq = list(dict.fromkeys(t for t in tokens if t))
    if not uniq:
        return None
    return " | ".join("'" + t.replace("'", "''").replace("\\", "") + "'" for t in uniq)
