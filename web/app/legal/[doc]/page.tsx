import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LogoMark } from '@/components/brand/Logo';
import { LanguageSwitch, ThemeSwitch } from '@/components/shell/PreferenceControls';
import { LEGAL_VERSIONS } from '@/lib/legal';

const DOCS = { terms: 'service_terms', privacy: 'privacy_notice' } as const;
type Doc = keyof typeof DOCS;
const isDoc = (v: string): v is Doc => v in DOCS;

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  if (!isDoc(doc)) return {};
  return { title: (await getTranslations('legal'))(`${doc}.title`) };
}

// Public, readable without an account (linked from sign-up and the consent gate).
export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isDoc(doc)) notFound();
  const t = await getTranslations('legal');
  const sections = t.raw(`${doc}.sections`) as { title: string; body: string }[];
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-serif text-lg font-bold">
          <LogoMark size={28} />
          {(await getTranslations('app'))('name')}
        </Link>
        <div className="flex-1" />
        <ThemeSwitch />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('back')}
        </Link>
        <h1 className="font-serif text-3xl font-bold">{t(`${doc}.title`)}</h1>
        <p role="note" className="rounded-lg bg-warning-050 px-4 py-3 text-sm leading-relaxed text-warning">{t('draftNotice')}</p>
        <p className="text-sm text-muted">{t('version', { version: LEGAL_VERSIONS[DOCS[doc]] })}</p>
        {sections.map((s, i) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{i + 1}. {s.title}</h2>
            <p className="leading-relaxed whitespace-pre-line">{s.body.replace('{guestHours}', process.env.GUEST_RETENTION_HOURS ?? '24').replace('{graceDays}', process.env.ACCOUNT_DELETION_GRACE_DAYS ?? '30')}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
