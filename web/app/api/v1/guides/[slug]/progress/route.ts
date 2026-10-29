import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError } from '@/lib/api/envelope';
import { defineOperation, ok, roleOf } from '@/lib/api/handler';
import { db } from '@/lib/db/client';
import { guideKeys, parseGuide } from '@/lib/guide-doc';
import { getGuide } from '@/lib/kb';
import { pgArray } from '@/lib/pg';

const SLUG = /^[a-z0-9-]{1,120}$/;

async function currentGuide(slug: string) {
  if (!SLUG.test(slug)) throw new ApiError('not_found', 'guide not found');
  const guide = await getGuide(slug);
  if (!guide) throw new ApiError('not_found', 'guide not found');
  const [row] = (await db.execute<{ id: number }>(sql`SELECT id FROM kb.guides WHERE slug = ${slug} AND locale = 'th' AND deleted_at IS NULL ORDER BY version_no DESC LIMIT 1`)).rows;
  return { keys: guideKeys(parseGuide(guide.bodyMd)), guideId: row?.id ?? null };
}

// operationId get_guide_progress — members only; guests keep their ticks in the browser (FR-GUIDE-003)
export const GET = defineOperation({ operationId: 'get_guide_progress', role: 'guest' }, async ({ session, params }) => {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  await currentGuide(params.slug);
  const [row] = (await db.execute<{ checked_items: string[]; completed_at: string | null }>(sql`
    SELECT checked_items, completed_at::text FROM app.guide_progress WHERE user_id = ${Number(session.user.id)} AND guide_slug = ${params.slug}`)).rows;
  return ok({ checked: row?.checked_items ?? [], completed: !!row?.completed_at });
});

const Body = z.object({ checked: z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/)).max(80), completed: z.boolean() });

// operationId update_guide_progress — only keys the guide really has are stored; "done" keeps its first timestamp
export const PUT = defineOperation({ operationId: 'update_guide_progress', role: 'guest', input: Body }, async ({ session, params, input }) => {
  if (roleOf(session) === 'guest') throw new ApiError('forbidden', 'members only');
  const { keys, guideId } = await currentGuide(params.slug);
  const known = new Set(keys);
  const checked = [...new Set(input.checked)].filter((k) => known.has(k));
  await db.execute(sql`
    INSERT INTO app.guide_progress (user_id, guide_slug, guide_id, checked_items, completed_at)
    VALUES (${Number(session.user.id)}, ${params.slug}, ${guideId}, ${pgArray(checked)}::text[], ${input.completed ? sql`now()` : sql`NULL`})
    ON CONFLICT (user_id, guide_slug) DO UPDATE SET guide_id = EXCLUDED.guide_id, checked_items = EXCLUDED.checked_items,
      completed_at = CASE WHEN ${input.completed} THEN COALESCE(app.guide_progress.completed_at, now()) ELSE NULL END, updated_at = now()`);
  return ok({ checked, completed: input.completed });
});
