import { z } from 'zod';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { getKillSwitch } from '@/lib/ops';
import { limits, rateLimit } from '@/lib/rate-limit';
import { listContracts, MAX_BYTES, uploadContract } from '@/lib/contracts';
import { activeOrgFor } from '@/lib/org';

// Contracts belong to an organization: the caller must be a member of their active workspace (FR-CR-001). Guests and the personal space have none.
async function workspace(session: Parameters<typeof roleOf>[0]) {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  const userId = Number(session!.user.id);
  const org = await activeOrgFor(userId, (session!.session as { activeOrganizationId?: string | null }).activeOrganizationId);
  if (!org) throw new ApiError('invalid_input', 'NO_ORG');
  return { userId, orgId: org.orgId };
}

// operationId list_contracts
export const GET = defineOperation({ operationId: 'list_contracts', role: 'member', input: z.object({ q: z.string().trim().max(80).optional() }) }, async ({ req, session, input }) => {
  const { userId, orgId } = await workspace(session);
  return ok({ contracts: await listContracts(userId, orgId, req, input.q), max_mb: MAX_BYTES / 1024 / 1024 });
});

// operationId upload_contract — multipart/form-data, field `file` (PDF or DOCX)
export const POST = defineOperation({ operationId: 'upload_contract', role: 'member' }, async ({ req, session }) => {
  if ((await getKillSwitch()).uploads) throw new ApiError('ai_unavailable', 'UPLOADS_PAUSED');
  const { userId, orgId } = await workspace(session);
  const perMin = await rateLimit('upload', `u:${userId}`, limits.uploadPerMin, 60);
  if (!perMin.ok) throw new ApiError('rate_limited', 'too many uploads');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError('invalid_input', 'NO_FILE');
  if (file.size > MAX_BYTES) throw new ApiError('invalid_input', 'TOO_LARGE');
  const { id } = await uploadContract({ userId, orgId, fileName: file.name, data: Buffer.from(await file.arrayBuffer()), request: req });
  return ok({ id });
});
