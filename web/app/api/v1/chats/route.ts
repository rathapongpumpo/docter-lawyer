import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { listChats, listFolders } from '@/lib/chats';

const Query = z.object({
  q: z.string().trim().max(80).optional(),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// operationId get_chat_history — chats of the current workspace (pinned first) + folders; `q` searches titles (FR-CHAT-018/019)
export const GET = defineOperation({ operationId: 'get_chat_history', role: 'guest', input: Query }, async ({ session, input }) => {
  const { chats, has_more } = await listChats(session, input);
  return ok({ chats, has_more, folders: input.offset === 0 ? await listFolders(session) : undefined });
});
