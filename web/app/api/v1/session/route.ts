import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { dailyLimit, messagesLeft } from '@/lib/quota';
import { env } from '@/lib/env';

// operationId check_session — footer countdown + build check
export const GET = defineOperation({ operationId: 'check_session', role: 'guest' }, async ({ session }) => {
  return ok({
    user: { id: session.user.id, name: session.user.name, email: session.user.email, role: roleOf(session) },
    active_org_id: (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
    idle_timeout_min: env.sessionLifetimeMin,
    daily_limit: dailyLimit(session),
    messages_left: await messagesLeft(session),
    version: env.appVersion,
    build: env.appBuild,
  });
});