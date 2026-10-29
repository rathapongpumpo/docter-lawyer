"""Import docs/knowledge-base/ into kb.* and build kb.chunks (docs/03-technical-spec.md §2.8, §4.5, §6.2).

Rules (docs/knowledge-base/README.md):
- statuses are never raised: a `draft` file becomes a `draft` row; published rows are never modified by the importer
- statute bodies are stored verbatim; only tokens/embeddings use normalized text
- re-running is idempotent and keeps row ids stable (message citations point at them)
Runs as lc_worker (INSERT/UPDATE on kb.*) — see `python -m app.cli seed-kb`.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from app.kb.refs import Ref, law_refs, replace_refs
from app.kb.source_files import (
    LawFile,
    MdDoc,
    load_yaml,
    parse_glossary,
    parse_law_file,
    parse_md_doc,
)
from app.kb.thai import arabic, paragraph_label, section_sort_key
from app.rag.embed import Embedder, to_pgvector
from app.rag.tokens import token_string

_SLUG_NOTE_RE = re.compile(r"\s*\(slug `[^`]+`\)")


def render_plain(md: str, law_names: dict[str, str], titles: dict[tuple[str, str], str]) -> str:
    """Refs → readable text for chunk content (embedding + lexical). Shared by the importer and the rebuild job."""
    def render(ref: Ref) -> str:
        if ref.kind == "law":
            code, sec, para = ref.law
            return f"({law_names.get(code, code)} มาตรา {sec}{' ' + paragraph_label(para) if para else ''})"
        if ref.kind == "term":
            return ref.label or ref.value
        title = titles.get((ref.kind, ref.value))
        return f"“{title}”" if title else (ref.label or ref.value)
    return _SLUG_NOTE_RE.sub("", replace_refs(md, render))


def content_hash(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()


def _md5(c: "ChunkRow") -> str:
    return hashlib.md5(f"{c.title}\x1f{c.content}".encode()).hexdigest()


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


@dataclass
class ChunkRow:
    source_type: str
    source_id: int
    source_version: int
    title: str
    content: str
    category_ids: list[int]
    is_published: bool
    law_id: int | None = None
    chunk_index: int = 0
    effective_from: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def embed_text(self) -> str:
        return f"{self.title}\n{arabic(self.content)}"


@dataclass
class ImportReport:
    categories: int = 0
    laws: int = 0
    sections: int = 0
    articles: int = 0
    guides: int = 0
    templates: int = 0
    glossary: int = 0
    chunks: int = 0
    embedded: int = 0
    warnings: list[str] = field(default_factory=list)


class KbImporter:
    def __init__(self, conn: Connection, root: Path, embedder: Embedder | None) -> None:
        self.conn = conn
        self.root = root
        self.embedder = embedder
        self.report = ImportReport()
        self.category_ids: dict[str, int] = {}
        self.laws: dict[str, dict[str, Any]] = {}          # law_code → registry entry + id + version
        self.section_ids: dict[tuple[str, str], int] = {}  # (law_code, section_no) → kb.law_sections.id
        self.section_cats: dict[tuple[str, str], set[str]] = {}
        self.titles: dict[tuple[str, str], str] = {}       # (kind, slug) → title for rendering [[guide:…]] etc.
        self.chunks: list[ChunkRow] = []

    # ------------------------------------------------------------------ entry point
    def run(self) -> ImportReport:
        docs = {
            "article": [parse_md_doc(p, self.root) for p in sorted((self.root / "articles").rglob("*.md"))],
            "guide": [parse_md_doc(p, self.root) for p in sorted((self.root / "guides").glob("*.md"))],
            "template": [parse_md_doc(p, self.root) for p in sorted((self.root / "templates").glob("*.md"))],
        }
        for kind, items in docs.items():
            for d in items:
                self.titles[(kind, d.meta["slug"])] = d.title

        with self.conn.transaction():
            self._categories()
            self._laws()
            for d in docs["article"]:
                self._article(d)
            for d in docs["guide"]:
                self._guide(d)
            for d in docs["template"]:
                self._template(d)
            self._glossary()
            self._write_chunks()
        return self.report

    # ------------------------------------------------------------------ taxonomy
    def _categories(self) -> None:
        for i, cat in enumerate(load_yaml(self.root / "taxonomy.yaml")["categories"]):
            self._upsert_category(cat["code"], None, cat["name_th"], cat.get("name_en", ""), sort=i)
        tax = load_yaml(self.root / "taxonomy-contract.yaml")
        for cat in tax["categories"]:
            parent = self._upsert_category(cat["code"], None, cat["name_th"], cat.get("name_en", ""), top=True)
            for i, sub in enumerate(cat.get("sub_categories", [])):
                self._upsert_category(sub["code"], parent, sub["name_th"], sub.get("name_en", ""), sort=i)
                for basis in sub.get("laws", []):
                    for sec in basis["sections"]:
                        self.section_cats.setdefault((basis["law"], sec), set()).update({cat["code"], sub["code"]})

    def _upsert_category(self, code: str, parent: int | None, name_th: str, name_en: str,
                         top: bool = False, sort: int = 0) -> int:
        if top:  # the 18 top-level categories are seeded by migration 0002 — keep their names
            row = self.conn.execute("SELECT id FROM kb.categories WHERE code = %s", (code,)).fetchone()
            if row:
                self.category_ids[code] = row["id"]
                return int(row["id"])
        row = self.conn.execute(
            """INSERT INTO kb.categories (code, parent_id, name_th, name_en, sort_order)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th, parent_id = EXCLUDED.parent_id,
                                               sort_order = EXCLUDED.sort_order, updated_at = now()
               RETURNING id""",
            (code, parent, name_th, name_en, sort),
        ).fetchone()
        assert row is not None
        self.category_ids[code] = row["id"]
        self.report.categories += 1
        return int(row["id"])

    def _cat_ids(self, codes: list[str]) -> list[int]:
        ids: list[int] = []
        for code in codes:
            parts = code.split(".")
            for i in range(1, len(parts) + 1):  # 'CONTRACT.PENALTY' also tags 'CONTRACT'
                cid = self.category_ids.get(".".join(parts[:i]))
                if cid is not None and cid not in ids:
                    ids.append(cid)
                elif cid is None:
                    self._warn(f"unknown category {code}")
        return ids

    # ------------------------------------------------------------------ laws
    def _laws(self) -> None:
        registry = {e["law_code"]: e for e in load_yaml(self.root / "laws" / "_registry.yaml")["laws"]}
        files: dict[str, list[LawFile]] = {}
        for path in sorted((self.root / "laws").glob("*.md")):
            lf = parse_law_file(path, self.root)
            files.setdefault(lf.meta["law"], []).append(lf)

        for code, law_files in files.items():
            entry = registry.get(code)
            if entry is None:
                raise ValueError(f"law {code} is not in laws/_registry.yaml")
            law_id = self._upsert_law(entry)
            version_id, status = self._draft_version(law_id, entry, law_files)
            self.laws[code] = {**entry, "id": law_id, "version_id": version_id, "status": status}
            if status == "published":
                self._warn(f"{code}: version already published — importer leaves it untouched")
                continue
            keep: list[str] = []
            for lf in law_files:
                for sec in lf.sections:
                    self._upsert_section(code, law_id, version_id, entry, lf, sec)
                    keep.append(sec.section_no)
            # statute rows are never deleted (CLAUDE.md §2.1 rule 6) — report sections that left the source files
            gone = self.conn.execute(
                "SELECT section_no FROM kb.law_sections WHERE law_version_id = %s AND NOT (section_no = ANY(%s))",
                (version_id, keep)).fetchall()
            for row in gone:
                self._warn(f"{code} มาตรา {row['section_no']} is in the database but no longer in laws/*.md")
            self.report.laws += 1

    def _upsert_law(self, e: dict[str, Any]) -> int:
        cats = self._cat_ids(e.get("categories", []))
        row = self.conn.execute(
            """INSERT INTO kb.laws (law_code, law_type, title_th, short_name_th, aliases, year_be,
                                    primary_category_id, category_ids, official_url)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (law_code) DO UPDATE SET law_type = EXCLUDED.law_type, title_th = EXCLUDED.title_th,
                 short_name_th = EXCLUDED.short_name_th, aliases = EXCLUDED.aliases, year_be = EXCLUDED.year_be,
                 primary_category_id = EXCLUDED.primary_category_id, category_ids = EXCLUDED.category_ids,
                 official_url = EXCLUDED.official_url, updated_at = now()
               RETURNING id""",
            (e["law_code"], e["law_type"], e["title_th"], e["short_name_th"], e.get("aliases", []), e.get("year_be"),
             cats[0] if cats else None, cats, e.get("official_url")),
        ).fetchone()
        assert row is not None
        return int(row["id"])

    def _draft_version(self, law_id: int, e: dict[str, Any], law_files: list[LawFile]) -> tuple[int, str]:
        report = {
            "files": [lf.path for lf in law_files],
            "sections": sum(len(lf.sections) for lf in law_files),
            "skipped_blocks": [b for lf in law_files for b in lf.skipped_blocks],
            "source_ids": e.get("source_ids", []),
            "as_of_law": [lf.meta.get("verification", {}).get("as_of_law") for lf in law_files],
        }
        pending = "\n".join(p for lf in law_files if (p := lf.meta.get("verification", {}).get("pending")))
        row = self.conn.execute(
            """SELECT id, status FROM kb.law_versions WHERE law_id = %s AND version_label = %s
               ORDER BY id DESC LIMIT 1""",
            (law_id, e["version_label"]),
        ).fetchone()
        if row and row["status"] in ("published", "archived"):
            return int(row["id"]), str(row["status"])
        params = (e.get("gazette_ref"), ", ".join(report["files"]), Jsonb(report), pending or None)
        if row:
            self.conn.execute(
                """UPDATE kb.law_versions SET gazette_ref = %s, source_file_path = %s, parse_report = %s, notes = %s,
                          updated_at = now() WHERE id = %s""",
                (*params, row["id"]),
            )
            return int(row["id"]), str(row["status"])
        new = self.conn.execute(
            """INSERT INTO kb.law_versions (law_id, version_label, gazette_ref, source_file_path, parse_report, notes,
                                            effective_from, status)
               VALUES (%s, %s, %s, %s, %s, %s, NULL, 'draft') RETURNING id""",
            (law_id, e["version_label"], *params),
        ).fetchone()
        assert new is not None
        return int(new["id"]), "draft"

    def _upsert_section(self, code: str, law_id: int, version_id: int, e: dict[str, Any], lf: LawFile, sec) -> None:
        eff = (e.get("section_effective_from") or {}).get(sec.section_no)
        source = {"source_id": sec.source_id, "file": lf.path, "notes": sec.notes,
                  "official_url": (e.get("section_official_url") or {}).get(sec.section_no) or e.get("official_url")}
        row = self.conn.execute(
            """INSERT INTO kb.law_sections (law_version_id, law_id, section_no, sort_key, body, body_tokens,
                                            effective_from, source)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (law_version_id, section_no) DO UPDATE SET sort_key = EXCLUDED.sort_key,
                 body = EXCLUDED.body,
                 body_tokens = EXCLUDED.body_tokens, effective_from = EXCLUDED.effective_from, source = EXCLUDED.source,
                 updated_at = now()
               RETURNING id""",
            (version_id, law_id, sec.section_no, section_sort_key(sec.section_no), sec.body, token_string(sec.body),
             eff, Jsonb(source)),
        ).fetchone()
        assert row is not None
        sid = int(row["id"])
        self.section_ids[(code, sec.section_no)] = sid
        self.report.sections += 1
        cats = sorted(self.section_cats.get((code, sec.section_no), set()) or set(e.get("categories", [])[:1]))
        self.chunks.append(ChunkRow(
            "law_section", sid, version_id, f"{e['short_name_th']} มาตรา {sec.section_no}", sec.body,
            self._cat_ids(cats), False, law_id=law_id, effective_from=eff,
            metadata={"law_code": code, "section_no": sec.section_no, "url": f"/law/{code}/{sec.section_no}",
                      "law_title": e["title_th"], "source_id": sec.source_id, "status": "draft"},
        ))

    # ------------------------------------------------------------------ rendering helpers
    def render_plain(self, md: str) -> str:
        """Refs → readable text for chunk content (embedding + lexical)."""
        return render_plain(md, {c: law["short_name_th"] for c, law in self.laws.items()}, self.titles)

    def _check_refs(self, doc: MdDoc) -> list[dict[str, str]]:
        sources: list[dict[str, str]] = []
        for code, sec in law_refs(doc.raw_body):
            if (code, sec) not in self.section_ids:
                self._warn(f"{doc.path}: [[law:{code}:{sec}]] is not in laws/")
            sources.append({"kind": "law_section", "law_code": code, "section_no": sec})
        return sources

    def _doc_chunks(self, source_type: str, source_id: int, version: int, doc: MdDoc, title_prefix: str,
                    url: str, cats: list[int], skip: tuple[str, ...] = ()) -> None:
        for i, s in enumerate(doc.sections):
            if s.heading in skip or not s.md:
                continue
            self.chunks.append(ChunkRow(
                source_type, source_id, version, f"{title_prefix}{doc.title} › {s.heading}", self.render_plain(s.md),
                cats, doc.meta.get("status") == "published", chunk_index=i,
                metadata={"slug": doc.meta["slug"], "heading": s.heading, "section_index": i, "url": url,
                          "doc_title": doc.title, "status": doc.meta.get("status", "draft")},
            ))

    # ------------------------------------------------------------------ articles
    def _article(self, doc: MdDoc) -> None:
        m = doc.meta
        cats = self._cat_ids([m["primary_category"], *m.get("sub_categories", [])])
        row = self.conn.execute(
            """INSERT INTO kb.articles (slug, category_id, extra_category_ids, level)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id,
                 extra_category_ids = EXCLUDED.extra_category_ids, level = EXCLUDED.level, updated_at = now()
               RETURNING id""",
            (m["slug"], cats[0], cats[1:], m.get("level", "basic")),
        ).fetchone()
        assert row is not None
        article_id = int(row["id"])
        sources = self._check_refs(doc)
        chash = content_hash(doc.title, doc.raw_body)
        note = (m.get("verification") or {}).get("pending")
        latest = self.conn.execute(
            """SELECT id, version_no, status, content_hash, edited_in_app FROM kb.article_versions
               WHERE article_id = %s AND locale = 'th' ORDER BY version_no DESC LIMIT 1""",
            (article_id,),
        ).fetchone()
        if latest and latest["status"] == "draft" and latest["edited_in_app"]:
            self._warn(f"{doc.path}: draft was edited in the back-office — importer leaves it untouched")
            self.conn.execute("UPDATE kb.articles SET current_version_id = %s WHERE id = %s",
                              (latest["id"], article_id))
            return
        if latest and latest["status"] == "draft":
            self.conn.execute(
                """UPDATE kb.article_versions SET title = %s, summary = %s, body_md = %s, sources = %s,
                          content_hash = %s,
                          change_note = %s, updated_at = now() WHERE id = %s""",
                (doc.title, m.get("summary"), doc.raw_body, Jsonb(sources), chash, note, latest["id"]),
            )
            version_id = int(latest["id"])
        elif latest and latest["content_hash"] == chash:
            if latest["status"] != "draft":
                # a published or archived version already matches the file: leave it and its search chunks alone
                self.report.articles += 1
                return
            version_id = int(latest["id"])
        else:
            new = self.conn.execute(
                """INSERT INTO kb.article_versions (article_id, version_no, locale, title, summary, body_md, sources,
                                                    content_hash, status, change_note)
                   VALUES (%s, %s, 'th', %s, %s, %s, %s, %s, 'draft', %s) RETURNING id""",
                (article_id, (latest["version_no"] + 1) if latest else 1, doc.title, m.get("summary"), doc.raw_body,
                 Jsonb(sources), chash, note),
            ).fetchone()
            assert new is not None
            version_id = int(new["id"])
        self.conn.execute("UPDATE kb.articles SET current_version_id = %s WHERE id = %s", (version_id, article_id))
        self._doc_chunks("article", article_id, version_id, doc, "", f"/library/articles/{m['slug']}", cats)
        self.report.articles += 1

    # ------------------------------------------------------------------ guides / templates (row-per-version)
    def _row_version(self, table: str, slug: str) -> dict[str, Any] | None:
        return self.conn.execute(
            f"SELECT id, version_no, status, edited_in_app FROM kb.{table} WHERE slug = %s AND locale = 'th' "
            "ORDER BY version_no DESC LIMIT 1",
            (slug,),
        ).fetchone()

    def _guide(self, doc: MdDoc) -> None:
        m = doc.meta
        cats = self._cat_ids([m["primary_category"], *m.get("sub_categories", [])])
        self._check_refs(doc)
        body = {"format": "md", "md": doc.raw_body, "title_en": m.get("title_en"),
                "checklist_keys": m.get("checklist_keys", []),
                "legal_basis": m.get("legal_basis", []), "related": m.get("related", {}),
                "verification": m.get("verification", {}), "extra_category_ids": cats[1:]}
        latest = self._row_version("guides", m["slug"])
        if latest and latest["status"] == "draft" and latest["edited_in_app"]:
            self._warn(f"{doc.path}: draft was edited in the back-office — importer leaves it untouched")
            return
        if latest and latest["status"] != "draft":
            self._warn(f"{doc.path}: guide has a {latest['status']} version — importer leaves it untouched")
            return
        if latest:
            self.conn.execute(
                """UPDATE kb.guides SET category_id = %s, title = %s, summary = %s, body = %s, updated_at = now()
                   WHERE id = %s""",
                (cats[0], doc.title, m.get("summary"), Jsonb(body), latest["id"]),
            )
            gid, ver = int(latest["id"]), int(latest["version_no"])
        else:
            row = self.conn.execute(
                """INSERT INTO kb.guides (slug, version_no, locale, category_id, title, summary, body, status)
                   VALUES (%s, 1, 'th', %s, %s, %s, %s, 'draft') RETURNING id""",
                (m["slug"], cats[0], doc.title, m.get("summary"), Jsonb(body)),
            ).fetchone()
            assert row is not None
            gid, ver = int(row["id"]), 1
        self._doc_chunks("guide", gid, ver, doc, "คู่มือ: ", f"/guides/{m['slug']}", cats, skip=("ฐานกฎหมาย",))
        self.report.guides += 1

    def _template(self, doc: MdDoc) -> None:
        m = doc.meta
        cats = self._cat_ids([m["primary_category"], *m.get("sub_categories", [])])
        self._check_refs(doc)
        latest = self._row_version("templates", m["slug"])
        if latest and latest["status"] == "draft" and latest["edited_in_app"]:
            self._warn(f"{doc.path}: draft was edited in the back-office — importer leaves it untouched")
            return
        if latest and latest["status"] != "draft":
            self._warn(f"{doc.path}: template has a {latest['status']} version — importer leaves it untouched")
            return
        legal_basis = Jsonb(m.get("legal_basis", []))
        formats = m.get("output_formats", ["docx", "pdf"])
        if latest:
            self.conn.execute(
                """UPDATE kb.templates SET category_id = %s, title = %s, description_md = %s, legal_basis = %s,
                          output_formats = %s, updated_at = now() WHERE id = %s""",
                (cats[0], doc.title, doc.raw_body, legal_basis, formats, latest["id"]),
            )
            tid, ver = int(latest["id"]), int(latest["version_no"])
        else:
            row = self.conn.execute(
                """INSERT INTO kb.templates (slug, version_no, locale, category_id, title, description_md, legal_basis,
                                             output_formats, status)
                   VALUES (%s, 1, 'th', %s, %s, %s, %s, %s, 'draft') RETURNING id""",
                (m["slug"], cats[0], doc.title, doc.raw_body, legal_basis, formats),
            ).fetchone()
            assert row is not None
            tid, ver = int(row["id"]), 1
        use = next((s for s in doc.sections if s.heading == "ใช้เมื่อไร"), None)
        text = "\n".join(filter(None, [m.get("summary"), self.render_plain(use.md) if use else ""]))
        self.chunks.append(ChunkRow(
            "template", tid, ver, f"แบบหนังสือ: {doc.title}", text, cats, False,
            metadata={"slug": m["slug"], "url": f"/templates/{m['slug']}", "doc_title": doc.title, "status": "draft"},
        ))
        self.report.templates += 1

    # ------------------------------------------------------------------ glossary
    def _glossary(self) -> None:
        for path in sorted((self.root / "glossary").glob("*.md")):
            meta, rows = parse_glossary(path)
            cats = self._cat_ids([meta.get("primary_category", "CONTRACT")])
            for row in rows:
                slug = slugify(row.term_en or "") or "term-" + content_hash(row.term_th)[:10]
                related = [self.section_ids[k] for k in law_refs(row.refs_md) if k in self.section_ids]
                r = self.conn.execute(
                    """INSERT INTO kb.glossary_terms (slug, term_th, term_en, aliases, short_def, category_ids,
                                                      related_section_ids, status)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, 'draft')
                       ON CONFLICT (slug) DO UPDATE SET term_th = EXCLUDED.term_th, term_en = EXCLUDED.term_en,
                         aliases = EXCLUDED.aliases, short_def = EXCLUDED.short_def,
                         category_ids = EXCLUDED.category_ids,
                         related_section_ids = EXCLUDED.related_section_ids, updated_at = now()
                       WHERE kb.glossary_terms.status = 'draft' AND NOT kb.glossary_terms.edited_in_app
                       RETURNING id""",
                    (slug, row.term_th, row.term_en, row.aliases, row.short_def, cats, related),
                ).fetchone()
                if r is None:
                    continue
                gid = int(r["id"])
                aliases = f" (เรียกอีกอย่างว่า {', '.join(row.aliases)})" if row.aliases else ""
                self.chunks.append(ChunkRow(
                    "glossary", gid, 1, f"คำศัพท์: {row.term_th}", f"{row.term_th}{aliases} — {row.short_def}", cats,
                    False,
                    metadata={"slug": slug, "term": row.term_th, "refs": law_refs(row.refs_md), "status": "draft"},
                ))
                self.report.glossary += 1

    # ------------------------------------------------------------------ chunks
    def _write_chunks(self) -> None:
        """Replace the chunks of every source touched by this run; unchanged text reuses its stored embedding."""
        law_versions = [law["version_id"] for law in self.laws.values() if law["status"] != "published"]
        # scoped to the exact version being rebuilt: an approved version of the same article keeps its chunks
        sources = sorted({(c.source_type, c.source_id, c.source_version)
                          for c in self.chunks if c.source_type != "law_section"})
        types, ids, vers = [t for t, _, _ in sources], [i for _, i, _ in sources], [v for _, _, v in sources]
        where = """(source_type = 'law_section' AND source_version = ANY(%(versions)s))
                   OR (source_type::text, source_id, source_version) IN
                      (SELECT * FROM unnest(%(types)s::text[], %(ids)s::bigint[], %(vers)s::bigint[]))"""
        params = {"versions": law_versions, "types": types, "ids": ids, "vers": vers}
        cached = {r["h"]: r["embedding"] for r in self.conn.execute(
            f"SELECT md5(title || chr(31) || content) AS h, embedding::text AS embedding FROM kb.chunks WHERE {where}",
            params).fetchall()}
        self.conn.execute(f"DELETE FROM kb.chunks WHERE {where}", params)
        if not self.chunks:
            return
        todo = [c for c in self.chunks if _md5(c) not in cached]
        if todo:
            if self.embedder is None:
                raise RuntimeError("embedding service is required to build kb.chunks")
            for c, vec in zip(todo, self.embedder.embed_sync([c.embed_text for c in todo]), strict=True):
                cached[_md5(c)] = to_pgvector(vec)
        with self.conn.cursor() as cur:
            for c in self.chunks:
                tokens = token_string(f"{c.title} {c.content}")
                cur.execute(
                    """INSERT INTO kb.chunks (source_type, source_id, source_version, law_id, category_ids, locale,
                                              chunk_index, title, content, content_tokens, embedding, token_count,
                                              effective_from, is_published, metadata)
                       VALUES (%s, %s, %s, %s, %s, 'th', %s, %s, %s, %s, %s::vector, %s, %s, %s, %s)""",
                    (c.source_type, c.source_id, c.source_version, c.law_id, c.category_ids, c.chunk_index, c.title,
                     c.content, tokens, cached[_md5(c)], len(tokens.split()), c.effective_from, c.is_published,
                     Jsonb(c.metadata)),
                )
        self.report.chunks = len(self.chunks)
        self.report.embedded = len(todo)

    def _warn(self, msg: str) -> None:
        if msg not in self.report.warnings:
            self.report.warnings.append(msg)


def report_json(report: ImportReport) -> str:
    return json.dumps(report.__dict__, ensure_ascii=False, indent=1)
