import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SavedList } from '@/components/chat/SavedList';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('saved'))('title') };
}

export default async function SavedPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations('saved');
  if (roleOf(session) === 'guest') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted">{t('guestOnly')}</p>
        <Link href="/register" className="inline-flex h-11 w-fit items-center rounded-[10px] bg-primary px-5 font-semibold text-white hover:bg-primary-600">{t('register')}</Link>
      </div>
    );
  }
  return <SavedList />;
}
