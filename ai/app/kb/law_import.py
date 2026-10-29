"""Statute import from an uploaded file (FR-ADM-008/009): job `ingest_law` in two steps.

parse   read the stored file, split it into sections, compare with the law's current text → result with sections,
        warnings and a diff (added / amended / repealed). Nothing is written to kb.* yet, so an editor can look at the
        table and correct or drop rows.
commit  write a DRAFT kb.law_versions + kb.law_sections (+ search chunks with embeddings). The draft enters the review
        queue like any other statute; only a reviewer can publish it (CLAUDE.md §2.1 rule 4, rule 6).
"""

import hashlib
import html
import re
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from app.contracts.extract import UnsupportedFile, extract_pdf
from app.core import storage
from app.kb.law_parse import diff_versions, parse_law_text
from app.kb.thai import section_sort_key
from app.rag.embed import Embedder, to_pgvector
from app.rag.tokens import token_string

MAX_SECTIONS = 6000


def read_text(data: bytes, file_name: str) -> str:
    name = file_name.lower()
    if data[:5] == b"%PDF-" or name.endswith(".pdf"):
        ex = extract_pdf(data)
        if ex.is_scan:
            raise UnsupportedFile("scanned pdf: no text layer")
        return "\n".join(p.text for p in ex.pages)
    for enc in ("utf-8-sig", "cp874"):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise UnsupportedFile("unknown text encoding")
    if name.endswith((".htm", ".html")) or "<html" in text[:500].lower():
        text = re.sub(r"(?is)<(script|style).*?</\1>", "", text)
        text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", text)
        text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return text


def _current_sections(conn: Connection, law_id: int) -> dict[str, str]:
    row = conn.execute(
        """SELECT id FROM kb.law_versions WHERE law_id = %s
           ORDER BY (status = 'published') DESC, effective_from DESC NULLS LAST, id DESC LIMIT 1""",
        (law_id,),
    ).fetchone()
    if not row:
        return {}
    rows = conn.execute(
        "SELECT section_no, body FROM kb.law_sections WHERE law_version_id = %s", (row["id"],)
    ).fetchall()
    return {r["section_no"]: r["body"] for r in rows}


