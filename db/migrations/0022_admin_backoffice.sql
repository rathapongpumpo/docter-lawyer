-- Back-office (M10): system audit viewer, feedback triage, guardrail review, DSR digest job.

-- FR-ADM-018: the app roles can only INSERT into app.audit_log (append-only). The admin viewer reads through this function,
-- which is granted to lc_web and called only by admin-only routes; there is still no UPDATE/DELETE path anywhere.
CREATE FUNCTION app.admin_audit_log(
  p_from timestamptz, p_to timestamptz, p_actor bigint, p_action text, p_org text, p_limit int, p_before_id bigint
) RETURNS TABLE (id bigint, occurred_at timestamptz, actor_user_id bigint, actor_name text, actor_role text, action text,
                 target_type text, target_id text, ip_hash text, meta jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT a.id, a.occurred_at, a.actor_user_id, u.display_name, a.actor_role, a.action, a.target_type, a.target_id,
         left(encode(a.ip_hash, 'hex'), 12), a.meta
  FROM app.audit_log a LEFT JOIN app.users u ON u.id = a.actor_user_id
  WHERE (p_from IS NULL OR a.occurred_at >= p_from) AND (p_to IS NULL OR a.occurred_at < p_to)
    AND (p_actor IS NULL OR a.actor_user_id = p_actor) AND (p_action IS NULL OR a.action LIKE p_action || '%')
    AND (p_org IS NULL OR a.meta ->> 'org_id' = p_org) AND (p_before_id IS NULL OR a.id < p_before_id)
  ORDER BY a.id DESC LIMIT least(p_limit, 10000)
$$;
REVOKE ALL ON FUNCTION app.admin_audit_log FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_audit_log TO lc_web;

-- FR-ADM-011: a reviewer records the root cause of a bad answer
ALTER TABLE app.message_feedback
  ADD COLUMN root_cause text CHECK (root_cause IN ('retrieval','generation','content_gap','outdated','guardrail','other'));

-- FR-ADM-015: a reviewer marks a guardrail decision as a false positive
ALTER TABLE app.guardrail_events ADD COLUMN false_positive boolean NOT NULL DEFAULT false, ADD COLUMN reviewed_by bigint;
GRANT UPDATE (false_positive, reviewed_by) ON app.guardrail_events TO lc_web;

-- FR-ADM-023 AC1: a daily e-mail digest of data-subject requests that are close to their due date
ALTER TABLE app.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE app.jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'ingest_law','ingest_content','reindex','ai_precheck','export_chat_pdf','render_template',
  'send_email','send_reminder','purge_guest_data','purge_soft_deleted','purge_expired_shares','purge_deleted_accounts','purge_deleted_orgs','purge_ops_tables','export_case',
  'content_review_due','usage_rollup','eval_run','gen_chat_title','rotate_keys','privacy_export',
  'extract_contract','purge_contracts','dsr_digest'));
GRANT SELECT ON app.users TO lc_worker;
