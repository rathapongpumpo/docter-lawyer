import { z } from 'zod';
import { defineOperation, fail, ok } from '@/lib/api/handler';
import { getChatWithMessages, softDeleteChat, updateChat } from '@/lib/chats';

const ChatId = z.uuid();

// operationId get_chat
export const GET = defineOperation({ operationId: 'get_chat', role: 'guest' }, async ({ req, session, params }) => {
  const id = ChatId.safeParse(params.chatId);
  if (!id.success) return fail('not_found');
  return ok(await getChatWithMessages(session, id.data, req));
});

const ChatPatch = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    is_pinned: z.boolean().optional(),
    folder_id: z.number().int().positive().nullable().optional(),
    scope: z.array(z.string().regex(/^[A-Z]+(\.[A-Z0-9_]+)?$/)).max(30).optional(),
    visibility: z.enum(['private', 'org']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to change');

// operationId update_chat — rename (title_source becomes 'user', BR-013), pin, move to folder, legal scope, org visibility
export const PATCH = defineOperation({ operationId: 'update_chat', role: 'guest', input: ChatPatch }, async ({ session, params, input }) => {
  const id = ChatId.safeParse(params.chatId);
  if (!id.success) return fail('not_found');
  await updateChat(session, id.data, input);
  return ok({ id: id.data, ...input });
});

// operationId delete_chat
export const DELETE = defineOperation({ operationId: 'delete_chat', role: 'guest' }, async ({ session, params }) => {
  const id = ChatId.safeParse(params.chatId);
  if (!id.success) return fail('not_found');
  await softDeleteChat(session, id.data);
  return ok({ id: id.data });
});
