'use client';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { searchManual, type SearchEntry } from '@/lib/manual-core';

/** Client-side search over task titles, goals and step texts. The index is built on the server and passed in. */
export function ManualSearch({ index }: { index: SearchEntry[] }) {
  const t = useTranslations('manual');
  const id = useId();
  const [q, setQ] = useState('');
  const active = q.trim().length > 0;
  const results = useMemo(() => searchManual(index, q), [index, q]);
  return (
    <div className="flex flex-col gap-3">
      <form role="search" aria-label={t('searchTitle')} onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={`${id}-q`} className="mb-1.5 block text-sm font-semibold">{t('searchLabel')}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={`${id}-q`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={100}
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            placeholder={t('searchPlaceholder')}
            className="h-12 w-full rounded-[10px] border border-border bg-surface pr-3 pl-9 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{t('searchHint')}</p>
      </form>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-muted">
        {active ? (results.length > 0 ? t('searchCount', { count: results.length }) : t('searchNone', { q: q.trim() })) : ''}
      </p>
      {results.length > 0 && (
        <ul aria-label={t('searchResults')} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {results.map((r) => (
            <li key={r.taskId}>
              <Link href={`/manual/${r.roleId}#${r.anchor}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-2">
                <span className="font-semibold">{r.title}</span>
                {r.goal && <span className="text-sm leading-relaxed text-muted">{r.goal}</span>}
                <span className="text-xs text-muted">{t('searchIn', { roles: r.rolesTitles.join(' · ') })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
