import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { deleteFolder, updateFolder } from '@/lib/chats';

const id = (raw?: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ApiError('not_found', 'folder not found');
  return n;
};

// operationId update_chat_folder — rename / collapse state
export const PATCH = defineOperation(
  { operationId: 'update_chat_folder', role: 'member', input: z.object({ name: z.string().trim().min(1).max(80).optional(), is_collapsed: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0) },
  async ({ session, params, input }) => {
    await updateFolder(session, id(params.folderId), input);
    return ok({ id: id(params.folderId), ...input });
  },
);

// operationId delete_chat_folder — ?mode=keep (chats move out) | delete_chats
export const DELETE = defineOperation({ operationId: 'delete_chat_folder', role: 'member', input: z.object({ mode: z.enum(['keep', 'delete_chats']).default('keep') }) }, async ({ session, params, input }) => {
  await deleteFolder(session, id(params.folderId), input.mode);
  return ok({ id: id(params.folderId) });
});
