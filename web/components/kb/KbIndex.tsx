import { BookOpen, ChevronRight, FileText, ListChecks, Search } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { KbListItem } from '@/lib/kb';

const ICON = { article: BookOpen, guide: ListChecks, template: FileText } as const;

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            {c.href ? <Link href={c.href} className="hover:text-text hover:underline">{c.label}</Link> : <span aria-current="page" className="text-text">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** GET form to /library/search — works without JavaScript. */
export async function KbSearchForm({ q = '', kind }: { q?: string; kind?: string }) {
  const t = await getTranslations('kb');
  return (
    <form action="/library/search" method="get" role="search" className="flex gap-2">
      {kind && <input type="hidden" name="kind" value={kind} />}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input type="search" name="q" defaultValue={q} maxLength={200} aria-label={t('searchLabel')} placeholder={t('searchPlaceholder')}
          className="h-11 w-full rounded-[10px] border border-border bg-surface pr-3 pl-9 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <button type="submit" className="h-11 rounded-[10px] bg-primary px-4 font-semibold text-white hover:bg-primary-600">{t('searchButton')}</button>
    </form>
  );
}

/** Page frame for /library, /guides, /templates listings. */
export async function KbIndexFrame({ title, intro, children, crumbs, wide }: { title: string; intro?: string; children: ReactNode; crumbs?: Crumb[]; wide?: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('kb'), getLocale()]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} flex-col gap-6 px-4 py-8 sm:px-6`}>
        {crumbs && <Breadcrumbs items={crumbs} label={t('breadcrumb')} />}
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-[1.75rem] leading-tight font-bold text-navy dark:text-text">{title}</h1>
          {intro && <p className="max-w-[60ch] text-muted">{intro}</p>}
          {locale !== 'th' && <p className="text-sm text-muted">{t('thaiOnly')}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}

export async function KbList({ kind, items, heading }: { kind: keyof typeof ICON; items: KbListItem[]; heading?: string }) {
  const t = await getTranslations('kb');
  const Icon = ICON[kind];
  const base = kind === 'article' ? '/library/articles/' : kind === 'guide' ? '/guides/' : '/templates/';
  return (
    <section className="flex flex-col gap-2">
      {heading && <h2 className="text-lg font-bold">{heading}</h2>}
      {items.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.slug}>
              <Link href={`${base}${item.slug}`} className="flex gap-3 px-4 py-3.5 hover:bg-surface-2">
                <Icon className="mt-1 size-[18px] shrink-0 text-primary-700" aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.title}</span>
                    {item.status !== 'published' && (
                      <span className="rounded-md bg-warning-050 px-1.5 py-0.5 text-xs font-semibold text-warning">
                        {t('draftTag')}
                      </span>
                    )}
                  </span>
                  {item.summary && <span className="text-sm leading-relaxed text-muted">{item.summary}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
