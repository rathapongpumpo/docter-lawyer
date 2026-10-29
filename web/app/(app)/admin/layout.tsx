import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { hasRole, roleOf } from '@/lib/api/handler';
import { sectionsFor } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

// Back-office is for staff only (editor and above); everyone else gets a plain 404.
// Staff must have two-factor authentication on (FR-ADM-001 AC2) — always in prod, elsewhere with STAFF_2FA_REQUIRED=true.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(roleOf(session), 'editor')) notFound();
  if (env.isProd || process.env.STAFF_2FA_REQUIRED === 'true') {
    const [row] = (await db.execute<{ two_factor_enabled: boolean }>(
      sql`SELECT two_factor_enabled FROM app.users WHERE id = ${Number(session.user.id)}`,
    )).rows;
    if (!row?.two_factor_enabled) redirect('/settings?require2fa=1');
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminNav sections={sectionsFor(roleOf(session))} />
      {children}
    </div>
  );
}
