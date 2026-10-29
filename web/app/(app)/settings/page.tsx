import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PreferencesCard } from '@/components/account/PreferencesCard';
import { PrivacyCard } from '@/components/account/PrivacyCard';
import { ProfileCard } from '@/components/account/ProfileCard';
import { SecurityCard } from '@/components/account/SecurityCard';
import { activeConsents, DEFAULT_SETTINGS, getSettings } from '@/lib/account';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { LEGAL_VERSIONS } from '@/lib/legal';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('settings'))('title') };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ require2fa?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const t = await getTranslations('settings');
  if (roleOf(session) === 'guest') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        <PreferencesCard initial={DEFAULT_SETTINGS} local />
        <p className="text-sm text-muted">{t('guestPrefsNote')}</p>
        <p className="text-muted">{t('guestOnly')}</p>
        <Link href="/register" className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-5 font-semibold text-white hover:bg-primary-600">
          {t('guestRegister')}
        </Link>
      </div>
      </div>
    );
  }
  const userId = Number(session.user.id);
  const [settings, consents, u, dsr] = await Promise.all([
    getSettings(userId),
    activeConsents(userId),
    db.execute<{ two_factor_enabled: boolean; email_verified: boolean; status: string; deletion_scheduled_at: string | null }>(
      sql`SELECT two_factor_enabled, email_verified, status::text AS status, deletion_scheduled_at::text FROM app.users WHERE id = ${userId}`,
    ),
    db.execute<{ id: number; request_type: string; status: string; due_at: string }>(
      sql`SELECT id, request_type, status, due_at::text FROM app.dsr_requests WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 5`,
    ),
  ]);
  const me = u.rows[0]!;
  const { require2fa } = await searchParams;
  const role = roleOf(session);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        {require2fa === '1' && (
          <p role="alert" className="rounded-lg bg-warning-050 px-4 py-3 text-sm text-warning">{t('security.staffRequired')}</p>
        )}
        <ProfileCard name={session.user.name} email={session.user.email} verified={me.email_verified} showVerification={env.emailVerificationRequired} role={role} />
        <PreferencesCard initial={settings} />
        <SecurityCard twoFactorEnabled={me.two_factor_enabled} isStaff={role !== 'member'} />
        <PrivacyCard
          consents={Object.entries(consents).map(([purpose, c]) => ({ purpose, version: c.version, grantedAt: c.granted_at }))}
          currentVersions={LEGAL_VERSIONS}
          pendingDeletionAt={me.status === 'pending_deletion' ? me.deletion_scheduled_at : null}
          requests={dsr.rows.map((r) => ({ id: r.id, type: r.request_type, status: r.status, dueAt: r.due_at }))}
        />
      </div>
    </div>
  );
}
