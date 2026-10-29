'use client';
import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useDismiss } from '@/lib/client/use-dismiss';
import { StatuteText } from '@/components/law/StatuteText';
import type { Citation } from '@/lib/sse';

// "แหล่งอ้างอิง" panel (docs/03-technical-spec.md §5.3 right panel, rp-sources): drawer on desktop, bottom sheet on mobile.
export function SourcePanel({ citations, active, onClose }: { citations: Citation[]; active: number; onClose: () => void }) {
  const t = useTranslations('chat');
  const tk = useTranslations('kb');
  const format = useFormatter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useDismiss(onClose); // declared first: it remembers the opener (the citation chip) before focus moves to the close button
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-n="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00+07:00`), { dateStyle: 'medium' });

  return (
    <>
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={onClose} className="fixed inset-0 z-40 bg-black/30 md:bg-transparent" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('sourcesTitle')}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border border-border bg-surface shadow-xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[400px] md:rounded-none md:border-y-0 md:border-r-0"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-[0.9375rem] font-semibold">{t('sourcesTitle')}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('closeSources')}
            className="flex size-9 items-center justify-center rounded-lg hover:bg-surface-2"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ol ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {citations.map((c) => (
            <li
              key={c.n}
              data-n={c.n}
              className={`flex flex-col gap-2 rounded-xl border p-3.5 ${c.n === active ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-050 text-xs font-bold text-primary-700">
                  {c.n}
                </span>
                <span className="text-xs text-muted">{t('kind', { kind: c.kind })}</span>
              </div>
              <p className="text-sm font-semibold">{c.title}</p>
              {c.snippet &&
                (c.kind === 'law_section' ? (
                  <StatuteText compact body={c.snippet} paragraphLabel={(n) => tk('paragraph', { n: String(n) })} />
                ) : (
                  <p className="text-[0.875rem] leading-relaxed text-muted">{c.snippet}</p>
                ))}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{t('asOf', { date: date(c.as_of) })}</span>
                {c.effective_from && <span>{t('effectiveFrom', { date: date(c.effective_from) })}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={c.url} className="inline-flex h-8 items-center rounded-lg bg-primary-050 px-3 text-xs font-semibold text-primary-700 hover:bg-primary/15">
                  {t('openFull')}
                </Link>
                {c.official_url && (
                  <a
                    href={c.official_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-surface-2"
                  >
                    {t('official')}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
