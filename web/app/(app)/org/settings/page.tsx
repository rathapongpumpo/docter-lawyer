import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/env';
import { OrgSettingsView } from '@/components/org/OrgSettingsView';
import { auth } from '@/lib/auth';
import { memberRole } from '@/lib/org';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('org.general'))('title') };
}

export default async function OrgSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  // includes an organization that is waiting for deletion, so its owner can still cancel
  const role = orgId ? await memberRole(Number(session.user.id), orgId, true) : null;
  if (!orgId || !role) redirect('/org/new');
  if (role !== 'org_owner') {
    // waiting for deletion: only owners may still open it
    if (!(await memberRole(Number(session.user.id), orgId))) redirect('/org/new');
  }
  return <OrgSettingsView orgId={orgId} meId={String(session.user.id)} mailLive={env.mailLive} />;
}
