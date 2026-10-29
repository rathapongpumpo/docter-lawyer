import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { db } from '@/lib/db/client';

const id = (raw?: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ApiError('not_found', 'not found');
  return n;
};

// operationId update_bookmark — rename / pin
export const PATCH = defineOperation(
  { operationId: 'update_bookmark', role: 'member', input: z.object({ title: z.string().trim().min(1).max(200).optional(), is_pinned: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0) },
  async ({ session, params, input }) => {
    const r = await db.execute(sql`UPDATE app.bookmarks SET title = COALESCE(${input.title ?? null}, title), is_pinned = COALESCE(${input.is_pinned ?? null}, is_pinned), updated_at = now()
      WHERE id = ${id(params.bookmarkId)} AND user_id = ${Number(session.user.id)} AND deleted_at IS NULL`);
    if (!r.rowCount) throw new ApiError('not_found', 'not found');
    return ok({ id: id(params.bookmarkId) });
  },
);

// operationId delete_bookmark
export const DELETE = defineOperation({ operationId: 'delete_bookmark', role: 'member' }, async ({ session, params }) => {
  await db.execute(sql`UPDATE app.bookmarks SET deleted_at = now() WHERE id = ${id(params.bookmarkId)} AND user_id = ${Number(session.user.id)} AND deleted_at IS NULL`);
  return ok({ id: id(params.bookmarkId) });
});
