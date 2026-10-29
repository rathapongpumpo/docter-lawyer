-- FR-ADM-002: content edited in the back-office. The seed importer (docs/knowledge-base → kb.*) refreshes DRAFT rows from the files;
-- a draft that an editor has changed in the app must not be overwritten by the next import.
ALTER TABLE kb.article_versions ADD COLUMN edited_in_app boolean NOT NULL DEFAULT false;
ALTER TABLE kb.guides           ADD COLUMN edited_in_app boolean NOT NULL DEFAULT false;
ALTER TABLE kb.templates        ADD COLUMN edited_in_app boolean NOT NULL DEFAULT false;
ALTER TABLE kb.glossary_terms   ADD COLUMN edited_in_app boolean NOT NULL DEFAULT false, ADD COLUMN long_def_edited_at timestamptz;
