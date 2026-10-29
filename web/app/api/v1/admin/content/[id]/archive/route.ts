import { z } from 'zod';
import { actorOf } from '@/lib/api/actor';
import { defineOperation, fail, ok } from '@/lib/api/handler';
import { archive, CONTENT_TYPES } from '@/lib/review';

// operationId admin_archive_content — withdraw published content (docs/03-technical-spec.md §3.2.10)
export const POST = defineOperation(
  {
    operationId: 'admin_archive_content',
    role: 'reviewer',
    input: z.object({ type: z.enum(CONTENT_TYPES), comment: z.string().trim().min(1).max(4000) }),
  },
  async ({ session, params, input }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail('not_found');
    await archive(input.type, id, actorOf(session), input.comment);
    return ok({ id, status: 'archived' });
  },
);
