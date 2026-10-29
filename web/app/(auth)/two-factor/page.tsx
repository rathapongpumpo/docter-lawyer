import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TwoFactorForm } from '@/components/auth/TwoFactorForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('twoFactorTitle') };
}

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
  return <TwoFactorForm next={target} />;
}
