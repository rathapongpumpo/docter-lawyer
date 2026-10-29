-- Contract review (M12, step 2): the review runs as a worker job and its result is kept in the existing app.contract_reviews row
-- (summary_enc / findings_enc are encrypted JSON, org_id is denormalized for tenant checks, the row goes with its contract by FK cascade).
-- Findings hold clause numbers and short notes only — never the contract text, which stays in app.contracts.text_enc.
ALTER TABLE app.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE app.jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'ingest_law','ingest_content','reindex','ai_precheck','export_chat_pdf','render_template',
  'send_email','send_reminder','purge_guest_data','purge_soft_deleted','purge_expired_shares','purge_deleted_accounts','purge_deleted_orgs','purge_ops_tables','export_case',
  'content_review_due','usage_rollup','eval_run','gen_chat_title','rotate_keys','privacy_export',
  'extract_contract','purge_contracts','dsr_digest','review_contract'));

ALTER TABLE app.contract_reviews
  ADD COLUMN backend    text CHECK (backend IN ('mock','http')),    -- which review backend produced (or tried to produce) the result
  ADD COLUMN error_code text;                                       -- set when status = 'failed' (REVIEW_UNAVAILABLE, REVIEW_TIMEOUT, ...)
CREATE INDEX ix_contract_reviews_org_month ON app.contract_reviews(org_id, created_at);   -- monthly quota (org_settings.contract_reviews_monthly)

-- web: queue a review (INSERT) and mark stale ones failed (UPDATE); worker: write the outcome (UPDATE) and drop superseded rows (DELETE, already granted)
GRANT INSERT, UPDATE ON app.contract_reviews TO lc_web;
GRANT UPDATE ON app.contract_reviews TO lc_worker;
