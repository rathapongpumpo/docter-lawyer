import { z } from 'zod';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { getSettings, saveSettings } from '@/lib/account';
import { ApiError } from '@/lib/api/envelope';

const patch = z.object({
  locale: z.enum(['th', 'en']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  text_scale: z.union([z.literal(100), z.literal(112), z.literal(125), z.literal(150)]).optional(),
  email_notifications: z.boolean().optional(),
  last_chat_id: z.uuid().nullable().optional(),
});

function memberId(session: Parameters<typeof roleOf>[0]): number {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  return Number(session!.user.id);
}

// operationId get_settings
export const GET = defineOperation({ operationId: 'get_settings', role: 'member' }, async ({ session }) =>
  ok(await getSettings(memberId(session))),
);

// operationId update_settings
export const PATCH = defineOperation({ operationId: 'update_settings', role: 'member', input: patch }, async ({ session, input }) =>
  ok(await saveSettings(memberId(session), input)),
);
