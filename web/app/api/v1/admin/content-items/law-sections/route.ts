import { z } from 'zod';
import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { searchSections } from '@/lib/content-edit';

// operationId admin_search_sections — citation helper: "ปพพ 420" → [[law:ccc:420]]
export const GET = defineOperation({ operationId: 'admin_search_sections', role: 'editor', input: z.object({ q: z.string().trim().min(1).max(60) }) }, async ({ session, input }) => {
  requireRoles(session, ['editor', 'admin']);
  return ok({ sections: await searchSections(input.q) });
});
