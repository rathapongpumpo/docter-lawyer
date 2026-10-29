import { z } from 'zod';
import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { EDITABLE_TYPES, getEditable, precheck, saveDraft, type EditableType } from '@/lib/content-edit';

const parse = (p: Record<string, string>): { type: EditableType; id: number } => {
  const id = Number(p.id);
  if (!(EDITABLE_TYPES as readonly string[]).includes(p.type ?? '') || !Number.isSafeInteger(id) || id < 1) throw new ApiError('not_found', 'not found');
  return { type: p.type as EditableType, id };
};
const fullText = (f: { body?: string; long_def_md?: string | null; short_def?: string }) => [f.body, f.long_def_md, f.short_def].filter(Boolean).join('\n\n');

// operationId admin_get_content — the fields of one version, its sibling versions (for the diff) and the pre-check
export const GET = defineOperation({ operationId: 'admin_get_content', role: 'editor' }, async ({ session, params }) => {
  requireRoles(session, ['editor', 'admin']);
  const { type, id } = parse(params);
  const item = await getEditable(type, id);
  if (!item) throw new ApiError('not_found', 'not found');
  return ok({ ...item, precheck: await precheck(fullText(item.fields)) });
});

const Body = z.object({
  if_updated_at: z.string().min(10).max(40),
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(300).nullable().optional(),
  body: z.string().max(100_000).optional(),
  term_th: z.string().trim().min(1).max(120).optional(),
  term_en: z.string().trim().max(120).nullable().optional(),
  short_def: z.string().trim().min(1).max(160).optional(),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  long_def_md: z.string().max(20_000).nullable().optional(),
});

// operationId admin_save_content — autosave target. Only a draft can be saved; a stale `if_updated_at` (someone saved in between) → 409 STALE.
export const PUT = defineOperation({ operationId: 'admin_save_content', role: 'editor', input: Body }, async ({ req, session, params, input }) => {
  requireRoles(session, ['editor', 'admin']);
  const { type, id } = parse(params);
  const { if_updated_at, ...fields } = input;
  const updatedAt = await saveDraft(type, id, fields, if_updated_at, Number(session.user.id));
  const item = await getEditable(type, id);
  // content of the edit is never written to the audit log — only that an edit happened
  await audit({ action: 'content.edit', actorId: Number(session.user.id), request: req, targetType: type, targetId: String(id) });
  return ok({ updated_at: updatedAt, precheck: item ? await precheck(fullText(item.fields)) : null });
});
