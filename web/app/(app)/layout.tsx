import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChatReturnTracker } from '@/components/chat/ChatReturnTracker';
import { AccountBanners } from '@/components/shell/AccountBanners';
import { AnnouncementBanner } from '@/components/shell/AnnouncementBanner';
import { getAnnouncement } from '@/lib/announcement';
import { getLocale } from 'next-intl/server';
import { AppShell } from '@/components/shell/AppShell';
import { hasRequiredConsents } from '@/lib/account';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const user = session.user as { id: string; name: string; email: string; isAnonymous?: boolean };
  const role = roleOf(session);
  const isGuest = role === 'guest';

  let unverified = false;
  let deletionAt: string | null = null;
  // Consent gate for members and guests: terms / privacy notice accepted at their current version (PDPA, FR-AUTH-009)
  if (!(await hasRequiredConsents(Number(user.id)))) {
    const back = (await headers()).get('x-pathname');
    redirect(back && back.startsWith('/') && !back.startsWith('//') && back !== '/chat' ? `/consent?next=${encodeURIComponent(back)}` : '/consent');
  }
  if (!isGuest) {
    const [row] = (await db.execute<{ email_verified: boolean; status: string; deletion_scheduled_at: string | null }>(
      sql`SELECT email_verified, status::text AS status, deletion_scheduled_at::text FROM app.users WHERE id = ${Number(user.id)}`,
    )).rows;
    // Only a notice when verification is actually enforced: outgoing mail is not live yet, so nobody could act on it
    unverified = env.emailVerificationRequired && !row?.email_verified;
    deletionAt = row?.status === 'pending_deletion' ? row.deletion_scheduled_at : null;
  }
  const announcement = await getAnnouncement();
  const locale = await getLocale();
  const annText = announcement ? (locale === 'en' ? announcement.en || announcement.th : announcement.th || announcement.en) : '';
  return (
    <AppShell
      user={{ id: String(user.id), name: isGuest ? '' : user.name, isGuest, role }}
      version={env.appVersion}
      build={env.appBuild}
      idleTimeoutMin={env.sessionLifetimeMin}
    >
      <ChatReturnTracker />
      {announcement && annText && <AnnouncementBanner id={announcement.id} text={annText} level={announcement.level} />}
      {!isGuest && <AccountBanners email={user.email} unverified={unverified} deletionAt={deletionAt} />}
      {children}
    </AppShell>
  );
}
