import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { db } from '@/lib/db/client';

const Query = z.object({
  verdict: z.enum(['allowed', 'flagged', 'blocked', 'unavailable', 'quota']).optional(),
  stage: z.enum(['input', 'output', 'quota']).optional(),
  days: z.coerce.number().int().min(1).max(90).default(14),
});

// operationId admin_list_guardrails — events + the block rate per day. Only ids, stage, verdict, category and the short reason: never the user's text (FR-ADM-015).
export const GET = defineOperation({ operationId: 'admin_list_guardrails', role: 'reviewer', input: Query }, async ({ input }) => {
  const events = (await db.execute(sql`SELECT id, occurred_at::text AS occurred_at, stage::text AS stage, verdict::text AS verdict, category, reason, latency_ms, false_positive
    FROM app.guardrail_events WHERE occurred_at > now() - make_interval(days => ${input.days})
      AND (${input.verdict ?? null}::text IS NULL OR verdict::text = ${input.verdict ?? null}) AND (${input.stage ?? null}::text IS NULL OR stage::text = ${input.stage ?? null})
    ORDER BY id DESC LIMIT 200`)).rows;
  const daily = (await db.execute(sql`SELECT (occurred_at AT TIME ZONE 'Asia/Bangkok')::date::text AS day, count(*)::int AS total,
      count(*) FILTER (WHERE verdict = 'blocked')::int AS blocked, count(*) FILTER (WHERE verdict = 'flagged')::int AS flagged
    FROM app.guardrail_events WHERE occurred_at > now() - make_interval(days => ${input.days}) GROUP BY 1 ORDER BY 1 DESC`)).rows;
  return ok({ events, daily });
});
