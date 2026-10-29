import { z } from 'zod';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { createFolder } from '@/lib/chats';

// operationId create_chat_folder — members only (FR-CHAT-023); a folder belongs to the workspace it was made in
export const POST = defineOperation({ operationId: 'create_chat_folder', role: 'member', input: z.object({ name: z.string().trim().min(1).max(80) }) }, async ({ session, input }) => {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  return ok(await createFolder(session, input.name));
});
