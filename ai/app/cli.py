"""Operator commands (CLAUDE.md §5).

  python -m app.cli seed-kb --path /kb      import docs/knowledge-base (mounted at /kb) → kb.* + kb.chunks
  python -m app.cli kb-stats                row counts per knowledge-base table

Run as the worker role, which owns kb writes (docs/03-technical-spec.md §2.7.1):
  docker compose … exec -e DB_USER=lc_worker -e DB_PASSWORD="$DB_WORKER_PASSWORD" ai \
      python -m app.cli seed-kb --path /kb
"""

import argparse
import os
import sys
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings
from app.kb.importer import KbImporter, report_json
from app.rag.embed import Embedder


def _connect() -> psycopg.Connection:
    return psycopg.connect(get_settings().db_conninfo, row_factory=dict_row)


def seed_kb(path: Path) -> int:
    if not (path / "laws" / "_registry.yaml").exists():
        print(f"not a knowledge-base folder: {path}", file=sys.stderr)
        return 2
    settings = get_settings()
    embedder = Embedder(os.environ.get("EMBED_URL", "http://embed-m3:8080"), settings.embed_dim)
    with _connect() as conn:
        report = KbImporter(conn, path, embedder).run()
    print(report_json(report))
    return 1 if report.warnings else 0


def kb_stats() -> int:
    tables = ["categories", "laws", "law_versions", "law_sections", "articles", "article_versions", "guides",
              "templates", "glossary_terms", "chunks"]
    with _connect() as conn:
        for t in tables:
            row = conn.execute(f"SELECT count(*) AS n FROM kb.{t}").fetchone()
            print(f"kb.{t}: {row['n'] if row else 0}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("seed-kb", help="import docs/knowledge-base into kb.*")
    p.add_argument("--path", type=Path, default=Path("/kb"))
    sub.add_parser("kb-stats", help="row counts of kb tables")
    args = parser.parse_args(argv)
    if args.cmd == "seed-kb":
        return seed_kb(args.path)
    return kb_stats()


if __name__ == "__main__":
    sys.exit(main())
