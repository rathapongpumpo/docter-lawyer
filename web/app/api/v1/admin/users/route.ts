import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { db } from '@/lib/db/client';

const Query = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(['member', 'editor', 'reviewer', 'admin']).optional(),
  status: z.enum(['active', 'suspended', 'pending_verification', 'pending_deletion']).optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

// operationId admin_list_users — accounts only (never chats, contracts or cases: FR-ADM-017). Guests are not listed.
export const GET = defineOperation({ operationId: 'admin_list_users', role: 'admin', input: Query }, async ({ input }) => {
  const like = input.q ? `%${input.q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const rows = (await db.execute(sql`SELECT id, email::text AS email, display_name AS name, role::text AS role, status::text AS status, banned, ban_reason,
      two_factor_enabled, email_verified, last_login_at::text AS last_login_at, created_at::text AS created_at, failed_login_count,
      (locked_until IS NOT NULL AND locked_until > now()) AS locked
    FROM app.users WHERE NOT is_anonymous AND deleted_at IS NULL
      AND (${like}::text IS NULL OR email ILIKE ${like} OR display_name ILIKE ${like})
      AND (${input.role ?? null}::text IS NULL OR role::text = ${input.role ?? null})
      AND (${input.status ?? null}::text IS NULL OR status::text = ${input.status ?? null})
    ORDER BY created_at DESC LIMIT 51 OFFSET ${input.offset}`)).rows;
  return ok({ users: rows.slice(0, 50), has_more: rows.length > 50 });
});
