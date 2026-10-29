import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { chatAccess } from '@/lib/chats';
import { db } from '@/lib/db/client';
import { pgArray } from '@/lib/pg';

const REASONS = ['incorrect', 'incomplete', 'hard_to_understand', 'off_topic', 'outdated', 'missing_citation', 'unsafe', 'other'] as const;

/** Feedback is only for an assistant answer in a chat the caller can see (owner, org member or counsel). */
async function answerOf(session: Parameters<typeof chatAccess>[0], rawId: string | undefined, req: Request) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) throw new ApiError('not_found', 'message not found');
  const [m] = (await db.execute<{ chat_id: string }>(sql`SELECT chat_id FROM app.messages WHERE id = ${id} AND role = 'assistant'`)).rows;
  if (!m || !(await chatAccess(session, m.chat_id, req))) throw new ApiError('not_found', 'message not found');
  return id;
}

const Body = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  reasons: z.array(z.enum(REASONS)).max(8).default([]),
  comment: z.string().trim().max(1000).optional(),
  allow_review: z.boolean().default(false),
});

// operationId send_feedback — 👍 stores at once; 👎 takes reasons + comment (FR-CHAT-016). One row per user and answer; a new call replaces it.
// The reviewer only sees the conversation when allow_review is true (FR-ADM-011): the queue query enforces that.
export const PUT = defineOperation({ operationId: 'send_feedback', role: 'guest', input: Body }, async ({ req, session, params, input }) => {
  const messageId = await answerOf(session, params.messageId, req);
  const userId = Number(session.user.id);
  const reasons = input.rating === -1 ? input.reasons : [];
  await db.execute(sql`INSERT INTO app.message_feedback (message_id, user_id, rating, reasons, comment, allow_review)
    VALUES (${messageId}, ${userId}, ${input.rating}, ${pgArray(reasons)}::app.feedback_reason[], ${input.rating === -1 ? (input.comment || null) : null}, ${input.rating === -1 && input.allow_review})
    ON CONFLICT (message_id, COALESCE(user_id, 0), COALESCE(guest_id, '00000000-0000-0000-0000-000000000000'))
    DO UPDATE SET rating = EXCLUDED.rating, reasons = EXCLUDED.reasons, comment = EXCLUDED.comment, allow_review = EXCLUDED.allow_review,
      review_state = 'open', updated_at = now()`);
  return ok({ message_id: messageId, rating: input.rating });
});

// operationId remove_feedback — pressing 👍 again withdraws it
export const DELETE = defineOperation({ operationId: 'remove_feedback', role: 'guest' }, async ({ req, session, params }) => {
  const messageId = await answerOf(session, params.messageId, req);
  await db.execute(sql`DELETE FROM app.message_feedback WHERE message_id = ${messageId} AND user_id = ${Number(session.user.id)}`);
  return ok({ message_id: messageId });
});
