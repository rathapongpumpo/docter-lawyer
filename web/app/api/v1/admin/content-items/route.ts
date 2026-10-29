import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { listContent } from '@/lib/content-edit';

// operationId admin_list_content — every article, guide, template and glossary term with its latest version (editors and admins)
export const GET = defineOperation({ operationId: 'admin_list_content', role: 'editor' }, async ({ session }) => {
  requireRoles(session, ['editor', 'admin']);
  return ok({ items: await listContent() });
});
