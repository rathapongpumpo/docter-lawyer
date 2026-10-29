import { z } from 'zod';
import { defineOperation, ok, requireRoles } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { MAX_LAW_BYTES, startParse } from '@/lib/law-import';

const Meta = z.object({ law_code: z.string().regex(/^[a-z0-9_]+$/).max(40), version_label: z.string().trim().min(3).max(200) });

// operationId admin_import_law — multipart: file (PDF / TXT / HTML) or `text` (pasted), law_code, version_label → parse job
export const POST = defineOperation({ operationId: 'admin_import_law', role: 'editor' }, async ({ req, session }) => {
  requireRoles(session, ['editor', 'admin']);
  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError('invalid_input', 'NO_FILE');
  const meta = Meta.safeParse({ law_code: form.get('law_code'), version_label: form.get('version_label') });
  if (!meta.success) throw new ApiError('invalid_input', 'BAD_FIELDS');
  const file = form.get('file');
  const text = form.get('text');
  let data: Buffer;
  let name: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LAW_BYTES) throw new ApiError('invalid_input', 'TOO_LARGE');
    data = Buffer.from(await file.arrayBuffer());
    name = file.name;
  } else if (typeof text === 'string' && text.trim().length > 0) {
    data = Buffer.from(text, 'utf8');
    name = 'pasted-text.txt';
  } else throw new ApiError('invalid_input', 'NO_FILE');
  return ok(await startParse({ userId: Number(session.user.id), lawCode: meta.data.law_code, versionLabel: meta.data.version_label, fileName: name, data, request: req }));
});
