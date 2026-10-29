import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { primaryBtn } from '@/components/account/styles';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('notFoundPage'))('title') };
}

// Shown for unknown URLs and for notFound() (also hides pages the visitor may not open), in the visitor's language.
export default async function NotFound() {
  const t = await getTranslations('notFoundPage');
  return (
    <div className="flex min-h-[70dvh] flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-text">
      <p className="font-serif text-5xl font-bold text-primary" aria-hidden="true">404</p>
      <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
      <p className="max-w-md text-muted">{t('text')}</p>
      <Link href="/" className={primaryBtn}>{t('home')}</Link>
    </div>
  );
}
