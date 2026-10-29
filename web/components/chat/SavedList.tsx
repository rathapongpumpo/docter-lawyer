'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Pin, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { cardClass } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';

type Item = { id: number; item_type: string; item_id: string; title: string; is_pinned: boolean; created_at: string; chat_id: string | null };
const HREF: Record<string, (i: Item) => string | null> = {
  message: (i) => (i.chat_id ? `/chat/${i.chat_id}#msg-${i.item_id}` : null),
  article: (i) => `/library/articles/${i.item_id}`,
  guide: (i) => `/guides/${i.item_id}`,
  template: (i) => `/templates/${i.item_id}`,
  law_section: (i) => `/law/${i.item_id}`,
  glossary: (i) => `/library/glossary/${i.item_id}`,
};

// The "Saved" page (FR-CHAT-034): saved answers and knowledge items, searchable, pinnable, renameable, removable.
export function SavedList() {
  const t = useTranslations('saved');
  const locale = useLocale();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const { data, isPending } = useQuery({ queryKey: ['saved', q], queryFn: () => apiFetch<{ items: Item[] }>(`/api/v1/bookmarks${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['saved'] });
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const items = data?.items ?? [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        <label className="flex h-11 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3 text-muted">
          <Search className="size-4" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} placeholder={t('search')} className="w-full bg-transparent text-text outline-none" />
        </label>
        <section className={cardClass}>
          {isPending ? <p className="text-muted">…</p> : items.length === 0 ? <p className="text-muted">{q ? t('noMatch') : t('empty')}</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {items.map((i) => {
                const href = HREF[i.item_type]?.(i) ?? null;
                return (
                  <li key={i.id} className="flex items-center gap-2 py-3">
                    <Bookmark className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      {editing === i.id ? (
                        <form onSubmit={async (e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('title')).trim(); setEditing(null); if (v) { await apiFetch(`/api/v1/bookmarks/${i.id}`, { method: 'PATCH', body: JSON.stringify({ title: v }) }); await refresh(); } }}>
                          <input name="title" defaultValue={i.title} autoFocus maxLength={200} aria-label={t('rename')} onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} className="h-9 w-full rounded-md border border-primary bg-surface px-2 outline-none" />
                        </form>
                      ) : href ? <Link href={href} className="block truncate font-medium hover:underline">{i.title}</Link> : <span className="block truncate font-medium">{i.title}</span>}
                      <span className="block text-xs text-muted">{t(`type.${i.item_type}` as never)} · {date(i.created_at)}</span>
                    </span>
                    <button type="button" aria-pressed={i.is_pinned} aria-label={i.is_pinned ? t('unpin') : t('pin')} onClick={async () => { await apiFetch(`/api/v1/bookmarks/${i.id}`, { method: 'PATCH', body: JSON.stringify({ is_pinned: !i.is_pinned }) }); await refresh(); }} className={`flex size-9 items-center justify-center rounded-lg hover:bg-surface-2 ${i.is_pinned ? 'text-primary-700' : 'text-muted'}`}><Pin className="size-4" aria-hidden="true" /></button>
                    <button type="button" onClick={() => setEditing(i.id)} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2">{t('rename')}</button>
                    <button type="button" aria-label={t('remove')} onClick={async () => { await apiFetch(`/api/v1/bookmarks/${i.id}`, { method: 'DELETE' }); await refresh(); }} className="flex size-9 items-center justify-center rounded-lg text-danger hover:bg-danger-050"><Trash2 className="size-4" aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
