import { sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AdminOrgs } from '@/components/admin/AdminOrgs';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.orgs'))('title') };
}

// System admin only (not editors/reviewers): organizations, plans and quota overrides.
export default async function AdminOrgsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (roleOf(session) !== 'admin') notFound();
  const rows = (await db.execute<{ id: string; name: string; slug: string; status: string; members: number; plan: string; seat_limit: number; chat_daily_per_member: number }>(sql`
    SELECT o.id, o.name, o.slug::text AS slug, o.status, (SELECT count(*) FROM app.members m WHERE m.organization_id = o.id)::int AS members,
           coalesce(s.plan, 'pilot') AS plan, coalesce(s.seat_limit, 20) AS seat_limit,
           coalesce(s.chat_daily_per_member, 300) AS chat_daily_per_member
    FROM app.organizations o LEFT JOIN app.org_settings s ON s.organization_id = o.id ORDER BY o.created_at DESC LIMIT 200`)).rows;
  return <AdminOrgs orgs={rows} />;
}
