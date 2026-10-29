import { z } from 'zod';
import { actorOf } from '@/lib/api/actor';
import { defineOperation, fail, ok } from '@/lib/api/handler';
import { CONTENT_TYPES, submitForReview } from '@/lib/review';

// operationId admin_submit_review — editor sends a draft to the review queue (docs/03-technical-spec.md §3.2.10)
export const POST = defineOperation(
  {
    operationId: 'admin_submit_review',
    role: 'editor',
    input: z.object({ type: z.enum(CONTENT_TYPES), note: z.string().trim().max(2000).optional() }),
  },
  async ({ session, params, input }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail('not_found');
    await submitForReview(input.type, id, actorOf(session), input.note || null);
    return ok({ id, status: 'in_review' });
  },
);
