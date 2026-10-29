"""Read access to kb.* for answering (lc_ai has SELECT only). Visibility: published, or draft/in_review when the
staging preview KB_SERVE_DRAFTS is on."""

from dataclasses import dataclass
from datetime import date
from typing import Any

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

_VISIBLE = "(%(drafts)s AND {t}.status IN ('draft','in_review') OR {t}.status = 'published')"


@dataclass(frozen=True)
class SectionRow:
    id: int
    law_code: str
    section_no: str
    body: str
    effective_from: date | None
    official_url: str | None
    version_id: int
    version_status: str
    version_label: str
    short_name: str
    law_title: str


@dataclass(frozen=True)
class DocRow:
    kind: str  # article | guide
    id: int
    version_id: int
    slug: str
    title: str
    summary: str | None
    body_md: str
    status: str

    @property
    def url(self) -> str:
        return f"/library/articles/{self.slug}" if self.kind == "article" else f"/guides/{self.slug}"


class KbRepository:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self.pool = pool

    async def sections(self, pairs: list[tuple[str, str]], *, drafts: bool,
                       as_of: date) -> dict[tuple[str, str], SectionRow]:
        if not pairs:
            return {}
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                f"""SELECT DISTINCT ON (l.law_code, s.section_no)
                           s.id, l.law_code, s.section_no, s.body, s.effective_from,
                           COALESCE(s.source->>'official_url', l.official_url) AS official_url,
                           v.id AS version_id, v.status::text AS version_status, v.version_label,
                           l.short_name_th, l.title_th
                    FROM kb.law_sections s
                    JOIN kb.law_versions v ON v.id = s.law_version_id
                    JOIN kb.laws l ON l.id = s.law_id
                    WHERE (l.law_code, s.section_no) IN (SELECT * FROM unnest(%(codes)s::text[], %(secs)s::text[]))
                      AND {_VISIBLE.format(t='v')}
                      AND (s.effective_from IS NULL OR s.effective_from <= %(as_of)s)
                      AND (s.effective_to IS NULL OR s.effective_to > %(as_of)s)
                    ORDER BY l.law_code, s.section_no, (v.status = 'published') DESC, v.id DESC""",
                {"codes": [p[0] for p in pairs], "secs": [p[1] for p in pairs], "drafts": drafts, "as_of": as_of},
            )
            rows = await cur.fetchall()
        return {(r["law_code"], r["section_no"]): SectionRow(
            r["id"], r["law_code"], r["section_no"], r["body"], r["effective_from"], r["official_url"],
            r["version_id"], r["version_status"], r["version_label"], r["short_name_th"] or r["law_code"],
            r["title_th"]) for r in rows}

    async def doc(self, kind: str, source_id: int, *, drafts: bool) -> DocRow | None:
        async with self.pool.connection() as conn:
            if kind == "article":
                cur = await conn.execute(
                    f"""SELECT a.id, av.id AS version_id, a.slug, av.title, av.summary, av.body_md,
                               av.status::text AS status
                        FROM kb.articles a JOIN kb.article_versions av ON av.article_id = a.id AND av.locale = 'th'
                        WHERE a.id = %(id)s AND a.deleted_at IS NULL AND {_VISIBLE.format(t='av')}
                        ORDER BY av.version_no DESC LIMIT 1""",
                    {"id": source_id, "drafts": drafts},
                )
            elif kind == "guide":
                cur = await conn.execute(
                    f"""SELECT g.id, g.version_no AS version_id, g.slug, g.title, g.summary, g.body->>'md' AS body_md,
                               g.status::text AS status
                        FROM kb.guides g WHERE g.id = %(id)s AND g.deleted_at IS NULL AND {_VISIBLE.format(t='g')}""",
                    {"id": source_id, "drafts": drafts},
                )
            else:
                return None
            r = await cur.fetchone()
        if not r:
            return None
        return DocRow(kind, r["id"], r["version_id"], r["slug"], r["title"], r["summary"], r["body_md"] or "",
                      r["status"])

    async def titles(self, kind: str, slugs: list[str], *, drafts: bool) -> dict[str, str]:
        table = {"guide": "guides", "template": "templates"}.get(kind)
        if not table or not slugs:
            return {}
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                f"""SELECT DISTINCT ON (t.slug) t.slug, t.title FROM kb.{table} t
                    WHERE t.slug = ANY(%(slugs)s) AND t.deleted_at IS NULL AND {_VISIBLE.format(t='t')}
                    ORDER BY t.slug, t.version_no DESC""",
                {"slugs": slugs, "drafts": drafts},
            )
            return {r["slug"]: r["title"] for r in await cur.fetchall()}

    async def articles_citing(self, law_code: str, section_no: str, *, drafts: bool,
                              limit: int = 3) -> list[tuple[str, str]]:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                f"""SELECT a.slug, av.title FROM kb.articles a
                    JOIN kb.article_versions av ON av.id = a.current_version_id
                    WHERE a.deleted_at IS NULL AND av.sources @> %(src)s AND {_VISIBLE.format(t='av')}
                    ORDER BY a.id LIMIT %(limit)s""",
                {"src": Jsonb([{"law_code": law_code, "section_no": section_no}]), "drafts": drafts, "limit": limit},
            )
            return [(r["slug"], r["title"]) for r in await cur.fetchall()]

    async def article_titles(self, *, drafts: bool, limit: int = 3) -> list[str]:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                f"""SELECT av.title FROM kb.articles a JOIN kb.article_versions av ON av.id = a.current_version_id
                    WHERE a.deleted_at IS NULL AND {_VISIBLE.format(t='av')} ORDER BY a.id LIMIT %(limit)s""",
                {"drafts": drafts, "limit": limit},
            )
            return [r["title"] for r in await cur.fetchall()]

    async def glossary(self, term_id: int, *, drafts: bool) -> dict[str, Any] | None:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                f"""SELECT g.id, g.slug, g.term_th, g.short_def, g.status::text AS status,
                           (SELECT array_agg(ARRAY[l.law_code, s.section_no]) FROM kb.law_sections s
                              JOIN kb.laws l ON l.id = s.law_id WHERE s.id = ANY(g.related_section_ids)) AS refs
                    FROM kb.glossary_terms g WHERE g.id = %(id)s AND {_VISIBLE.format(t='g')}""",
                {"id": term_id, "drafts": drafts},
            )
            return await cur.fetchone()

    async def category_name(self, code: str, locale: str) -> str:
        async with self.pool.connection() as conn:
            cur = await conn.execute("SELECT name_th, name_en FROM kb.categories WHERE code = %s", (code,))
            row = await cur.fetchone()
        if not row:
            return code
        return row["name_en"] if locale == "en" and row["name_en"] else row["name_th"]
