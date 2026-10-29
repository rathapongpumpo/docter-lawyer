import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { revokeShare } from '@/lib/shares';

// operationId revoke_chat_share
export const DELETE = defineOperation({ operationId: 'revoke_chat_share', role: 'member' }, async ({ session, params }) => {
  const id = Number(params.shareId);
  if (!Number.isInteger(id) || id < 1 || !params.chatId) throw new ApiError('not_found', 'link not found');
  await revokeShare(Number(session.user.id), params.chatId, id);
  return ok({ id });
});
