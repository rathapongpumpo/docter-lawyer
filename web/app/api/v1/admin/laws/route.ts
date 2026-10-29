import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { listLaws } from '@/lib/law-import';

// operationId admin_list_laws — laws an uploaded text can become a new version of
export const GET = defineOperation({ operationId: 'admin_list_laws', role: 'editor' }, async ({ session }) => {
  requireRoles(session, ['editor', 'admin']);
  return ok({ laws: await listLaws() });
});
