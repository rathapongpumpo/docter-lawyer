import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { KbIndexFrame } from '@/components/kb/KbIndex';
import { listLawIndex, type LawListItem } from '@/lib/kb-library';
import { toArabic } from '@/lib/kb-refs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('kb'))('statutes') };
}

const norm = (s: string) => toArabic(s).toLowerCase().replace(/[\s.]/g, '');
const TYPE_ORDER = ['constitution', 'code', 'act', 'emergency_decree', 'royal_decree', 'ministerial_regulation'];

// /law — every statute in the library, grouped by type, searchable by name or abbreviation ("ปพพ" = "ป.พ.พ.") (FR-KB-005).
export default async function LawIndexPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [t, format, all, { q = '' }] = await Promise.all([getTranslations('kb'), getFormatter(), listLawIndex(), searchParams]);
  const needle = norm(q.trim());
  const laws = needle
    ? all.filter((l) => [l.title, l.shortName, ...l.aliases, l.code].some((x) => norm(x).includes(needle)))
    : all;
  const byType = new Map<string, LawListItem[]>();
  for (const l of laws) byType.set(l.type, [...(byType.get(l.type) ?? []), l]);
  const types = [...byType.keys()].sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00+07:00`), { dateStyle: 'medium' });
  return (
    <KbIndexFrame title={t('statutes')} intro={t('statutesIntro')} crumbs={[{ label: t('libraryTitle'), href: '/library' }, { label: t('statutes') }]}>
      <form method="get" role="search" className="flex gap-2">
        <input type="search" name="q" defaultValue={q} maxLength={80} aria-label={t('lawSearch')} placeholder={t('lawSearch')}
          className="h-11 flex-1 rounded-[10px] border border-border bg-surface px-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button type="submit" className="h-11 rounded-[10px] bg-primary px-4 font-semibold text-white hover:bg-primary-600">{t('searchButton')}</button>
      </form>
      {laws.length === 0 && <p className="text-muted">{t('empty')}</p>}
      {types.map((type) => (
        <section key={type} className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('lawType', { type })}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {byType.get(type)!.map((l) => (
              <li key={l.code}>
                <Link href={`/law/${l.code}`} className="flex flex-col gap-1 px-4 py-3.5 hover:bg-surface-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{l.title}</span>
                    {l.status !== 'published' && <span className="rounded-md bg-warning-050 px-1.5 py-0.5 text-xs font-semibold text-warning">{t('draftTag')}</span>}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>{l.shortName}</span>
                    {l.yearBe && <span>{t('yearBe', { year: l.yearBe })}</span>}
                    <span>{t('sectionCount', { count: l.sections })}</span>
                    {l.updated && <span>{t('asOf', { date: date(l.updated) })}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </KbIndexFrame>
  );
}
