-- FR-ORG-008: owners/admins read their organization's audit log. lc_web has INSERT only on app.audit_log (append-only,
-- and it must not be able to read other tenants' rows), so reads go through this function, which can only return one org.
CREATE FUNCTION app.org_audit_log(
  p_org uuid, p_from timestamptz, p_to timestamptz, p_user bigint, p_action text, p_limit int, p_before_id bigint
) RETURNS TABLE (id bigint, occurred_at timestamptz, actor_user_id bigint, actor_name text, action text,
                 target_type text, target_id text, meta jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS $$
  SELECT a.id, a.occurred_at, a.actor_user_id, u.display_name, a.action, a.target_type, a.target_id, a.meta
  FROM app.audit_log a LEFT JOIN app.users u ON u.id = a.actor_user_id
  WHERE a.meta ->> 'org_id' = p_org::text
    AND (p_from IS NULL OR a.occurred_at >= p_from) AND (p_to IS NULL OR a.occurred_at < p_to)
    AND (p_user IS NULL OR a.actor_user_id = p_user) AND (p_action IS NULL OR a.action LIKE p_action || '%')
    AND (p_before_id IS NULL OR a.id < p_before_id)
  ORDER BY a.id DESC LIMIT least(p_limit, 10000)
$$;
REVOKE ALL ON FUNCTION app.org_audit_log FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.org_audit_log TO lc_web;
