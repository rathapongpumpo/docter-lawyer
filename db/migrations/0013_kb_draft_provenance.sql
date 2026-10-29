-- 0013 — knowledge-base import from docs/knowledge-base/ (Phase 2A)
-- 1) Draft law versions may not know their effective date yet: docs/knowledge-base marks as_of: null until a reviewer
--    confirms it, and we must not invent dates. Publishing still requires the date (CHECK below).
-- 2) Per-section provenance: one law version can mix sources (e.g. ป.พ.พ. S1 compilation + ม.7/224/224/1 from S3).

ALTER TABLE kb.law_versions ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE kb.law_versions
  ADD CONSTRAINT ck_law_versions_published_has_date CHECK (status <> 'published' OR effective_from IS NOT NULL);

ALTER TABLE kb.law_sections ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE kb.law_sections
  ADD COLUMN source jsonb NOT NULL DEFAULT '{}';  -- {"source_id":"S3","notes":["…"]} — ids refer to docs/knowledge-base/sources.md
