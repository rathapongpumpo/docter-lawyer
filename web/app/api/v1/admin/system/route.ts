import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { getKillSwitch, setKillSwitch } from '@/lib/ops';

// operationId admin_get_system
export const GET = defineOperation({ operationId: 'admin_get_system', role: 'admin' }, async () => ok({ kill_switch: await getKillSwitch(true) }));

const Body = z.object({ guests_chat: z.boolean(), all_chat: z.boolean(), uploads: z.boolean(), note: z.string().trim().max(200).default('') });

// operationId admin_set_kill_switch — takes effect within seconds; every change is audited with the resulting state
export const PUT = defineOperation({ operationId: 'admin_set_kill_switch', role: 'admin', input: Body }, async ({ req, session, input }) => {
  const next = await setKillSwitch(input, Number(session.user.id));
  await audit({
    action: 'system.kill_switch_changed', actorId: Number(session.user.id), actorRole: 'admin', request: req,
    meta: { guests_chat: next.guests_chat, all_chat: next.all_chat, uploads: next.uploads },
  });
  return ok({ kill_switch: next });
});
