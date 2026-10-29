import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ConsentForm } from '@/components/auth/ConsentForm';
import { hasRequiredConsents } from '@/lib/account';
import { auth } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('consentTitle') };
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const { next } = await searchParams;
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
  if (await hasRequiredConsents(Number(session.user.id))) redirect(target);
  return <ConsentForm next={target} />;
}
