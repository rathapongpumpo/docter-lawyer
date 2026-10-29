import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { audit } from '@/lib/audit';
import { EDITABLE_TYPES, revise, type EditableType } from '@/lib/content-edit';

// operationId admin_revise_content — a new draft copied from this version (change published content, or restore an older version)
export const POST = defineOperation({ operationId: 'admin_revise_content', role: 'editor' }, async ({ req, session, params }) => {
  requireRoles(session, ['editor', 'admin']);
  const id = Number(params.id);
  if (!(EDITABLE_TYPES as readonly string[]).includes(params.type ?? '') || !Number.isSafeInteger(id)) throw new ApiError('not_found', 'not found');
  const newId = await revise(params.type as EditableType, id, Number(session.user.id));
  await audit({ action: 'content.revise', actorId: Number(session.user.id), request: req, targetType: params.type, targetId: String(newId), meta: { from: id } });
  return ok({ id: newId });
});
