-- Worker jobs of the contract pipeline (M12): read + extract an uploaded contract, and erase deleted / expired ones (FR-CR-002, FR-CR-009, BR-024)
ALTER TABLE app.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE app.jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'ingest_law','ingest_content','reindex','ai_precheck','export_chat_pdf','render_template',
  'send_email','send_reminder','purge_guest_data','purge_soft_deleted','purge_expired_shares','purge_deleted_accounts','purge_deleted_orgs','purge_ops_tables','export_case',
  'content_review_due','usage_rollup','eval_run','gen_chat_title','rotate_keys','privacy_export',
  'extract_contract','purge_contracts'));
