import { defineOperation, ok } from '@/lib/api/handler';
import { getGlossaryTips } from '@/lib/kb-library';

// operationId get_glossary_tips — term list for the hover definitions inside chat answers (FR-CHAT-015, FR-KB-011 AC2)
export const GET = defineOperation({ operationId: 'get_glossary_tips', role: 'guest' }, async () => {
  const res = ok({ terms: await getGlossaryTips() });
  res.headers.set('cache-control', 'private, max-age=300');
  return res;
});
