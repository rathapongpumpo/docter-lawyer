import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { deleteContract, getContract, setVisibility } from '@/lib/contracts';

// operationId get_contract — 404 for anyone who may not read it (other org, or a private contract of someone else)
export const GET = defineOperation({ operationId: 'get_contract', role: 'member' }, async ({ req, session, params }) =>
  ok(await getContract(Number(session.user.id), params.contractId!, req)),
);

// operationId update_contract — visibility (uploader only)
export const PATCH = defineOperation({ operationId: 'update_contract', role: 'member', input: z.object({ visibility: z.enum(['private', 'org']) }) }, async ({ req, session, params, input }) => {
  await setVisibility(Number(session.user.id), params.contractId!, input.visibility, req);
  return ok({ id: params.contractId, visibility: input.visibility });
});

// operationId delete_contract — uploader, org admin or org owner
export const DELETE = defineOperation({ operationId: 'delete_contract', role: 'member' }, async ({ req, session, params }) => {
  await deleteContract(Number(session.user.id), params.contractId!, req);
  return ok({ id: params.contractId });
});
