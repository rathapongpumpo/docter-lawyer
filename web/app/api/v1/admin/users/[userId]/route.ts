import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_role'), role: z.enum(['member', 'editor', 'reviewer', 'admin']), reason: z.string().trim().min(5).max(200) }),
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(5).max(200) }),
  z.object({ action: z.literal('unsuspend'), reason: z.string().trim().min(5).max(200) }),
  z.object({ action: z.literal('force_logout'), reason: z.string().trim().min(5).max(200) }),
  z.object({ action: z.literal('reset_quota'), reason: z.string().trim().min(5).max(200) }),
  z.object({ action: z.literal('unlock'), reason: z.string().trim().min(5).max(200) }),
]);

// operationId admin_update_user — every action needs a written reason and leaves an audit entry (FR-ADM-017 AC1)
export const PATCH = defineOperation({ operationId: 'admin_update_user', role: 'admin', input: Body }, async ({ req, session, params, input }) => {
  const actor = Number(session.user.id);
  const id = Number(params.userId);
  if (!Number.isInteger(id) || id < 1) throw new ApiError('not_found', 'user not found');
  const [u] = (await db.execute<{ id: number; role: string; status: string }>(sql`SELECT id, role::text AS role, status::text AS status FROM app.users
    WHERE id = ${id} AND NOT is_anonymous AND deleted_at IS NULL`)).rows;
  if (!u) throw new ApiError('not_found', 'user not found');
  const meta = { reason: input.reason };

  // an admin can neither demote nor suspend themselves, and the last active admin can never be removed
  const removesAdmin = u.role === 'admin' && ((input.action === 'set_role' && input.role !== 'admin') || input.action === 'suspend');
  if (removesAdmin) {
    if (id === actor) throw new ApiError('conflict', 'SELF_LOCKOUT');
    const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM app.users WHERE role = 'admin' AND status = 'active' AND NOT banned AND id <> ${id}`)).rows as [{ n: number }];
    if (n < 1) throw new ApiError('conflict', 'LAST_ADMIN');
  }
  if (input.action === 'suspend' && id === actor) throw new ApiError('conflict', 'SELF_LOCKOUT');

  switch (input.action) {
    case 'set_role':
      await db.execute(sql`UPDATE app.users SET role = ${input.role}::app.user_role, updated_at = now() WHERE id = ${id}`);
      // a role change takes effect on the next request, so the new permissions are never mixed with a stale session
      await db.execute(sql`DELETE FROM app.sessions WHERE user_id = ${id}`);
      await audit({ action: 'user.role_change', actorId: actor, actorRole: 'admin', targetType: 'user', targetId: String(id), request: req, meta: { ...meta, from: u.role, to: input.role } });
      break;
    case 'suspend':
      await db.execute(sql`UPDATE app.users SET banned = true, ban_reason = ${input.reason}, status = 'suspended', updated_at = now() WHERE id = ${id}`);
      await db.execute(sql`DELETE FROM app.sessions WHERE user_id = ${id}`); // signed out everywhere at once (AC2)
      await audit({ action: 'user.suspended', actorId: actor, actorRole: 'admin', targetType: 'user', targetId: String(id), request: req, meta });
      break;
    case 'unsuspend':
      await db.execute(sql`UPDATE app.users SET banned = false, ban_reason = NULL, ban_expires = NULL, status = 'active', updated_at = now() WHERE id = ${id}`);
      await audit({ action: 'user.unsuspended', actorId: actor, actorRole: 'admin', targetType: 'user', targetId: String(id), request: req, meta });
      break;
    case 'force_logout':
      await db.execute(sql`DELETE FROM app.sessions WHERE user_id = ${id}`);
      await audit({ action: 'user.force_logout', actorId: actor, actorRole: 'admin', targetType: 'user', targetId: String(id), request: req, meta });
      break;
    case 'reset_quota':
      await db.execute(sql`UPDATE app.usage_counters SET messages = 0, updated_at = now() WHERE subject_key LIKE ${`user:${id}%`} AND day = (now() AT TIME ZONE 'Asia/Bangkok')::date`);
      await audit({ action: 'user.quota_reset', actorId: actor, actorRole: 'admin', targetType: 'user', targetId: String(id), request: req, meta });
      break;
    case 'unlock':
      await db.execute(sql`UPDATE app.users SET failed_login_count = 0, last_failed_login_at = NULL, locked_until = NULL WHERE id = ${id}`);
      await audit({ action: 'user.unlocked', actorId: actor, actorRole: 'admin', targetType: 'user', targetId: String(id), request: req, meta });
      break;
  }
  return ok({ id, action: input.action });
});
