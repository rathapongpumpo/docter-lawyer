import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { categoryIcon } from '@/components/kb/category-icons';
import { KbIndexFrame, KbSearchForm } from '@/components/kb/KbIndex';
import { listCategoryCards, type Locale } from '@/lib/kb-library';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('kb'))('libraryTitle') };
}

export default async function LibraryPage() {
  const [t, locale] = await Promise.all([getTranslations('kb'), getLocale()]);
  const cards = await listCategoryCards(locale as Locale);
  return (
    <KbIndexFrame title={t('libraryTitle')} intro={t('libraryIntro')} wide>
      <KbSearchForm />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/law" className="rounded-full border border-border px-3 py-1 hover:bg-surface-2">{t('statutes')}</Link>
        <Link href="/library/glossary" className="rounded-full border border-border px-3 py-1 hover:bg-surface-2">{t('glossaryTitle')}</Link>
        <Link href="/templates" className="rounded-full border border-border px-3 py-1 hover:bg-surface-2">{t('templatesTitle')}</Link>
      </div>
      {cards.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = categoryIcon(c.code);
            return (
              <li key={c.code}>
                <Link href={`/library/${c.code}`} className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 hover:border-primary/50 hover:bg-surface-2">
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-050 text-primary-700"><Icon className="size-5" aria-hidden="true" /></span>
                    <span className="font-serif text-[1.0625rem] leading-snug font-bold">{c.name}</span>
                  </span>
                  {c.description && <span className="text-sm text-muted">{c.description}</span>}
                  <span className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-xs text-muted">
                    {(['article', 'law', 'template', 'glossary'] as const).filter((k) => c.counts[k] > 0).map((k) => (
                      <span key={k}>{t('count', { kind: k, count: c.counts[k] })}</span>
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </KbIndexFrame>
  );
}
