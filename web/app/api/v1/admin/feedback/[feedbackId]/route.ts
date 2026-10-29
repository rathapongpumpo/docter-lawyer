import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { maskPii } from '@/lib/pii';

type Detail = {
  id: number; message_id: number; chat_id: string; reasons: string[]; comment: string | null; allow_review: boolean; review_state: string; root_cause: string | null;
  reviewer_note: string | null; corrected_answer: string | null; created_at: string; org_chat: boolean;
  verification_status: string | null; parent_message_id: number | null; answer: string; scope: string[];
};
const load = async (id: number) => (await db.execute<Detail>(sql`SELECT f.id, f.message_id, m.chat_id, f.reasons::text[] AS reasons, f.comment, f.allow_review, f.review_state::text AS review_state,
    f.root_cause, f.reviewer_note, f.corrected_answer, f.created_at::text AS created_at, (c.org_id IS NOT NULL) AS org_chat, m.verification_status,
    m.parent_message_id, m.content AS answer, c.scope
  FROM app.message_feedback f JOIN app.messages m ON m.id = f.message_id JOIN app.chats c ON c.id = m.chat_id WHERE f.id = ${id} AND f.rating = -1`)).rows[0];

// operationId admin_get_feedback — the conversation is shown only when the member allowed it, only for personal chats (an organization's
// chats stay inside the organization even if a member ticked the box), and always masked (FR-ADM-011 AC1).
export const GET = defineOperation({ operationId: 'admin_get_feedback', role: 'reviewer' }, async ({ req, session, params }) => {
  const id = Number(params.feedbackId);
  const f = Number.isInteger(id) ? await load(id) : undefined;
  if (!f) throw new ApiError('not_found', 'feedback not found');
  const canRead = f.allow_review && !f.org_chat;
  let question: string | null = null;
  let citations: { n: number; label: string; title: string }[] = [];
  if (canRead) {
    if (f.parent_message_id) question = (await db.execute<{ content: string }>(sql`SELECT content FROM app.messages WHERE id = ${f.parent_message_id}`)).rows[0]?.content ?? null;
    citations = (await db.execute<{ n: number; label: string; title: string }>(sql`SELECT n, label, title FROM app.message_citations WHERE message_id = ${f.message_id} ORDER BY n`)).rows;
    await audit({ action: 'feedback.conversation_read', actorId: Number(session.user.id), request: req, targetType: 'feedback', targetId: String(id) });
  }
  return ok({
    id: f.id, reasons: f.reasons, comment: f.comment ? maskPii(f.comment) : null, allow_review: f.allow_review, org_chat: f.org_chat, review_state: f.review_state,
    root_cause: f.root_cause, reviewer_note: f.reviewer_note, corrected_answer: f.corrected_answer, created_at: f.created_at,
    verification_status: f.verification_status, scope: f.scope,
    conversation: canRead ? { question: question ? maskPii(question) : null, answer: maskPii(f.answer), citations } : null,
  });
});

const Body = z.object({
  review_state: z.enum(['open', 'triaged', 'resolved', 'wont_fix']).optional(),
  root_cause: z.enum(['retrieval', 'content_gap', 'outdated', 'guardrail', 'other']).nullable().optional(),
  reviewer_note: z.string().trim().max(1000).nullable().optional(),
  corrected_answer: z.string().trim().max(4000).nullable().optional(),
});

// operationId admin_update_feedback — triage: state, root cause, reviewer note and the corrected answer
export const PATCH = defineOperation({ operationId: 'admin_update_feedback', role: 'reviewer', input: Body }, async ({ req, session, params, input }) => {
  requireRoles(session, ['reviewer', 'admin']);
  const actor = Number(session.user.id);
  const id = Number(params.feedbackId);
  const f = Number.isInteger(id) ? await load(id) : undefined;
  if (!f) throw new ApiError('not_found', 'feedback not found');
  await db.execute(sql`UPDATE app.message_feedback SET
      review_state = COALESCE(${input.review_state ?? null}::app.review_state, review_state),
      root_cause = CASE WHEN ${input.root_cause !== undefined} THEN ${input.root_cause ?? null} ELSE root_cause END,
      reviewer_note = CASE WHEN ${input.reviewer_note !== undefined} THEN ${input.reviewer_note ?? null} ELSE reviewer_note END,
      corrected_answer = CASE WHEN ${input.corrected_answer !== undefined} THEN ${input.corrected_answer ?? null} ELSE corrected_answer END,
      reviewer_id = ${actor}, reviewed_at = now(), updated_at = now() WHERE id = ${id}`);
  await audit({ action: 'feedback.triage', actorId: actor, request: req, targetType: 'feedback', targetId: String(id), meta: { state: input.review_state ?? null } });
  return ok({ id });
});
