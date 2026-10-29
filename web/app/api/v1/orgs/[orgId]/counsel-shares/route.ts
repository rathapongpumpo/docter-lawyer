import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { publicBase } from '@/lib/api/origin';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { chatAccess } from '@/lib/chats';
import { encryptField } from "@/lib/crypto";
import { db } from '@/lib/db/client';
import { localeFromRequest } from '@/lib/email/locale';
import { sendMail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { orgAudit, requireOrgMember } from '@/lib/org';

const Create = z.object({
  resource_type: z.literal('chat'),
  resource_id: z.uuid(),
  to_user_id: z.number().int().positive(),
  note: z.string().trim().max(2000).default(''),
});

// operationId share_to_counsel — send a chat to the organization's own counsel (FR-ORG-010).
// The note is encrypted at rest; the e-mail only says that something was sent, never what.
export const POST = defineOperation({ operationId: 'share_to_counsel', role: 'member', input: Create }, async ({ req, session, params, input }) => {
  const userId = Number(session.user.id);
  await requireOrgMember(userId, params.orgId!, undefined, req);
  const [to] = (await db.execute<{ email: string; name: string }>(sql`SELECT u.email::text AS email, u.display_name AS name
    FROM app.members m JOIN app.users u ON u.id = m.user_id
    WHERE m.organization_id = ${params.orgId} AND m.user_id = ${input.to_user_id} AND m.role = 'org_counsel' AND m.user_id <> ${userId}`)).rows;
  if (!to) throw new ApiError('invalid_input', 'recipient is not counsel of this organization');
  // the sender must be able to see the chat, and it must belong to this organization
  const access = await chatAccess(session, input.resource_id, req);
  const [chat] = (await db.execute<{ org_id: string | null }>(sql`SELECT org_id FROM app.chats WHERE id = ${input.resource_id}`)).rows;
  if (!access || access === 'counsel' || chat?.org_id !== params.orgId) throw new ApiError('not_found', 'chat not found');
  const [row] = (await db.execute<{ id: number }>(sql`INSERT INTO app.counsel_shares (org_id, resource_type, resource_id, from_user_id, to_user_id)
    VALUES (${params.orgId}, 'chat', ${input.resource_id}, ${userId}, ${input.to_user_id}) RETURNING id`)).rows;
  if (input.note) {
    await db.execute(sql`UPDATE app.counsel_shares SET note_enc = ${encryptField(input.note, `app.counsel_shares.note_enc:${row!.id}`)} WHERE id = ${row!.id}`);
  }
  const [org] = (await db.execute<{ name: string }>(sql`SELECT name FROM app.organizations WHERE id = ${params.orgId}`)).rows;
  await orgAudit('org.counsel_share', { orgId: params.orgId!, actorId: userId, request: req, targetType: 'chat', targetId: input.resource_id, meta: { share_id: row!.id, to: input.to_user_id } });
  await sendMail(renderEmail('counselShare', localeFromRequest(req), to.email, {
    name: to.name, url: `${publicBase(req)}/org/counsel`, params: { sender: session.user.name, org: org?.name ?? '' },
  }), 'counsel_share');
  return ok({ id: row!.id });
});

const Box = z.object({ box: z.enum(['inbox', 'sent']).default('inbox') });

// operationId list_counsel_shares — "matters sent to me" (counsel) or "sent by me"; only ever the caller's own rows
export const GET = defineOperation({ operationId: 'list_counsel_shares', role: 'member', input: Box }, async ({ req, session, params, input }) => {
  const userId = Number(session.user.id);
  await requireOrgMember(userId, params.orgId!, undefined, req);
  const mine = input.box === 'inbox' ? sql`s.to_user_id = ${userId}` : sql`s.from_user_id = ${userId}`;
  const rows = (await db.execute<{ id: number; resource_id: string; status: string; created_at: string; updated_at: string; other_name: string; title: string | null; has_note: boolean; has_reply: boolean }>(sql`
    SELECT s.id, s.resource_id, s.status, s.created_at::text, s.updated_at::text, u.display_name AS other_name, c.title,
           (s.note_enc IS NOT NULL) AS has_note, (s.reply_enc IS NOT NULL) AS has_reply
    FROM app.counsel_shares s
    JOIN app.users u ON u.id = CASE WHEN s.to_user_id = ${userId} THEN s.from_user_id ELSE s.to_user_id END
    LEFT JOIN app.chats c ON c.id::text = s.resource_id AND s.resource_type = 'chat'
    WHERE s.org_id = ${params.orgId} AND ${mine} ORDER BY s.created_at DESC LIMIT 100`)).rows;
  return ok({ shares: rows });
});
