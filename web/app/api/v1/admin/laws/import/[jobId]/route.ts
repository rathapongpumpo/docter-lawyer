import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { getJob } from '@/lib/law-import';

// operationId admin_get_law_import — progress of a parse / commit job (only the person who started it, or an admin, sees it)
export const GET = defineOperation({ operationId: 'admin_get_law_import', role: 'editor' }, async ({ session, params }) => {
  const role = requireRoles(session, ['editor', 'admin']);
  const id = Number(params.jobId);
  const job = Number.isSafeInteger(id) ? await getJob(id) : null;
  if (!job || (role !== 'admin' && job.created_by !== Number(session.user.id))) throw new ApiError('not_found', 'not found');
  return ok(job);
});
