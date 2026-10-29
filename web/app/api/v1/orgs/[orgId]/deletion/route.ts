import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { publicBase } from '@/lib/api/origin';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { db } from '@/lib/db/client';
import { localeFromRequest } from '@/lib/email/locale';
import { sendMail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/legal';
import { orgAudit, requireOrgMember } from '@/lib/org';

// operationId request_org_deletion — owner only, name must be typed again; data is erased by the worker after the grace period (FR-ORG-011)
export const POST = defineOperation(
  { operationId: 'request_org_deletion', role: 'member', input: z.object({ confirm_name: z.string().min(1).max(200) }) },
  async ({ req, session, params, input }) => {
    const userId = Number(session.user.id);
    await requireOrgMember(userId, params.orgId!, ['org_owner'], req);
    const [org] = (await db.execute<{ name: string }>(sql`SELECT name FROM app.organizations WHERE id = ${params.orgId} AND status = 'active'`)).rows;
    if (!org) throw new ApiError('conflict', 'organization is not active');
    if (input.confirm_name.trim() !== org.name) throw new ApiError('invalid_input', 'name does not match');
    const [r] = (await db.execute<{ scheduled: string }>(sql`UPDATE app.organizations SET status = 'pending_deletion',
      deletion_scheduled_at = now() + make_interval(days => ${ACCOUNT_DELETION_GRACE_DAYS}), updated_at = now()
      WHERE id = ${params.orgId} RETURNING deletion_scheduled_at::text AS scheduled`)).rows;
    await db.execute(sql`UPDATE app.sessions SET active_organization_id = NULL WHERE active_organization_id = ${params.orgId} AND user_id <> ${userId}`);
    await orgAudit('org.deletion_requested', { orgId: params.orgId!, actorId: userId, request: req });
    const locale = localeFromRequest(req);
    const date = new Date(r!.scheduled).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
    const members = (await db.execute<{ email: string; name: string }>(sql`SELECT u.email::text AS email, u.display_name AS name
      FROM app.members m JOIN app.users u ON u.id = m.user_id WHERE m.organization_id = ${params.orgId}`)).rows;
    await Promise.all(members.map((m) => sendMail(renderEmail('orgDeletion', locale, m.email, { name: m.name, extra: date, url: `${publicBase(req)}/org/settings`, params: { org: org.name } }), 'org_deletion')));
    return ok({ scheduled_at: r!.scheduled });
  },
);

// operationId cancel_org_deletion
export const DELETE = defineOperation({ operationId: 'cancel_org_deletion', role: 'member' }, async ({ req, session, params }) => {
  const userId = Number(session.user.id);
  await requireOrgMember(userId, params.orgId!, ['org_owner'], req, true);
  const r = await db.execute(sql`UPDATE app.organizations SET status = 'active', deletion_scheduled_at = NULL, updated_at = now()
    WHERE id = ${params.orgId} AND status = 'pending_deletion'`);
  if (!r.rowCount) throw new ApiError('not_found', 'no pending deletion');
  await orgAudit('org.deletion_cancelled', { orgId: params.orgId!, actorId: userId, request: req });
  return ok({ cancelled: true });
});