def parse_upload(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    law = conn.execute(
        "SELECT id, law_code, title_th FROM kb.laws WHERE law_code = %s", (payload["law_code"],)
    ).fetchone()
    if not law:
        return {"stage": "failed", "error": "unknown_law"}
    data = storage.get_bytes(payload["object_path"])
    try:
        text = read_text(data, payload.get("file_name", ""))
    except UnsupportedFile as exc:
        return {"stage": "failed", "error": str(exc)}
    parsed = parse_law_text(text)
    if len(parsed.sections) > MAX_SECTIONS:
        return {"stage": "failed", "error": "too_many_sections"}
    current = _current_sections(conn, law["id"])
    new = {s.section_no: s.body for s in parsed.sections}
    return {
        "stage": "parsed",
        "law_code": law["law_code"],
        "law_title": law["title_th"],
        "version_label": payload["version_label"],
        "file_name": payload.get("file_name", ""),
        "object_path": payload["object_path"],
        "sha256": hashlib.sha256(data).hexdigest(),
        "sections": [
            {"no": s.section_no, "body": s.body, "structure": s.structure, "repealed": s.repealed}
            for s in parsed.sections
        ],
        "warnings": parsed.warnings,
        "diff": diff_versions(current, new) if current else None,
        "compared_with_existing": bool(current),
    }


def commit_upload(conn: Connection, embedder: Embedder, payload: dict[str, Any]) -> dict[str, Any]:
    prev = conn.execute(
        "SELECT status::text AS status, result FROM app.jobs WHERE id = %s", (payload["parse_job_id"],)
    ).fetchone()
    if not prev or prev["status"] != "done" or (prev["result"] or {}).get("stage") != "parsed":
        return {"stage": "failed", "error": "parse_result_missing"}
    parsed = prev["result"]
    overrides: dict[str, str] = payload.get("overrides") or {}
    exclude = set(payload.get("exclude") or [])
    law = conn.execute(
        "SELECT id, law_code, title_th, short_name_th, category_ids FROM kb.laws WHERE law_code = %s",
        (parsed["law_code"],),
    ).fetchone()
    assert law is not None
    sections = [
        {**s, "body": overrides.get(s["no"], s["body"]).strip()} for s in parsed["sections"] if s["no"] not in exclude
    ]
    sections = [s for s in sections if s["body"]]
    if not sections:
        return {"stage": "failed", "error": "nothing_to_save"}
    label = parsed["version_label"]
    dup = conn.execute(
        "SELECT id FROM kb.law_versions WHERE law_id = %s AND version_label = %s", (law["id"], label)
    ).fetchone()
    if dup:
        return {"stage": "failed", "error": "version_label_exists"}
    # the diff of what is actually being saved (after the editor's corrections and omissions), not of the raw parse
    current = _current_sections(conn, law["id"])
    diff = diff_versions(current, {s["no"]: s["body"] for s in sections}) if current else {}
    report = {
        "file": parsed["file_name"],
        "sections": len(sections),
        "warnings": parsed["warnings"],
        "edited_sections": sorted(overrides),
        "excluded_sections": sorted(exclude),
    }
    note = "อัปโหลดจากไฟล์ — ต้องตรวจเทียบต้นฉบับทางการก่อนอนุมัติ และยืนยันวันมีผลใช้บังคับจากราชกิจจานุเบกษา"
    ver = conn.execute(
        """INSERT INTO kb.law_versions (law_id, version_label, source_file_path, source_sha256, parse_report, diff_summary,
                                        created_by, notes, effective_from, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, 'draft') RETURNING id""",
        (
            law["id"],
            label,
            parsed["object_path"],
            parsed["sha256"],
            Jsonb(report),
            Jsonb(diff),
            payload.get("created_by"),
            note,
        ),
    ).fetchone()
    assert ver is not None
    vid = int(ver["id"])
    chunks: list[tuple[int, str, str, dict[str, Any]]] = []
    for s in sections:
        source = {"source_id": None, "file": parsed["file_name"], "origin": "upload", "notes": []}
        row = conn.execute(
            """INSERT INTO kb.law_sections (law_version_id, law_id, section_no, sort_key, structure_path, body, body_tokens,
                                            is_repealed, effective_from, source)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s) RETURNING id""",
            (
                vid,
                law["id"],
                s["no"],
                section_sort_key(s["no"]),
                Jsonb(s.get("structure") or []),
                s["body"],
                token_string(s["body"]),
                bool(s.get("repealed")),
                Jsonb(source),
            ),
        ).fetchone()
        assert row is not None
        meta = {
            "law_code": law["law_code"],
            "section_no": s["no"],
            "url": f"/law/{law['law_code']}/{s['no']}",
            "law_title": law["title_th"],
            "source_id": None,
            "status": "draft",
        }
        chunks.append((int(row["id"]), f"{law['short_name_th']} มาตรา {s['no']}", s["body"], meta))
    vecs = embedder.embed_sync([f"{t}\n{b}" for _, t, b, _ in chunks])
    with conn.cursor() as cur:
        for (sid, title, body, meta), vec in zip(chunks, vecs, strict=True):
            tokens = token_string(f"{title} {body}")
            cur.execute(
                """INSERT INTO kb.chunks (source_type, source_id, source_version, law_id, category_ids, locale, chunk_index, title,
                                          content, content_tokens, embedding, token_count, effective_from, is_published, metadata)
                   VALUES ('law_section', %s, %s, %s, %s, 'th', 0, %s, %s, %s, %s::vector, %s, NULL, false, %s)""",
                (
                    sid,
                    vid,
                    law["id"],
                    list(law["category_ids"] or []),
                    title,
                    body,
                    tokens,
                    to_pgvector(vec),
                    len(tokens.split()),
                    Jsonb(meta),
                ),
            )
    return {"stage": "committed", "law_version_id": vid, "sections": len(sections)}


def ingest_law(conn: Connection, embedder: Embedder, payload: dict[str, Any]) -> dict[str, Any]:
    step = payload.get("step")
    if step == "parse":
        return parse_upload(conn, payload)
    if step == "commit":
        return commit_upload(conn, embedder, payload)
    raise ValueError(f"bad ingest_law payload: {payload}")
