import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { publicBase } from '@/lib/api/origin';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { decryptField, encryptField } from '@/lib/crypto';
import { db } from '@/lib/db/client';
import { localeFromRequest } from '@/lib/email/locale';
import { sendMail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { orgAudit, requireOrgMember } from '@/lib/org';

type Share = { id: number; org_id: string; resource_type: string; resource_id: string; from_user_id: number; to_user_id: number; status: string; note_enc: Buffer | null; reply_enc: Buffer | null; created_at: string; from_name: string; to_name: string; from_email: string };

// Only the sender and the recipient may see a share; anyone else — including other org admins — gets 404 (FR-ORG-010 AC2).
async function loadShare(userId: number, id: string, req: Request): Promise<Share> {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError('not_found', 'not found');
  const [s] = (await db.execute<Share>(sql`SELECT s.id, s.org_id, s.resource_type, s.resource_id, s.from_user_id, s.to_user_id, s.status, s.note_enc, s.reply_enc,
      s.created_at::text, f.display_name AS from_name, t.display_name AS to_name, f.email::text AS from_email
    FROM app.counsel_shares s JOIN app.users f ON f.id = s.from_user_id JOIN app.users t ON t.id = s.to_user_id
    WHERE s.id = ${n} AND (s.from_user_id = ${userId} OR s.to_user_id = ${userId})`)).rows;
  if (!s) throw new ApiError('not_found', 'not found');
  await requireOrgMember(userId, s.org_id, undefined, req);
  // node-pg returns bigint as a string
  return { ...s, from_user_id: Number(s.from_user_id), to_user_id: Number(s.to_user_id) };
}

// operationId get_counsel_share
export const GET = defineOperation({ operationId: 'get_counsel_share', role: 'member' }, async ({ req, session, params }) => {
  const s = await loadShare(Number(session.user.id), params.shareId!, req);
  const aad = (col: string) => `app.counsel_shares.${col}:${s.id}`;
  return ok({
    id: s.id, resource_type: s.resource_type, resource_id: s.resource_id, status: s.status, created_at: s.created_at,
    from: s.from_name, to: s.to_name, i_am_recipient: s.to_user_id === Number(session.user.id),
    note: s.note_enc ? decryptField(s.note_enc, aad('note_enc')) : null,
    reply: s.reply_enc ? decryptField(s.reply_enc, aad('reply_enc')) : null,
  });
});

const Reply = z.object({ reply: z.string().trim().min(1).max(4000).optional(), status: z.enum(['answered', 'closed']) });

// operationId reply_counsel_share — the recipient answers (an opinion of the organization's counsel, never of the system) or closes it
export const PATCH = defineOperation({ operationId: 'reply_counsel_share', role: 'member', input: Reply }, async ({ req, session, params, input }) => {
  const userId = Number(session.user.id);
  const s = await loadShare(userId, params.shareId!, req);
  if (s.to_user_id !== userId) throw new ApiError('forbidden', 'only the recipient can answer');
  if (input.status === 'answered' && !input.reply) throw new ApiError('invalid_input', 'reply is required');
  if (input.reply) {
    await db.execute(sql`UPDATE app.counsel_shares SET reply_enc = ${encryptField(input.reply, `app.counsel_shares.reply_enc:${s.id}`)}, status = ${input.status}, updated_at = now() WHERE id = ${s.id}`);
  } else {
    await db.execute(sql`UPDATE app.counsel_shares SET status = ${input.status}, updated_at = now() WHERE id = ${s.id}`);
  }
  await orgAudit('org.counsel_' + input.status, { orgId: s.org_id, actorId: userId, request: req, targetType: 'counsel_share', targetId: String(s.id) });
  if (input.status === 'answered') {
    const [org] = (await db.execute<{ name: string }>(sql`SELECT name FROM app.organizations WHERE id = ${s.org_id}`)).rows;
    await sendMail(renderEmail('counselReply', localeFromRequest(req), s.from_email, { name: s.from_name, url: `${publicBase(req)}/org/counsel?box=sent`, params: { org: org?.name ?? '' } }), 'counsel_reply');
  }
  return ok({ id: s.id, status: input.status });
});
