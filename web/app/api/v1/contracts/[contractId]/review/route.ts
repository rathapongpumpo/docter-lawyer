import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { getReview, startReview } from '@/lib/contract-review';
import { getKillSwitch } from '@/lib/ops';
import { limits, rateLimit } from '@/lib/rate-limit';

// operationId get_contract_review — the newest review of a contract (summary + findings) and whether reviewing is switched on; 404 for anyone who may not read the contract
export const GET = defineOperation({ operationId: 'get_contract_review', role: 'member' }, async ({ req, session, params }) =>
  ok(await getReview(Number(session.user.id), params.contractId!, req)),
);

// operationId start_contract_review — queue a review (worker job). Paused with the upload kill switch: it also moves contract text to another service.
export const POST = defineOperation({ operationId: 'start_contract_review', role: 'member', input: z.object({}) }, async ({ req, session, params }) => {
  if ((await getKillSwitch()).uploads) throw new ApiError('ai_unavailable', 'UPLOADS_PAUSED');
  const userId = Number(session.user.id);
  const perMin = await rateLimit('review', `u:${userId}`, limits.reviewPerMin, 60);
  if (!perMin.ok) throw new ApiError('rate_limited', 'too many requests');
  return ok(await startReview(userId, params.contractId!, req));
});
