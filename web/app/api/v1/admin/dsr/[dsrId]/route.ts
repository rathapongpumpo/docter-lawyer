import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';

const Body = z.object({ status: z.enum(['in_progress', 'completed', 'rejected']), notes: z.string().trim().max(500).optional() })
  .refine((v) => v.status !== 'rejected' || !!v.notes, { message: 'a rejection needs a reason the user can be told' });

// operationId admin_update_dsr — moves a request along received → in_progress → completed | rejected and records who handled it (FR-ADM-023 AC2)
export const PATCH = defineOperation({ operationId: 'admin_update_dsr', role: 'admin', input: Body }, async ({ req, session, params, input }) => {
  const id = Number(params.dsrId);
  const r = await db.execute(sql`UPDATE app.dsr_requests SET status = ${input.status}, notes = COALESCE(${input.notes ?? null}, notes), handled_by = ${Number(session.user.id)},
      completed_at = CASE WHEN ${input.status} IN ('completed','rejected') THEN now() ELSE NULL END, updated_at = now()
    WHERE id = ${Number.isInteger(id) ? id : -1}`);
  if (!r.rowCount) throw new ApiError('not_found', 'request not found');
  await audit({ action: 'dsr.status', actorId: Number(session.user.id), actorRole: 'admin', targetType: 'dsr', targetId: String(id), request: req, meta: { status: input.status } });
  return ok({ id, status: input.status });
});
