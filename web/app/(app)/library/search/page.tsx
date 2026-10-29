import { BookA, BookOpen, FileText, ListChecks, Scale, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KbIndexFrame, KbSearchForm } from '@/components/kb/KbIndex';
import { searchKnowledge, type SearchHit } from '@/lib/kb-library';

type Props = { searchParams: Promise<{ q?: string; kind?: string }> };
const KINDS = ['article', 'template', 'glossary', 'law_section'] as const;
const ICON = { article: BookOpen, guide: ListChecks, template: FileText, glossary: BookA, law_section: Scale } as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('kb'))('searchTitle') };
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const usable = terms.filter((x) => x.length >= 2).sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!usable.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${usable.join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-warning-050 px-0.5 text-inherit">{p}</mark> : p))}</>;
}

export default async function SearchPage({ searchParams }: Props) {
  const [{ q: raw = '', kind }, t] = await Promise.all([searchParams, getTranslations('kb')]);
  const q = raw.trim().slice(0, 200);
  const kinds = KINDS.filter((k) => k === kind);
  const outcome = q ? await searchKnowledge(q, kinds) : null;
  const filterHref = (k?: string) => `/library/search?${new URLSearchParams({ q, ...(k ? { kind: k } : {}) })}`;
  const pill = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-primary-050 font-semibold text-primary-700' : 'border-border hover:bg-surface-2'}`;

  // groups appear in the order of their best hit, so an exact section match leads
  const order = outcome?.ok ? [...new Set(outcome.results.map((r) => r.kind))].filter((k): k is (typeof KINDS)[number] => (KINDS as readonly string[]).includes(k)) : [];
  const groups = outcome?.ok ? order.map((k) => ({ kind: k, hits: outcome.results.filter((r) => r.kind === k) })) : [];
  return (
    <KbIndexFrame title={t('searchTitle')} crumbs={[{ label: t('libraryTitle'), href: '/library' }, { label: t('searchTitle') }]}>
      <KbSearchForm q={q} kind={kinds[0]} />
      {q && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('contentTypes')}>
          <Link href={filterHref()} className={pill(!kinds.length)}>{t('allTypes')}</Link>
          {KINDS.map((k) => <Link key={k} href={filterHref(k)} className={pill(kinds[0] === k)} aria-current={kinds[0] === k ? 'true' : undefined}>{t('kind', { kind: k })}</Link>)}
        </div>
      )}
      {!q && <p className="text-muted">{t('searchHint')}</p>}
      {outcome && !outcome.ok && (
        <p role="alert" className="flex gap-2 rounded-xl border border-warning/40 bg-warning-050 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />{t('searchDown')}
        </p>
      )}
      {outcome?.ok && (
        <>
          {outcome.missingSections.map((s) => (
            <p key={s} role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">{t('sectionMissing', { section: s.split(' ').pop() ?? s })}</p>
          ))}
          {outcome.degraded && <p className="text-xs text-muted">{t('searchDegraded')}</p>}
          {groups.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
              <p>{t('noResults', { q })}</p>
              <Link href={`/chat?q=${encodeURIComponent(q)}`} className="inline-flex h-10 w-fit items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600">{t('askInstead')}</Link>
            </div>
          ) : (
            groups.map((g) => {
              const Icon = ICON[g.kind];
              return (
                <section key={g.kind} className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold"><Icon className="size-[18px] text-primary-700" aria-hidden="true" />{t('kind', { kind: g.kind })}</h2>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                    {g.hits.map((h: SearchHit) => (
                      <li key={h.url}>
                        <Link href={h.url} className="flex flex-col gap-0.5 px-4 py-3.5 hover:bg-surface-2">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{h.title}</span>
                            {h.exact && <span className="rounded-md bg-primary-050 px-1.5 py-0.5 text-xs font-semibold text-primary-700">{t('exactMatch')}</span>}
                            {h.status && h.status !== 'published' && <span className="rounded-md bg-warning-050 px-1.5 py-0.5 text-xs font-semibold text-warning">{t('draftTag')}</span>}
                          </span>
                          {h.heading && <span className="text-xs text-muted">{h.heading}</span>}
                          <span className="text-sm leading-relaxed text-muted"><Highlighted text={h.snippet} terms={outcome.terms} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
          {groups.length > 0 && groups.reduce((n, g) => n + g.hits.length, 0) < 4 && (
            <Link href={`/chat?q=${encodeURIComponent(q)}`} className="text-sm font-semibold text-primary-700 underline underline-offset-2">{t('askInstead')}</Link>
          )}
        </>
      )}
    </KbIndexFrame>
  );
}
