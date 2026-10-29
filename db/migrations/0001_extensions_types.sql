-- 2.3.1 Extensions, schemas, types, helpers — `0001_extensions_types.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS kb;

-- ---------- enum types ----------
CREATE TYPE app.user_role        AS ENUM ('member','editor','reviewer','admin');   -- guest ไม่มีแถวใน users
CREATE TYPE app.user_status      AS ENUM ('pending_verification','active','suspended','pending_deletion','deleted');  -- pending_deletion = ช่วงผ่อนผัน 30 วัน (BR-012)
CREATE TYPE app.consent_purpose  AS ENUM ('service_terms','privacy_notice','sensitive_case_data','improve_service','marketing');
CREATE TYPE app.message_role     AS ENUM ('user','assistant','system_notice');
CREATE TYPE app.message_status   AS ENUM ('streaming','completed','stopped','error','blocked');
CREATE TYPE app.explain_level    AS ENUM ('simple','normal','expert');
CREATE TYPE app.citation_kind    AS ENUM ('law_section','article','judgment','guide','glossary','template');
CREATE TYPE app.feedback_reason  AS ENUM ('incorrect','incomplete','hard_to_understand','off_topic','outdated','missing_citation','unsafe','other');
CREATE TYPE app.review_state     AS ENUM ('open','triaged','resolved','wont_fix');
CREATE TYPE app.guardrail_stage  AS ENUM ('input','output','quota');
CREATE TYPE app.guardrail_verdict AS ENUM ('allowed','flagged','blocked','unavailable','quota');
CREATE TYPE app.job_status       AS ENUM ('queued','running','done','failed','dead');
CREATE TYPE app.progress_status  AS ENUM ('not_started','in_progress','completed');
CREATE TYPE app.case_status      AS ENUM ('open','in_progress','waiting','closed');
CREATE TYPE app.case_event_type  AS ENUM ('incident','notice','police_report','filing','hearing','mediation','judgment','appeal','enforcement','deadline','note','other');
CREATE TYPE app.reminder_channel AS ENUM ('email','line');
CREATE TYPE app.saved_item_type  AS ENUM ('message','article','law_section','guide','template','judgment','glossary','document_draft','lesson');

CREATE TYPE kb.content_status    AS ENUM ('draft','in_review','published','archived');
CREATE TYPE kb.law_type          AS ENUM ('constitution','code','act','royal_decree','emergency_decree','ministerial_regulation','notification','regulation','other');
CREATE TYPE kb.content_level     AS ENUM ('basic','practical','advanced');
CREATE TYPE kb.section_change    AS ENUM ('unchanged','added','amended','repealed');
CREATE TYPE kb.chunk_source      AS ENUM ('law_section','article','judgment','guide','template','glossary','lesson','help_agency','faq');
CREATE TYPE kb.review_action     AS ENUM ('submitted','precheck','comment','requested_changes','approved','rejected','published','archived','unpublished');
CREATE TYPE kb.prompt_status     AS ENUM ('draft','active','retired');

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
-- ใช้: CREATE TRIGGER trg_<table>_upd BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
-- (migration 0008 สร้าง trigger ให้ทุกตารางที่มีคอลัมน์ updated_at ด้วย DO-block วนจาก information_schema)
