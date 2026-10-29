-- 2.7.1 DB roles & GRANT matrix — least privilege for runtime roles
-- Source: docs/03-technical-spec.md §2.7.1 (roles are created by deploy/postgres/init/00_roles.sh)
-- Phase-2 tables (cases, reminders, document_drafts …) grant themselves in their own migrations.

GRANT USAGE ON SCHEMA app, kb TO lc_web, lc_ai, lc_worker;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app, kb TO lc_web, lc_ai, lc_worker;

-- ---------- users, auth & settings ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.users, app.sessions, app.accounts, app.verifications, app.two_factors,
      app.user_settings, app.user_consents TO lc_web;
GRANT SELECT ON app.users, app.user_settings, app.user_consents TO lc_ai;
GRANT SELECT, UPDATE, DELETE ON app.users, app.sessions, app.accounts, app.verifications, app.two_factors,
      app.user_settings, app.user_consents TO lc_worker;

-- ---------- chats ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.chats, app.chat_folders TO lc_web;
GRANT SELECT, INSERT, UPDATE ON app.chats, app.chat_folders TO lc_ai;
GRANT SELECT, DELETE ON app.chats, app.chat_folders TO lc_worker;

GRANT SELECT, UPDATE, DELETE ON app.messages, app.message_citations TO lc_web;
GRANT SELECT, INSERT, UPDATE ON app.messages, app.message_citations TO lc_ai;
GRANT SELECT, DELETE ON app.messages, app.message_citations TO lc_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.message_feedback, app.chat_shares, app.bookmarks, app.saved_folders TO lc_web;
GRANT SELECT, DELETE ON app.message_feedback, app.chat_shares, app.bookmarks, app.saved_folders TO lc_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.learning_progress, app.guide_progress TO lc_web;
GRANT SELECT ON app.learning_progress, app.guide_progress TO lc_ai;
GRANT SELECT, UPDATE, DELETE ON app.learning_progress, app.guide_progress TO lc_worker;

-- ---------- operations ----------
GRANT SELECT, INSERT, UPDATE ON app.usage_counters TO lc_web, lc_ai;
GRANT SELECT, DELETE ON app.usage_counters TO lc_worker;

GRANT INSERT ON app.audit_log TO lc_web, lc_ai, lc_worker;

GRANT INSERT, SELECT ON app.jobs TO lc_web, lc_ai;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.jobs TO lc_worker;

GRANT SELECT ON app.guardrail_events, app.llm_calls, app.retrieval_logs TO lc_web;
GRANT INSERT, SELECT ON app.guardrail_events, app.llm_calls, app.retrieval_logs TO lc_ai;
GRANT SELECT, DELETE ON app.guardrail_events, app.llm_calls, app.retrieval_logs TO lc_worker;

GRANT SELECT, INSERT, UPDATE ON app.dsr_requests TO lc_web;
GRANT SELECT, UPDATE ON app.dsr_requests TO lc_worker;

GRANT SELECT, INSERT, UPDATE ON app.system_settings TO lc_web;
GRANT SELECT ON app.system_settings TO lc_ai, lc_worker;

-- ---------- knowledge base ----------
GRANT SELECT, INSERT, UPDATE ON kb.categories, kb.laws, kb.law_versions, kb.law_sections, kb.articles, kb.article_versions,
      kb.guides, kb.templates, kb.courses, kb.lessons, kb.quiz_questions, kb.glossary_terms, kb.help_agencies,
      kb.courts, kb.prescription_rules, kb.synonyms TO lc_web, lc_worker;
GRANT SELECT ON kb.categories, kb.laws, kb.law_versions, kb.law_sections, kb.articles, kb.article_versions,
      kb.guides, kb.templates, kb.courses, kb.lessons, kb.quiz_questions, kb.glossary_terms, kb.help_agencies,
      kb.courts, kb.prescription_rules, kb.synonyms TO lc_ai;

GRANT SELECT ON kb.chunks TO lc_ai;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb.chunks TO lc_worker;

GRANT INSERT, SELECT ON kb.content_reviews TO lc_web, lc_worker;
GRANT INSERT ON kb.content_reviews TO lc_ai;

GRANT SELECT, INSERT, UPDATE ON kb.prompt_versions, kb.eval_cases, kb.eval_runs TO lc_web, lc_ai, lc_worker;

-- ---------- organizations & contracts ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.organizations, app.members, app.invitations, app.org_settings, app.counsel_shares TO lc_web;
GRANT SELECT ON app.organizations, app.members, app.invitations, app.org_settings, app.counsel_shares TO lc_ai;
GRANT SELECT, UPDATE, DELETE ON app.organizations, app.members, app.invitations, app.org_settings, app.counsel_shares TO lc_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.contracts TO lc_web;
GRANT SELECT ON app.contracts TO lc_ai;
GRANT SELECT, UPDATE, DELETE ON app.contracts TO lc_worker;

GRANT SELECT ON app.contract_reviews TO lc_web;
GRANT SELECT, INSERT, UPDATE ON app.contract_reviews TO lc_ai;
GRANT SELECT, DELETE ON app.contract_reviews TO lc_worker;

GRANT SELECT, INSERT, UPDATE ON kb.review_rules TO lc_web;
GRANT SELECT ON kb.review_rules TO lc_ai, lc_worker;

-- ---------- audit_log partitions (monthly) — the worker creates future partitions; seed the next 15 months ----------
DO $$
DECLARE m date := date '2026-10-01';
BEGIN
  WHILE m < date '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS app.%I PARTITION OF app.audit_log FOR VALUES FROM (%L) TO (%L)',
                   'audit_log_' || to_char(m, 'YYYY_MM'), m, (m + interval '1 month')::date);
    m := (m + interval '1 month')::date;
  END LOOP;
END $$;
