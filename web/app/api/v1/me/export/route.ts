import { sql } from 'drizzle-orm';
import { defineOperation, roleOf } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { activeConsents, getSettings } from '@/lib/account';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';

// operationId privacy_export — PDPA access/portability: the member's own data as one JSON download (FR-AUTH-020).
// Chat text is included because it is the member's own data; it is only returned to them, never logged.
export const GET = defineOperation({ operationId: 'privacy_export', role: 'member' }, async ({ req, session }) => {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  const userId = Number(session.user.id);
  const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)).rows;
  const [[account], chats, consents, feedback] = await Promise.all([
    q(sql`SELECT email, display_name, role::text AS role, created_at, last_login_at FROM app.users WHERE id = ${userId}`),
    q(sql`SELECT c.id, c.title, c.created_at,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('role', m.role::text, 'content', m.content, 'created_at', m.created_at) ORDER BY m.id), '[]'::jsonb)
             FROM app.messages m WHERE m.chat_id = c.id AND m.is_active) AS messages
          FROM app.chats c WHERE c.user_id = ${userId} AND c.deleted_at IS NULL ORDER BY c.created_at`),
    q(sql`SELECT purpose::text, doc_version, granted, granted_at, withdrawn_at FROM app.user_consents WHERE user_id = ${userId} ORDER BY id`),
    q(sql`SELECT message_id, rating, reasons::text[] AS reasons, created_at FROM app.message_feedback WHERE user_id = ${userId}`),
  ]);
  await db.execute(sql`INSERT INTO app.dsr_requests (user_id, request_type, status, completed_at)
    VALUES (${userId}, 'export', 'completed', now())`);
  await audit({ action: 'privacy.export', actorId: userId, request: req, meta: { chats: chats.length } });
  const payload = {
    exported_at: new Date().toISOString(),
    account,
    settings: await getSettings(userId),
    consents,
    active_consents: await activeConsents(userId),
    chats,
    feedback,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="nitimitr-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
});
