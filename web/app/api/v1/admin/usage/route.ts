import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { db } from '@/lib/db/client';

const Query = z.object({ days: z.coerce.number().int().min(1).max(90).default(14), format: z.enum(['json', 'csv']).default('json') });

// operationId admin_usage — messages and users per day (usage_counters) — FR-ADM-016
export const GET = defineOperation({ operationId: 'admin_usage', role: 'admin', input: Query }, async ({ input }) => {
  const daily = (await db.execute<{ day: string; messages: number; users: number; org_messages: number }>(sql`SELECT day::text AS day, sum(messages)::int AS messages,
      count(DISTINCT split_part(subject_key, ':', 2))::int AS users,
      coalesce(sum(messages) FILTER (WHERE org_id IS NOT NULL), 0)::int AS org_messages
    FROM app.usage_counters WHERE day > (now() AT TIME ZONE 'Asia/Bangkok')::date - ${input.days}::int GROUP BY day ORDER BY day DESC`)).rows;
  const totals = (await db.execute(sql`SELECT (SELECT count(*) FROM app.users WHERE NOT is_anonymous AND deleted_at IS NULL)::int AS members,
      (SELECT count(*) FROM app.users WHERE is_anonymous)::int AS guests, (SELECT count(*) FROM app.organizations WHERE status = 'active')::int AS orgs,
      (SELECT count(*) FROM app.chats WHERE deleted_at IS NULL)::int AS chats, (SELECT count(*) FROM app.contracts WHERE deleted_at IS NULL)::int AS contracts`)).rows[0];
  if (input.format === 'csv') {
    const body = ['day,messages,users,org_messages', ...daily.map((d) => `${d.day},${d.messages},${d.users},${d.org_messages}`)].join('\r\n');
    return new Response(`${body}\r\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="usage.csv"', 'cache-control': 'no-store' } });
  }
  return ok({ daily, totals });
});
