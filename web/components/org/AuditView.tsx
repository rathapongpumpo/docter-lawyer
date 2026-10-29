'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { cardClass, inputClass, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';

type Row = { id: number; occurred_at: string; actor_name: string | null; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown> };
type Page = { rows: Row[]; next_before: number | null };
const GROUPS = ['org.member', 'org.role', 'org.invitation', 'org.counsel', 'org.chat', 'org.contract', 'org.settings', 'org.audit', 'org.deletion'] as const;

export function AuditView({ orgId }: { orgId: string }) {
  const t = useTranslations('org.audit');
  const locale = useLocale();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const qs = (extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ from, to, action, ...extra }).filter(([, v]) => v)).toString();
  const { data, fetchNextPage, hasNextPage, isPending } = useInfiniteQuery({
    queryKey: ['org-audit', orgId, from, to, action],
    initialPageParam: '',
    queryFn: ({ pageParam }) => apiFetch<Page>(`/api/v1/orgs/${orgId}/audit?${qs(pageParam ? { before: pageParam } : {})}`),
    getNextPageParam: (last) => (last.next_before ? String(last.next_before) : undefined),
  });
  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  const label = (a: string) => { const k = `actions.${a.replaceAll('.', '_')}`; return t.has(k as never) ? t(k as never) : a; };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <h1 className="mr-auto font-serif text-2xl font-bold">{t('title')}</h1>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} w-40`} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-40`} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('type')}
            <select value={action} onChange={(e) => setAction(e.target.value)} className="h-11 rounded-[10px] border border-border-strong bg-surface px-2">
              <option value="">{t('all')}</option>
              {GROUPS.map((g) => <option key={g} value={g}>{t(`groups.${g.replace('org.', '')}` as never)}</option>)}
            </select>
          </label>
          <a href={`/api/v1/orgs/${orgId}/audit?${qs({ format: 'csv' })}`} download className={secondaryBtn}><Download className="size-4" aria-hidden="true" />{t('export')}</a>
        </div>
        <section className={`${cardClass} overflow-x-auto`} tabIndex={0}>
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-muted"><th className="py-1 font-medium">{t('time')}</th><th className="py-1 font-medium">{t('actor')}</th><th className="py-1 font-medium">{t('event')}</th><th className="py-1 font-medium">{t('detail')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{when(r.occurred_at)}</td>
                  <td className="py-2 pr-3">{r.actor_name ?? '—'}</td>
                  <td className="py-2 pr-3">{label(r.action)}</td>
                  <td className="py-2 font-mono text-xs text-muted">{Object.entries(r.meta).filter(([k]) => k !== 'org_id').map(([k, v]) => `${k}=${String(v)}`).join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isPending && rows.length === 0 && <p className="py-4 text-muted">{t('empty')}</p>}
          {hasNextPage && <div><button type="button" className={secondaryBtn} onClick={() => void fetchNextPage()}>{t('more')}</button></div>}
          <p className="text-xs text-muted">{t('note')}</p>
        </section>
      </div>
    </div>
  );
}
