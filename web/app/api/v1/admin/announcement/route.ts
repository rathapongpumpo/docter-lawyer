import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { getAnnouncement } from '@/lib/announcement';
import { db } from '@/lib/db/client';

// operationId admin_get_announcement
export const GET = defineOperation({ operationId: 'admin_get_announcement', role: 'admin' }, async () => ok({ announcement: await getAnnouncement(true) }));

const Body = z.object({
  th: z.string().trim().max(300),
  en: z.string().trim().max(300),
  level: z.enum(['info', 'warning']).default('info'),
  starts_at: z.iso.datetime().nullable().default(null),
  ends_at: z.iso.datetime().nullable().default(null),
}).refine((v) => v.th.length > 0 || v.en.length > 0, { message: 'text is required' });

// operationId admin_set_announcement — a new id each time, so a dismissed banner does not stay hidden for a different message (FR-ADM-022 AC1)
export const PUT = defineOperation({ operationId: 'admin_set_announcement', role: 'admin', input: Body }, async ({ req, session, input }) => {
  const value = { ...input, id: crypto.randomUUID() };
  await db.execute(sql`INSERT INTO app.system_settings (key, value, description, updated_by) VALUES ('announcement.banner', ${JSON.stringify(value)}::jsonb, 'System announcement banner', ${Number(session.user.id)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`);
  await audit({ action: 'announcement.set', actorId: Number(session.user.id), actorRole: 'admin', request: req, meta: { level: input.level } });
  return ok({ id: value.id });
});

// operationId admin_clear_announcement
export const DELETE = defineOperation({ operationId: 'admin_clear_announcement', role: 'admin' }, async ({ req, session }) => {
  await db.execute(sql`DELETE FROM app.system_settings WHERE key = 'announcement.banner'`);
  await audit({ action: 'announcement.cleared', actorId: Number(session.user.id), actorRole: 'admin', request: req });
  return ok({ cleared: true });
});
