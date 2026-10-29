"""Reference syntax inside knowledge-base Markdown (docs/03-technical-spec.md §6.2):
[[law:ccc:420]] · [[law:ccc:381#p3]] · [[law:lpa_2541:118|label]] · [[term:เบี้ยปรับ]]
· [[guide:<slug>]] · [[template:<slug>]]
"""

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.kb.thai import normalize_section_no

REF_RE = re.compile(r"\[\[(law|term|guide|template|article|judgment|help|data):([^\]|]+?)(?:\|([^\]]+))?\]\]")


@dataclass(frozen=True)
class Ref:
    kind: str
    value: str
    label: str | None
    start: int
    end: int

    @property
    def law(self) -> tuple[str, str, int | None]:
        """('ccc', '381', 3) for 'ccc:381#p3'."""
        code, _, rest = self.value.partition(":")
        section, _, para = rest.partition("#")
        paragraph = int(para[1:]) if para.startswith("p") and para[1:].isdigit() else None
        return code.strip(), normalize_section_no(section), paragraph


def find_refs(text: str) -> list[Ref]:
    return [Ref(m.group(1), m.group(2).strip(), m.group(3), m.start(), m.end()) for m in REF_RE.finditer(text)]


def law_refs(text: str) -> list[tuple[str, str]]:
    """Unique (law_code, section_no) pairs in order of appearance."""
    seen: dict[tuple[str, str], None] = {}
    for ref in find_refs(text):
        if ref.kind == "law":
            code, section, _ = ref.law
            seen.setdefault((code, section), None)
    return list(seen)


def replace_refs(text: str, render: Callable[[Ref], str]) -> str:
    out: list[str] = []
    pos = 0
    for ref in find_refs(text):
        out.append(text[pos : ref.start])
        out.append(render(ref))
        pos = ref.end
    out.append(text[pos:])
    return "".join(out)
