import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';

// operationId admin_mark_guardrail — a reviewer flags a block as a false positive (FR-ADM-015 AC1)
export const PATCH = defineOperation({ operationId: 'admin_mark_guardrail', role: 'reviewer', input: z.object({ false_positive: z.boolean() }) }, async ({ req, session, params, input }) => {
  requireRoles(session, ['reviewer', 'admin']);
  const id = Number(params.eventId);
  const r = await db.execute(sql`UPDATE app.guardrail_events SET false_positive = ${input.false_positive}, reviewed_by = ${Number(session.user.id)} WHERE id = ${Number.isInteger(id) ? id : -1}`);
  if (!r.rowCount) throw new ApiError('not_found', 'event not found');
  await audit({ action: 'guardrail.false_positive', actorId: Number(session.user.id), request: req, targetType: 'guardrail_event', targetId: String(id), meta: { value: input.false_positive } });
  return ok({ id });
});
