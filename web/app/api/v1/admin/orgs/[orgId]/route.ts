import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { db } from '@/lib/db/client';
import { orgAudit } from '@/lib/org';

const Body = z.object({
  plan: z.string().trim().min(1).max(40).optional(),
  seat_limit: z.number().int().min(1).max(1000).optional(),
  chat_daily_per_member: z.number().int().min(1).max(5000).optional(),
});

// operationId admin_update_org_quota — system admin overrides the organization's plan and quotas (FR-ORG-007, BR-023); audited in the org's own log
export const PATCH = defineOperation({ operationId: 'admin_update_org_quota', role: 'admin', input: Body }, async ({ req, session, params, input }) => {
  const [org] = (await db.execute<{ id: string }>(sql`SELECT id FROM app.organizations WHERE id = ${params.orgId}`)).rows;
  if (!org) throw new ApiError('not_found', 'not found');
  await db.execute(sql`INSERT INTO app.org_settings (organization_id, plan, seat_limit, chat_daily_per_member, updated_by)
    VALUES (${params.orgId}, ${input.plan ?? 'pilot'}, ${input.seat_limit ?? 20}, ${input.chat_daily_per_member ?? 300}, ${Number(session.user.id)})
    ON CONFLICT (organization_id) DO UPDATE SET plan = COALESCE(${input.plan ?? null}, app.org_settings.plan),
      seat_limit = COALESCE(${input.seat_limit ?? null}, app.org_settings.seat_limit),
      chat_daily_per_member = COALESCE(${input.chat_daily_per_member ?? null}, app.org_settings.chat_daily_per_member),
      updated_by = EXCLUDED.updated_by, updated_at = now()`);
  await orgAudit('org.quota_changed', { orgId: params.orgId!, actorId: Number(session.user.id), request: req, meta: { ...(input.plan ? { plan: input.plan } : {}), ...(input.seat_limit ? { seat_limit: input.seat_limit } : {}),
    ...(input.chat_daily_per_member ? { chat_daily: input.chat_daily_per_member } : {}) } });
  return ok({ updated: true });
});
