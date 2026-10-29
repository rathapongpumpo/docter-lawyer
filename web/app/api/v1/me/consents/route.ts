import { z } from 'zod';
import { activeConsents, recordConsent } from '@/lib/account';
import { defineOperation, ok } from '@/lib/api/handler';
import { audit, clientIp, ipHash } from '@/lib/audit';
import { ApiError } from '@/lib/api/envelope';
import { LEGAL_VERSIONS, OPTIONAL_CONSENTS, REQUIRED_CONSENTS } from '@/lib/legal';

// operationId get_consents
export const GET = defineOperation({ operationId: 'get_consents', role: 'guest' }, async ({ session }) =>
  ok({ active: await activeConsents(Number(session.user.id)), current_versions: LEGAL_VERSIONS }),
);

const body = z.object({
  purpose: z.enum(['service_terms', 'privacy_notice', 'improve_service', 'marketing']),
  granted: z.boolean(),
});

// operationId record_consent — grant any purpose, withdraw only optional ones (withdrawing terms = delete the account)
export const POST = defineOperation({ operationId: 'record_consent', role: 'guest', input: body }, async ({ req, session, input }) => {
  if (!input.granted && (REQUIRED_CONSENTS as readonly string[]).includes(input.purpose)) {
    throw new ApiError('invalid_input', 'required consent cannot be withdrawn');
  }
  const userId = Number(session.user.id);
  await recordConsent(userId, input.purpose, input.granted, ipHash(clientIp(req)), req.headers.get('user-agent')?.slice(0, 200) ?? null);
  await audit({
    action: input.granted ? 'privacy.consent_granted' : 'privacy.consent_withdrawn',
    actorId: userId, targetType: 'consent', targetId: input.purpose, request: req,
    meta: { optional: (OPTIONAL_CONSENTS as readonly string[]).includes(input.purpose) },
  });
  return ok({ active: await activeConsents(userId) });
});
