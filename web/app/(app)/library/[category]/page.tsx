import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { KbIndexFrame, KbList, KbSearchForm } from '@/components/kb/KbIndex';
import { getCategoryPage, LEVELS, type Level, type Locale } from '@/lib/kb-library';

type Props = { params: Promise<{ category: string }>; searchParams: Promise<{ tab?: string; level?: string; sub?: string }> };
const TABS = ['article', 'law', 'template', 'glossary'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ category }, locale] = await Promise.all([params, getLocale()]);
  const cat = /^[A-Z]+(\.[A-Z0-9_]+)*$/.test(category) ? await getCategoryPage(category, locale as Locale) : null;
  return { title: cat?.name ?? (await getTranslations('kb'))('libraryTitle') };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ category }, q, t, locale] = await Promise.all([params, searchParams, getTranslations('kb'), getLocale()]);
  if (!/^[A-Z]+(\.[A-Z0-9_]+)*$/.test(category)) notFound();
  const level = LEVELS.includes(q.level as Level) ? (q.level as Level) : undefined;
  const cat = await getCategoryPage(category, locale as Locale, level, q.sub);
  if (!cat) notFound();

  const counts: Record<Tab, number> = { article: cat.articles.length, law: cat.laws.length, template: cat.templates.length, glossary: cat.glossary.length };
  const tab: Tab = TABS.includes(q.tab as Tab) ? (q.tab as Tab) : (TABS.find((k) => counts[k] > 0) ?? 'article');
  const href = (over: Record<string, string | undefined>) => {
    const merged = { tab, level: level as string | undefined, sub: q.sub, ...over };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]).toString();
    return `/library/${cat.code}${qs ? `?${qs}` : ''}`;
  };
  const pill = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-primary-050 font-semibold text-primary-700' : 'border-border hover:bg-surface-2'}`;

  return (
    <KbIndexFrame
      title={cat.name}
      intro={cat.description ?? undefined}
      crumbs={[{ label: t('libraryTitle'), href: '/library' }, ...(cat.parent ? [{ label: cat.parent.name, href: `/library/${cat.parent.code}` }] : []), { label: cat.name }]}
    >
      <KbSearchForm />
      {cat.children.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('subcategories')}>
          <Link href={href({ sub: undefined })} className={pill(!q.sub)} aria-current={!q.sub ? 'true' : undefined}>{t('allSub')}</Link>
          {cat.children.map((c) => (
            <Link key={c.code} href={href({ sub: c.code })} className={pill(q.sub === c.code)} aria-current={q.sub === c.code ? 'true' : undefined}>{c.name}</Link>
          ))}
        </div>
      )}
      <div role="tablist" aria-label={t('contentTypes')} className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((k) => (
          <Link key={k} role="tab" aria-selected={tab === k} href={href({ tab: k })} className={pill(tab === k)}>
            {t('tab', { kind: k })} <span className="text-muted">{counts[k]}</span>
          </Link>
        ))}
      </div>
      {tab === 'article' && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('levelLabel')}>
          <Link href={href({ level: undefined })} className={pill(!level)}>{t('allLevels')}</Link>
          {LEVELS.map((l) => <Link key={l} href={href({ level: l })} className={pill(level === l)} aria-current={level === l ? 'true' : undefined}>{t('level', { level: l })}</Link>)}
        </div>
      )}
      <div role="tabpanel">
        {tab === 'article' && <KbList kind="article" items={cat.articles.map((a) => ({ ...a, category: null }))} />}
        {tab === 'template' && <KbList kind="template" items={cat.templates.map((a) => ({ ...a, category: null }))} />}
        {tab === 'law' && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {cat.laws.map((l) => (
              <li key={l.code}>
                <Link href={`/law/${l.code}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5 hover:bg-surface-2">
                  <span className="font-semibold">{l.title}</span>
                  <span className="text-xs text-muted">{t('sectionCount', { count: l.sections })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {tab === 'glossary' && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {cat.glossary.map((g) => (
              <li key={g.slug}>
                <Link href={`/library/glossary/${g.slug}`} className="flex flex-col gap-0.5 px-4 py-3.5 hover:bg-surface-2">
                  <span className="font-semibold">{g.term}</span>
                  <span className="text-sm text-muted">{g.def}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </KbIndexFrame>
  );
}
