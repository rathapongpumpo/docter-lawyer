import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { chatAccess } from '@/lib/chats';
import { db } from '@/lib/db/client';

const ITEM_TYPES = ['message', 'article', 'law_section', 'guide', 'template', 'glossary'] as const;

// operationId get_saved — the "Saved" list (FR-CHAT-034): answers, articles, law sections, guides, templates; newest first, pinned on top
export const GET = defineOperation(
  { operationId: 'get_saved', role: 'member', input: z.object({ q: z.string().trim().max(80).optional() }) },
  async ({ session, input }) => {
    if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
    const q = input.q ? sql`AND b.title ILIKE ${`%${input.q.replace(/[%_\\]/g, '\\$&')}%`}` : sql``;
    const items = (await db.execute(sql`SELECT b.id, b.item_type::text AS item_type, b.item_id, b.title, b.note, b.is_pinned, b.created_at,
        CASE WHEN b.item_type = 'message' THEN (SELECT m.chat_id FROM app.messages m JOIN app.chats c ON c.id = m.chat_id AND c.deleted_at IS NULL
                                                WHERE m.id = b.item_id::bigint) END AS chat_id
      FROM app.bookmarks b WHERE b.user_id = ${Number(session.user.id)} AND b.deleted_at IS NULL ${q}
      ORDER BY b.is_pinned DESC, b.created_at DESC LIMIT 200`)).rows;
    return ok({ items });
  },
);

const Create = z.object({
  item_type: z.enum(ITEM_TYPES),
  item_id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
});

// operationId add_bookmark — members only (guests are invited to sign up); saving twice is a no-op
export const POST = defineOperation({ operationId: 'add_bookmark', role: 'guest', input: Create }, async ({ req, session, input }) => {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'SIGN_UP_REQUIRED');
  const userId = Number(session.user.id);
  if (input.item_type === 'message') {
    // only an answer the caller can see may be saved
    const id = Number(input.item_id);
    const [m] = Number.isInteger(id) ? (await db.execute<{ chat_id: string }>(sql`SELECT chat_id FROM app.messages WHERE id = ${id} AND role = 'assistant'`)).rows : [];
    if (!m || (await chatAccess(session, m.chat_id, req)) !== 'owner') throw new ApiError('not_found', 'message not found');
  }
  const [row] = (await db.execute<{ id: number }>(sql`INSERT INTO app.bookmarks (user_id, item_type, item_id, title)
    VALUES (${userId}, ${input.item_type}::app.saved_item_type, ${input.item_id}, ${input.title})
    ON CONFLICT (user_id, item_type, item_id) WHERE deleted_at IS NULL DO UPDATE SET updated_at = now() RETURNING id`)).rows;
  return ok({ id: row!.id });
});

// operationId remove_bookmark_by_item — un-save from the place it was saved (an answer's bookmark button)
export const DELETE = defineOperation(
  { operationId: 'remove_bookmark_by_item', role: 'member', input: z.object({ item_type: z.enum(ITEM_TYPES), item_id: z.string().trim().min(1).max(200) }) },
  async ({ session, input }) => {
    await db.execute(sql`UPDATE app.bookmarks SET deleted_at = now() WHERE user_id = ${Number(session.user.id)} AND item_type = ${input.item_type}::app.saved_item_type
      AND item_id = ${input.item_id} AND deleted_at IS NULL`);
    return ok({ removed: true });
  },
);
