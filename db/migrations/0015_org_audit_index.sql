-- FR-ORG-008: the organization audit view filters app.audit_log by meta->>'org_id'.
CREATE INDEX ix_audit_org ON app.audit_log ((meta ->> 'org_id'), occurred_at DESC) WHERE meta ? 'org_id';
