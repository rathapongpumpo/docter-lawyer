import { z } from 'zod';
import { actorOf } from '@/lib/api/actor';
import { defineOperation, fail, ok } from '@/lib/api/handler';
import { CONTENT_TYPES, decide, getReviewItem } from '@/lib/review';

// operationId admin_review_decision — approve = publish + reindex; law versions also take their effective date
// (covers admin_publish_law_version, docs/03-technical-spec.md §3.2.10)
export const POST = defineOperation(
  {
    operationId: 'admin_review_decision',
    role: 'reviewer',
    input: z.object({
      type: z.enum(CONTENT_TYPES),
      decision: z.enum(['approve', 'request_changes', 'reject']),
      comment: z.string().trim().max(4000).optional(),
      checklist: z.array(z.string().max(40)).max(20).default([]),
      effective_from: z.iso.date().optional(),
    }),
  },
  async ({ session, params, input }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail('not_found');
    const item = await getReviewItem(input.type, id);
    if (!item) return fail('not_found');
    await decide(input.type, id, actorOf(session), {
      decision: input.decision,
      comment: input.comment || null,
      checklist: input.checklist,
      effectiveFrom: input.effective_from ?? null,
      lastSubmitterId: item.lastSubmitterId,
    });
    return ok({ id, decision: input.decision });
  },
);
