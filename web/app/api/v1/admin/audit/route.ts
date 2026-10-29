import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';

const Query = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  actor: z.coerce.number().int().positive().optional(),
  action: z.string().regex(/^[a-z_.]{1,40}$/).optional(),
  org: z.uuid().optional(),
  before: z.coerce.number().int().positive().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
type Row = { id: number; occurred_at: string; actor_user_id: number | null; actor_name: string | null; actor_role: string | null; action: string; target_type: string | null; target_id: string | null; ip_hash: string | null; meta: Record<string, unknown> };
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`; // a leading = + - @ would run as a formula in a spreadsheet
};

// operationId admin_audit_log — read-only view (there is no UI or API that changes or deletes audit rows: FR-ADM-018 AC1)
export const GET = defineOperation({ operationId: 'admin_audit_log', role: 'admin', input: Query }, async ({ req, session, input }) => {
  const limit = input.format === 'csv' ? 10000 : 100;
  const to = input.to ? new Date(new Date(input.to).getTime() + 86_400_000).toISOString() : null;
  const rows = (await db.execute<Row>(sql`SELECT * FROM app.admin_audit_log(${input.from ?? null}::timestamptz, ${to}::timestamptz, ${input.actor ?? null}::bigint,
    ${input.action ?? null}, ${input.org ?? null}, ${limit}, ${input.before ?? null}::bigint)`)).rows;
  if (input.format === 'csv') {
    await audit({ action: 'audit.exported', actorId: Number(session.user.id), actorRole: 'admin', request: req, meta: { rows: rows.length } });
    const head = ['id', 'time', 'actor_id', 'actor', 'role', 'action', 'target_type', 'target_id', 'ip_hash', 'detail'];
    const body = rows.map((r) => [r.id, new Date(r.occurred_at).toISOString(), r.actor_user_id, r.actor_name, r.actor_role, r.action, r.target_type, r.target_id, r.ip_hash, JSON.stringify(r.meta)].map(cell).join(','));
    return new Response(`﻿${[head.map(cell).join(','), ...body].join('\r\n')}\r\n`, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="audit-log.csv"', 'cache-control': 'no-store' },
    });
  }
  return ok({ rows, next_before: rows.length === limit ? rows[rows.length - 1]!.id : null });
});
