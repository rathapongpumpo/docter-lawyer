import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { ApiError } from '@/lib/api/envelope';
import { defineOperation, fail } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { getTemplate } from '@/lib/kb';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { MAX_ANSWER_CHARS, parseTemplate, toLines } from '@/lib/template-doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  answers: z.record(z.string().regex(/^f\d{1,3}$/), z.string().max(MAX_ANSWER_CHARS)).default({}),
  format: z.enum(['docx', 'pdf']),
});

const MEDIA = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const;

// operationId render_template — stateless: the letter is built from the published template text plus the answers in this
// request, laid out by the AI service and returned; nothing is stored and the answers are never logged (PDPA, rule 8).
export const POST = defineOperation({ operationId: 'render_template', role: 'guest', input: Body }, async ({ session, params, input }) => {
  const doc = await getTemplate(params.slug);
  const form = doc && parseTemplate(doc.bodyMd);
  if (!doc || !form) throw new ApiError('not_found', 'template not found');
  const perWindow = await rateLimit('render', `u:${session.user.id}`, 12, 600); // 12 documents per 10 minutes
  if (!perWindow.ok) return fail('rate_limited', 'too many documents', perWindow.retryAfterSec);

  const known = new Set(form.fields.map((f) => f.key));
  const answers = Object.fromEntries(Object.entries(input.answers).filter(([k]) => known.has(k)));
  const t = await getTranslations({ locale: 'th', namespace: 'templates' });
  const upstream = await fetch(`${env.aiServiceUrl}/v1/documents/render`, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { 'content-type': 'application/json', 'x-service-token': env.aiServiceToken, 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify({ title: doc.title, lines: toLines(form, answers), footer: t('fileDisclaimer'), format: input.format }),
  }).catch(() => null);
  if (!upstream?.ok) return fail('ai_unavailable', 'document service unavailable');

  const data = await upstream.arrayBuffer();
  logger.info({ op: 'render_template', template: params.slug, format: input.format, filled: Object.keys(answers).length, bytes: data.byteLength }, 'template_rendered');
  return new Response(data, {
    headers: {
      'content-type': MEDIA[input.format],
      'content-disposition': `attachment; filename="${params.slug}.${input.format}"`,
      'cache-control': 'no-store',
    },
  });
});
