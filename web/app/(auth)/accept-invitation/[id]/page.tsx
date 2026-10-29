import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AcceptInvitation } from '@/components/org/AcceptInvitation';
import { hasRequiredConsents } from '@/lib/account';
import { auth } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('org.invite'))('title') };
}

export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  // Not signed in (or only a guest): sign in / sign up with the invited address, then come back here.
  if (!session || (session.user as { isAnonymous?: boolean }).isAnonymous) redirect(`/login?next=${encodeURIComponent(`/accept-invitation/${id}`)}`);
  // Joining an organization is using the service: the terms must be accepted first, then we come back here.
  if (!(await hasRequiredConsents(Number(session.user.id)))) redirect(`/consent?next=${encodeURIComponent(`/accept-invitation/${id}`)}`);
  return <AcceptInvitation id={id} />;
}
