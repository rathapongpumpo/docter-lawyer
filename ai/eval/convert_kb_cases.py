"""docs/knowledge-base/eval/breach-of-contract-cases.md → eval/golden/core_th.jsonl (docs/03-technical-spec.md §4.10).

  python -m eval.convert_kb_cases /kb/eval/breach-of-contract-cases.md eval/golden/core_th.jsonl

`must_cite` comes from the [[law:…]] references of each case; `expected_points` keeps the reviewer-facing wording.
`reference_answer` stays empty: a Legal Reviewer writes it (CLAUDE.md §2.1 rule 6a — no invented reviews).
"""

import json
import re
import sys
from pathlib import Path

from app.kb.refs import find_refs

CASE_RE = re.compile(r"^### ([A-Z]\d+)\b(.*)$", re.M)
FIELD_RE = re.compile(r"^- \*\*([a-z_ก-๙]+):\*\*\s*(.*)$")
GROUPS = {"A": "CONTRACT.PENALTY", "B": "CONTRACT.SALE", "C": "CONTRACT.HIRE", "D": "CONTRACT.UNFAIR"}


def split_fields(block: str) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    current: str | None = None
    for line in block.splitlines():
        m = FIELD_RE.match(line)
        if m:
            current = m.group(1)
            fields[current] = [m.group(2)] if m.group(2) else []
        elif current and re.match(r"^\s+- ", line):
            fields[current].append(line.strip()[2:])
    return fields


def points(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values:
        out += [p.strip() for p in v.split(" · ") if p.strip()]
    return out


def convert(md: str) -> list[dict]:
    body = md.split("## A.", 1)[1]
    cases: dict[str, dict] = {}
    parts = CASE_RE.split("## A." + body)
    # parts: [prefix, id, title, block, id, title, block, ...]
    prev_facts: dict[str, str] = {}
    for i in range(1, len(parts), 3):
        cid, title, block = parts[i], parts[i + 1].strip(" ()"), parts[i + 2]
        group = cid[0]
        if group == "D":
            continue                              # contract review (M12) has its own set: contract_review_th
        f = split_fields(block)
        facts = " ".join(f.get("ข้อเท็จจริง", [])).strip()
        if facts.startswith("เหมือน"):
            facts = prev_facts.get(cid[0] + "1", "") + " " + facts
        prev_facts.setdefault(cid, facts)
        question = " ".join(f.get("คำถาม", [])).strip() or "ต้องทำอย่างไรต่อ"
        text = f"{facts} {question}".strip()
        must = points(f.get("must_mention", []))
        cites = []
        for ref in find_refs(" ".join(f.get("must_mention", []))):
            if ref.kind == "law":
                code, sec, _ = ref.law
                if f"{code}:{sec}" not in cites:
                    cites.append(f"{code}:{sec}")
        not_say = points(f.get("must_not_say", []))
        quoted = [m for p in not_say for m in re.findall(r'"([^"]+)"', p)]
        safety = f.get("safety_notice", [""])[0]
        cases[cid] = {
            "id": f"CONTRACT-{cid}", "set_name": "core_th", "locale": "th", "category": [GROUPS[group]],
            "intent": "legal_question", "level": "simple", "as_of": None, "history": [], "question": text,
            "scope": "auto", "must_cite": cites, "may_cite": [], "must_not_cite": [],
            "must_include": [], "must_not_include": [q for q in quoted if "..." not in q],
            "expected_points": [re.sub(r"\s*\[\[[^\]]+\]\]", "", p).strip() for p in must],
            "must_not_say_notes": [re.sub(r'"[^"]+"', "", p).strip(" ·") or p for p in not_say],
            "expected_safety": "deadline_imminent" if "deadline_imminent" in safety else None,
            "expected_clarification": bool(f.get("expected_clarifying_questions")),
            "expected_refusal": False, "reference_answer": "",
            "notes": title, "author": "kb-seed", "reviewed_at": None, "tags": ["p1", "contract", "unreviewed"],
        }
    return list(cases.values())


def main(src: Path, dst: Path) -> None:
    cases = convert(src.read_text(encoding="utf-8"))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in cases), encoding="utf-8")
    print(f"{len(cases)} cases → {dst}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
