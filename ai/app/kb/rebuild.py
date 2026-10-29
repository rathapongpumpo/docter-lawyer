"""Rebuild the search chunks of one piece of content that was edited in the back-office (job `ingest_content`).

The seed importer builds chunks from files; content an editor changed in the app has no chunks (or stale ones), so nothing
searched it. This job does for one row what the importer does for all: split the Markdown into '## ' sections, render
[[refs]] as readable text, embed and store — with the same chunk shapes, so retrieval treats both alike.
"""

from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from app.kb.importer import ChunkRow, render_plain
from app.kb.source_files import parse_md_text
from app.rag.embed import Embedder, to_pgvector
from app.rag.tokens import token_string

TYPES = ("article", "guide", "template", "glossary")


def _names(conn: Connection) -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    laws = {
        r["law_code"]: (r["short_name_th"] or r["law_code"])
        for r in conn.execute("SELECT law_code, short_name_th FROM kb.laws").fetchall()
    }
    titles: dict[tuple[str, str], str] = {}
    for kind, sql in (
        ("guide", "SELECT DISTINCT ON (slug) slug, title FROM kb.guides ORDER BY slug, version_no DESC"),
        ("template", "SELECT DISTINCT ON (slug) slug, title FROM kb.templates ORDER BY slug, version_no DESC"),
        (
            "article",
            "SELECT a.slug, v.title FROM kb.articles a JOIN kb.article_versions v ON v.id = a.current_version_id",
        ),
    ):
        for r in conn.execute(sql).fetchall():
            titles[(kind, r["slug"])] = r["title"]
    return laws, titles


def _sections(
    md: str,
    title: str,
    slug: str,
    url: str,
    source: tuple[str, int, int],
    cats: list[int],
    prefix: str,
    published: bool,
    status: str,
    laws: dict[str, str],
    titles: dict[tuple[str, str], str],
    skip: tuple[str, ...] = (),
) -> list[ChunkRow]:
    doc = parse_md_text(md, title)
    out: list[ChunkRow] = []
    for i, s in enumerate(doc.sections):
        if s.heading in skip or not s.md:
            continue
        out.append(
            ChunkRow(
                source[0],
                source[1],
                source[2],
                f"{prefix}{title} › {s.heading}",
                render_plain(s.md, laws, titles),
                cats,
                published,
                chunk_index=i,
                metadata={
                    "slug": slug,
                    "heading": s.heading,
                    "section_index": i,
                    "url": url,
                    "doc_title": title,
                    "status": status,
                },
            )
        )
    return out


