import { sql } from 'drizzle-orm';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { db } from '@/lib/db/client';
import { handleMemberRemoved, orgAudit, requireOrgMember } from '@/lib/org';

// operationId leave_org — a member leaves on their own; the last owner must transfer ownership or delete the organization first (FR-ORG-011 AC1)
export const POST = defineOperation({ operationId: 'leave_org', role: 'member', csrf: true }, async ({ req, session, params }) => {
  const userId = Number(session.user.id);
  const role = await requireOrgMember(userId, params.orgId!, undefined, req);
  if (role === 'org_owner') {
    const [{ owners }] = (await db.execute<{ owners: number }>(sql`SELECT count(*)::int AS owners FROM app.members WHERE organization_id = ${params.orgId} AND role = 'org_owner'`)).rows as [{ owners: number }];
    if (owners <= 1) throw new ApiError('conflict', 'LAST_OWNER');
  }
  await db.execute(sql`DELETE FROM app.members WHERE organization_id = ${params.orgId} AND user_id = ${userId}`);
  await handleMemberRemoved(params.orgId!, userId);
  await orgAudit('org.member_left', { orgId: params.orgId!, actorId: userId, request: req, targetType: 'user', targetId: String(userId), meta: { role } });
  return ok({ left: true });
});
