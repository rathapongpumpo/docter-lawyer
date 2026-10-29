import { z } from 'zod';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { assertChatAccess } from '@/lib/chats';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { publicBase } from '@/lib/api/origin';
import { createShare, listShares, SHARE_DEFAULT_DAYS, SHARE_MAX_DAYS } from '@/lib/shares';

// Public links are for personal chats: organization chats are shared through their visibility and the counsel hand-off (FR-ORG-005/010).
async function personalChat(session: Parameters<typeof assertChatAccess>[0], chatId: string | undefined) {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  if (!chatId || !z.uuid().safeParse(chatId).success) throw new ApiError('not_found', 'chat not found');
  await assertChatAccess(session, chatId);
  const [c] = (await db.execute<{ org_id: string | null }>(sql`SELECT org_id FROM app.chats WHERE id = ${chatId}`)).rows;
  if (c?.org_id) throw new ApiError('invalid_input', 'ORG_CHAT');
  return chatId;
}

// operationId list_chat_shares — active links + what a PII scan found in the chat (shown before a link is made, FR-CHAT-026 AC3)
export const GET = defineOperation({ operationId: 'list_chat_shares', role: 'member' }, async ({ session, params }) => {
  const chatId = await personalChat(session, params.chatId);
  return ok({ ...(await listShares(chatId)), default_days: SHARE_DEFAULT_DAYS, max_days: SHARE_MAX_DAYS });
});

const Create = z.object({ days: z.number().int().min(1).max(SHARE_MAX_DAYS).default(SHARE_DEFAULT_DAYS), password: z.string().min(6).max(100).optional() });

// operationId create_chat_share — returns the URL once; only a hash of the token is stored
export const POST = defineOperation({ operationId: 'create_chat_share', role: 'member', input: Create }, async ({ req, session, params, input }) => {
  const chatId = await personalChat(session, params.chatId);
  const { token, id } = await createShare(Number(session.user.id), chatId, { days: input.days, password: input.password });
  return ok({ id, url: `${publicBase(req)}/share/${token}` });
});
