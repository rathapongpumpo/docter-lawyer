import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { publicBase } from '@/lib/api/origin';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { localeFromRequest } from '@/lib/email/locale';
import { sendMail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/legal';
import { headers } from 'next/headers';

const fmt = (d: Date, locale: 'th' | 'en') =>
  d.toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

// operationId request_account_deletion — BR-012: 30-day grace period, cancel by signing in and pressing cancel.
export const POST = defineOperation(
  { operationId: 'request_account_deletion', role: 'member', input: z.object({ password: z.string().min(1).max(200) }) },
  async ({ req, session, input }) => {
    if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
    // Re-authenticate: a stolen session alone must not be able to schedule deletion.
    const valid = await auth.api.verifyPassword({ body: { password: input.password }, headers: await headers() }).then(() => true, () => false);
    if (!valid) throw new ApiError('forbidden', 'wrong password');
    const userId = Number(session.user.id);
    const [row] = (await db.execute<{ scheduled: string }>(sql`
      UPDATE app.users SET status = 'pending_deletion', deletion_requested_at = now(),
        deletion_scheduled_at = now() + make_interval(days => ${ACCOUNT_DELETION_GRACE_DAYS}), updated_at = now()
      WHERE id = ${userId} AND status <> 'pending_deletion' RETURNING deletion_scheduled_at::text AS scheduled`)).rows;
    if (!row) throw new ApiError('conflict', 'deletion already requested');
    await db.execute(sql`INSERT INTO app.dsr_requests (user_id, request_type, status) VALUES (${userId}, 'erase', 'in_progress')`);
    // Sign out everywhere and stop public links at once (FR-AUTH-018 AC1); signing in again shows the cancel button.
    await db.execute(sql`UPDATE app.chat_shares SET revoked_at = now(), updated_at = now() WHERE created_by = ${userId} AND revoked_at IS NULL`);
    await db.execute(sql`DELETE FROM app.sessions WHERE user_id = ${userId}`);
    await audit({ action: 'privacy.deletion_requested', actorId: userId, request: req });
    const locale = localeFromRequest(req);
    await sendMail(renderEmail('deletionRequested', locale, session.user.email, { name: session.user.name, extra: fmt(new Date(row.scheduled), locale), url: `${publicBase(req)}/login` }), 'deletion_requested');
    return ok({ scheduled_at: row.scheduled });
  },
);

// operationId cancel_account_deletion
export const DELETE = defineOperation({ operationId: 'cancel_account_deletion', role: 'member' }, async ({ req, session }) => {
  const userId = Number(session.user.id);
  const r = await db.execute(sql`UPDATE app.users SET status = 'active', deletion_requested_at = NULL, deletion_scheduled_at = NULL, updated_at = now()
    WHERE id = ${userId} AND status = 'pending_deletion'`);
  if (!r.rowCount) throw new ApiError('not_found', 'no pending deletion');
  await db.execute(sql`UPDATE app.dsr_requests SET status = 'rejected', notes = 'cancelled by user', updated_at = now()
    WHERE user_id = ${userId} AND request_type = 'erase' AND status = 'in_progress'`);
  await audit({ action: 'privacy.deletion_cancelled', actorId: userId, request: req });
  await sendMail(renderEmail('deletionCancelled', localeFromRequest(req), session.user.email, { name: session.user.name }), 'deletion_cancelled');
  return ok({ cancelled: true });
});
