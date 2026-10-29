import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { db } from '@/lib/db/client';
import { maskPii } from '@/lib/pii';

const Query = z.object({
  state: z.enum(['open', 'triaged', 'resolved', 'wont_fix']).optional(),
  reason: z.enum(['incorrect', 'incomplete', 'hard_to_understand', 'off_topic', 'outdated', 'missing_citation', 'unsafe', 'other']).optional(),
});

// operationId admin_list_feedback — the 👎 queue (FR-ADM-011). The user's own comment is shown masked; the conversation only in the detail view and only if allowed.
export const GET = defineOperation({ operationId: 'admin_list_feedback', role: 'reviewer', input: Query }, async ({ input }) => {
  const rows = (await db.execute<{ comment: string | null }>(sql`SELECT f.id, f.message_id, f.reasons::text[] AS reasons, f.comment, f.allow_review, f.review_state::text AS review_state, f.root_cause,
      f.created_at::text AS created_at, m.verification_status, (c.org_id IS NOT NULL) AS org_chat
    FROM app.message_feedback f JOIN app.messages m ON m.id = f.message_id JOIN app.chats c ON c.id = m.chat_id
    WHERE f.rating = -1 AND (${input.state ?? null}::text IS NULL OR f.review_state::text = ${input.state ?? null})
      AND (${input.reason ?? null}::text IS NULL OR ${input.reason ?? null}::app.feedback_reason = ANY (f.reasons))
    ORDER BY (f.review_state = 'open') DESC, f.created_at DESC LIMIT 200`)).rows;
  return ok({ items: rows.map((r) => ({ ...r, comment: r.comment ? maskPii(r.comment) : null })) });
});
