import { z } from 'zod';
import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { getJob, startCommit } from '@/lib/law-import';

const Body = z.object({
  overrides: z.record(z.string().max(20), z.string().max(60_000)).default({}),
  exclude: z.array(z.string().max(20)).max(6000).default([]),
});

// operationId admin_commit_law_import — saves the parsed (and corrected) sections as a DRAFT version; a reviewer approves it later
export const POST = defineOperation({ operationId: 'admin_commit_law_import', role: 'editor', input: Body }, async ({ req, session, params, input }) => {
  const role = requireRoles(session, ['editor', 'admin']);
  const id = Number(params.jobId);
  const job = Number.isSafeInteger(id) ? await getJob(id) : null;
  if (!job || (role !== 'admin' && job.created_by !== Number(session.user.id))) throw new ApiError('not_found', 'not found');
  return ok(await startCommit({ userId: Number(session.user.id), parseJobId: id, overrides: input.overrides, exclude: input.exclude, request: req }));
});
