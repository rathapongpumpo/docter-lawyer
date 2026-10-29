import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';

const Query = z.object({
  type: z.enum(['access', 'export', 'rectify', 'erase', 'object', 'withdraw_consent']).optional(),
  status: z.enum(['received', 'in_progress', 'completed', 'rejected']).optional(),
});

// operationId admin_list_dsr — data-subject requests by due date; the ones due within 7 days are flagged (FR-ADM-023 AC1)
export const GET = defineOperation({ operationId: 'admin_list_dsr', role: 'admin', input: Query }, async ({ input }) => {
  const rows = (await db.execute(sql`SELECT d.id, d.request_type AS type, d.status, d.channel, d.due_at::text AS due_at, d.created_at::text AS created_at, d.completed_at::text AS completed_at,
      d.notes, d.user_id, u.email::text AS email, h.display_name AS handled_by,
      (d.status IN ('received','in_progress') AND d.due_at <= now() + interval '7 days') AS due_soon, (d.status IN ('received','in_progress') AND d.due_at < now()) AS overdue
    FROM app.dsr_requests d LEFT JOIN app.users u ON u.id = d.user_id LEFT JOIN app.users h ON h.id = d.handled_by
    WHERE (${input.type ?? null}::text IS NULL OR d.request_type = ${input.type ?? null}) AND (${input.status ?? null}::text IS NULL OR d.status = ${input.status ?? null})
    ORDER BY (d.status IN ('completed','rejected')), d.due_at LIMIT 200`)).rows;
  return ok({ requests: rows });
});

const Create = z.object({
  type: z.enum(['access', 'export', 'rectify', 'erase', 'object', 'withdraw_consent']),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  channel: z.enum(['email', 'other']).default('email'),
  notes: z.string().trim().max(500).optional(),
});

// operationId admin_create_dsr — a request that arrived outside the app (e-mail, letter) is logged here so the 30-day clock is tracked
export const POST = defineOperation({ operationId: 'admin_create_dsr', role: 'admin', input: Create }, async ({ req, session, input }) => {
  const [r] = (await db.execute<{ id: number }>(sql`INSERT INTO app.dsr_requests (user_id, request_type, channel, notes)
    VALUES ((SELECT id FROM app.users WHERE email = ${input.email ?? null} AND NOT is_anonymous AND deleted_at IS NULL), ${input.type}, ${input.channel}, ${input.notes ?? null}) RETURNING id`)).rows;
  await audit({ action: 'dsr.created', actorId: Number(session.user.id), actorRole: 'admin', targetType: 'dsr', targetId: String(r!.id), request: req, meta: { type: input.type, channel: input.channel } });
  return ok({ id: r!.id });
});
