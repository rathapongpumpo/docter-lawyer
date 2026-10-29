import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { db } from '@/lib/db/client';
import { getOrgSettings, ORG_MANAGERS, requireOrgMember } from '@/lib/org';

// operationId get_org_usage — messages per member for a month (no content, FR-ORG-007 AC2)
export const GET = defineOperation(
  { operationId: 'get_org_usage', role: 'member', input: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }) },
  async ({ req, session, params, input }) => {
    await requireOrgMember(Number(session.user.id), params.orgId!, ORG_MANAGERS, req);
    const month = input.month ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
    const rows = (await db.execute<{ user_id: number; name: string; messages: number; today: number }>(sql`
      SELECT u.id AS user_id, u.display_name AS name, sum(c.messages)::int AS messages,
             coalesce(sum(c.messages) FILTER (WHERE c.day = (now() AT TIME ZONE 'Asia/Bangkok')::date), 0)::int AS today
      FROM app.usage_counters c
      JOIN app.users u ON u.id = split_part(c.subject_key, ':', 2)::bigint
      WHERE c.org_id = ${params.orgId} AND to_char(c.day, 'YYYY-MM') = ${month}
      GROUP BY u.id, u.display_name ORDER BY messages DESC`)).rows;
    const settings = await getOrgSettings(params.orgId!);
    const [seats] = (await db.execute<{ members: number; pending: number }>(sql`SELECT
      (SELECT count(*) FROM app.members WHERE organization_id = ${params.orgId})::int AS members,
      (SELECT count(*) FROM app.invitations WHERE organization_id = ${params.orgId} AND status = 'pending' AND expires_at > now())::int AS pending`)).rows;
    return ok({
      month, members: rows, total_messages: rows.reduce((n, r) => n + r.messages, 0),
      limits: { chat_daily_per_member: settings.chat_daily_per_member, seat_limit: settings.seat_limit },
      seats,
    });
  },
);