def build_chunks(conn: Connection, content_type: str, content_id: int) -> tuple[list[ChunkRow], str] | None:
    """The chunks of one row plus its status, or None when the row is gone. `delete_key` is the scope to replace."""
    laws, titles = _names(conn)
    if content_type == "article":
        r = conn.execute(
            """SELECT v.id, v.title, v.body_md, v.status::text AS status, a.id AS article_id, a.slug, a.category_id, a.extra_category_ids
                            FROM kb.article_versions v JOIN kb.articles a ON a.id = v.article_id WHERE v.id = %s""",
            (content_id,),
        ).fetchone()
        if not r:
            return None
        cats = [int(r["category_id"]), *[int(c) for c in r["extra_category_ids"]]]
        return _sections(
            r["body_md"],
            r["title"],
            r["slug"],
            f"/library/articles/{r['slug']}",
            ("article", r["article_id"], r["id"]),
            cats,
            "",
            r["status"] == "published",
            r["status"],
            laws,
            titles,
        ), r["status"]
    if content_type == "guide":
        r = conn.execute(
            "SELECT id, slug, version_no, title, body, category_id, status::text AS status FROM kb.guides WHERE id = %s",
            (content_id,),
        ).fetchone()
        if not r:
            return None
        cats = [int(r["category_id"]), *[int(c) for c in (r["body"].get("extra_category_ids") or [])]]
        return _sections(
            r["body"].get("md", ""),
            r["title"],
            r["slug"],
            f"/guides/{r['slug']}",
            ("guide", r["id"], r["version_no"]),
            cats,
            "คู่มือ: ",
            r["status"] == "published",
            r["status"],
            laws,
            titles,
            skip=("ฐานกฎหมาย",),
        ), r["status"]
    if content_type == "template":
        r = conn.execute(
            "SELECT id, slug, version_no, title, description_md, category_id, status::text AS status FROM kb.templates WHERE id = %s",
            (content_id,),
        ).fetchone()
        if not r:
            return None
        doc = parse_md_text(r["description_md"] or "", r["title"])
        use = next((s for s in doc.sections if s.heading == "ใช้เมื่อไร"), None)
        text = render_plain(use.md, laws, titles) if use else ""
        chunk = ChunkRow(
            "template",
            r["id"],
            r["version_no"],
            f"แบบหนังสือ: {r['title']}",
            text or r["title"],
            [int(r["category_id"])],
            r["status"] == "published",
            metadata={
                "slug": r["slug"],
                "url": f"/templates/{r['slug']}",
                "doc_title": r["title"],
                "status": r["status"],
            },
        )
        return [chunk], r["status"]
    if content_type == "glossary":
        r = conn.execute(
            """SELECT id, slug, term_th, aliases, short_def, long_def_md, category_ids, status::text AS status
                            FROM kb.glossary_terms WHERE id = %s""",
            (content_id,),
        ).fetchone()
        if not r:
            return None
        aliases = f" (เรียกอีกอย่างว่า {', '.join(r['aliases'])})" if r["aliases"] else ""
        chunk = ChunkRow(
            "glossary",
            r["id"],
            1,
            f"คำศัพท์: {r['term_th']}",
            f"{r['term_th']}{aliases} — {r['short_def']}",
            [int(c) for c in r["category_ids"]],
            r["status"] == "published",
            metadata={"slug": r["slug"], "term": r["term_th"], "refs": [], "status": r["status"]},
        )
        return [chunk], r["status"]
    raise ValueError(f"unsupported content type {content_type}")


_DELETE = {
    "article": "DELETE FROM kb.chunks WHERE source_type = 'article' AND source_id = %(sid)s AND source_version = %(ver)s",
    "guide": "DELETE FROM kb.chunks WHERE source_type = 'guide' AND source_id = %(sid)s",
    "template": "DELETE FROM kb.chunks WHERE source_type = 'template' AND source_id = %(sid)s",
    "glossary": "DELETE FROM kb.chunks WHERE source_type = 'glossary' AND source_id = %(sid)s",
}


def rebuild_chunks(conn: Connection, embedder: Embedder, content_type: str, content_id: int) -> dict[str, Any]:
    built = build_chunks(conn, content_type, content_id)
    if built is None:
        return {"skipped": "gone"}
    chunks, status = built
    if status == "archived":  # withdrawn content is not searchable, not even as a draft
        return {"chunks": 0, "status": status}
    vecs = embedder.embed_sync([c.embed_text for c in chunks]) if chunks else []
    with conn.transaction():
        if chunks:
            conn.execute(_DELETE[content_type], {"sid": chunks[0].source_id, "ver": chunks[0].source_version})
        with conn.cursor() as cur:
            for c, vec in zip(chunks, vecs, strict=True):
                tokens = token_string(f"{c.title} {c.content}")
                cur.execute(
                    """INSERT INTO kb.chunks (source_type, source_id, source_version, law_id, category_ids, locale, chunk_index, title, content,
                                              content_tokens, embedding, token_count, effective_from, is_published, metadata)
                       VALUES (%s, %s, %s, NULL, %s, 'th', %s, %s, %s, %s, %s::vector, %s, NULL, %s, %s)""",
                    (
                        c.source_type,
                        c.source_id,
                        c.source_version,
                        c.category_ids,
                        c.chunk_index,
                        c.title,
                        c.content,
                        tokens,
                        to_pgvector(vec),
                        len(tokens.split()),
                        c.is_published,
                        Jsonb(c.metadata),
                    ),
                )
    return {"chunks": len(chunks), "status": status}
