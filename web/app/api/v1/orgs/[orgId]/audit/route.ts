import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { db } from '@/lib/db/client';
import { ORG_MANAGERS, orgAudit, requireOrgMember } from '@/lib/org';

const Query = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  user: z.coerce.number().int().positive().optional(),
  action: z.string().regex(/^[a-z_.]{1,40}$/).optional(),
  before: z.coerce.number().int().positive().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

type Row = { id: number; occurred_at: string; actor_user_id: number | null; actor_name: string | null; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown> };

// CSV cells that start with = + - @ would run as formulas in a spreadsheet
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
};

// operationId get_org_audit — the organization's audit log (no chat or contract text, FR-ORG-008); CSV export for auditors
export const GET = defineOperation({ operationId: 'get_org_audit', role: 'member', input: Query }, async ({ req, session, params, input }) => {
  const userId = Number(session.user.id);
  await requireOrgMember(userId, params.orgId!, ORG_MANAGERS, req);
  const limit = input.format === 'csv' ? 10000 : 100;
  const to = input.to ? new Date(new Date(input.to).getTime() + 86_400_000).toISOString() : null; // inclusive end day
  const rows = (await db.execute<Row>(sql`SELECT * FROM app.org_audit_log(${params.orgId}::uuid, ${input.from ?? null}::timestamptz, ${to}::timestamptz,
      ${input.user ?? null}::bigint, ${input.action ?? null}, ${limit}, ${input.before ?? null}::bigint)`)).rows;
  if (input.format === 'csv') {
    await orgAudit('org.audit_exported', { orgId: params.orgId!, actorId: userId, request: req, meta: { rows: rows.length } });
    const head = ['id', 'time', 'actor_id', 'actor', 'action', 'target_type', 'target_id', 'detail'];
    const body = rows.map((r) => [r.id, new Date(r.occurred_at).toISOString(), r.actor_user_id, r.actor_name, r.action, r.target_type, r.target_id,
      JSON.stringify(Object.fromEntries(Object.entries(r.meta).filter(([k]) => k !== 'org_id')))].map(csvCell).join(','));
    return new Response(`﻿${[head.map(csvCell).join(','), ...body].join('\r\n')}\r\n`, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="org-audit.csv"', 'cache-control': 'no-store' },
    });
  }
  return ok({ rows, next_before: rows.length === limit ? rows[rows.length - 1]!.id : null });
});
