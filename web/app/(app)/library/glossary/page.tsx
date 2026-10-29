import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KbIndexFrame } from '@/components/kb/KbIndex';
import { letterOf } from '@/lib/glossary-letters';
import { listGlossary } from '@/lib/kb-library';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('kb'))('glossaryTitle') };
}

export default async function GlossaryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [t, items, { q = '' }] = await Promise.all([getTranslations('kb'), listGlossary(), searchParams]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((g) => `${g.term} ${g.termEn ?? ''} ${g.def}`.toLowerCase().includes(needle)) : items;
  // Postgres already ordered by the Thai collation; keep that order and start a group whenever the letter changes.
  const groups: { letter: string; items: typeof shown }[] = [];
  for (const g of shown) {
    const letter = letterOf(g.term);
    const last = groups[groups.length - 1];
    if (last?.letter === letter) last.items.push(g);
    else groups.push({ letter, items: [g] });
  }
  return (
    <KbIndexFrame title={t('glossaryTitle')} intro={t('glossaryIntro')} crumbs={[{ label: t('libraryTitle'), href: '/library' }, { label: t('glossaryTitle') }]}>
      <form method="get" role="search" className="flex gap-2">
        <input type="search" name="q" defaultValue={q} maxLength={80} aria-label={t('glossarySearch')} placeholder={t('glossarySearch')}
          className="h-11 flex-1 rounded-[10px] border border-border bg-surface px-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button type="submit" className="h-11 rounded-[10px] bg-primary px-4 font-semibold text-white hover:bg-primary-600">{t('searchButton')}</button>
      </form>
      {groups.length > 1 && (
        <nav aria-label={t('glossaryLetters')} className="flex flex-wrap gap-1.5">
          {groups.map((g) => <a key={g.letter} href={`#g-${g.letter}`} className="inline-flex size-8 items-center justify-center rounded-md border border-border text-sm hover:bg-surface-2">{g.letter}</a>)}
        </nav>
      )}
      {shown.length === 0 && <p className="text-muted">{t('empty')}</p>}
      {groups.map((g) => (
        <section key={g.letter} id={`g-${g.letter}`} className="flex scroll-mt-4 flex-col gap-2">
          <h2 className="font-serif text-lg font-bold text-primary-700">{g.letter}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {g.items.map((item) => (
              <li key={item.slug}>
                <Link href={`/library/glossary/${item.slug}`} className="flex flex-col gap-0.5 px-4 py-3.5 hover:bg-surface-2">
                  <span className="flex flex-wrap items-baseline gap-2"><span className="font-semibold">{item.term}</span>{item.termEn && <span className="text-xs text-muted">{item.termEn}</span>}</span>
                  <span className="text-sm text-muted">{item.def}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </KbIndexFrame>
  );
}
