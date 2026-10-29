'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { inputClass, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, tableWrap, td, th } from './ui';

type Row = { id: number; occurred_at: string; actor_user_id: number | null; actor_name: string | null; actor_role: string | null; action: string; target_type: string | null; target_id: string | null; ip_hash: string | null; meta: Record<string, unknown> };
type Page = { rows: Row[]; next_before: number | null };

// FR-ADM-018: the system audit log. Read-only — no screen or API changes or deletes an entry.
export function AdminAudit() {
  const t = useTranslations('admin.audit');
  const tOrg = useTranslations('org.audit');
  const locale = useLocale();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  // Friendly label for the known events; the technical name stays visible below it (it is what the filter matches on).
  const label = (a: string) => {
    const k = `actions.${a.replaceAll('.', '_')}`;
    return t.has(k as never) ? t(k as never) : tOrg.has(k as never) ? tOrg(k as never) : null;
  };
  const qs = (extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ from, to, action, actor, ...extra }).filter(([, v]) => v)).toString();
  const { data, fetchNextPage, hasNextPage, isPending } = useInfiniteQuery({
    queryKey: ['admin-audit', from, to, action, actor],
    initialPageParam: '',
    queryFn: ({ pageParam }) => apiFetch<Page>(`/api/v1/admin/audit?${qs(pageParam ? { before: pageParam } : {})}`),
    getNextPageParam: (last) => (last.next_before ? String(last.next_before) : undefined),
  });
  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Bangkok' });
  return (
    <AdminPage title={t('title')} intro={t('intro')} actions={<a href={`/api/v1/admin/audit?${qs({ format: 'csv' })}`} download className={secondaryBtn}><Download className="size-4" aria-hidden="true" />{t('export')}</a>}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">{t('from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} w-40`} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">{t('to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-40`} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">{t('action')}<input value={action} onChange={(e) => setAction(e.target.value.toLowerCase())} placeholder="auth.login" className={`${inputClass} w-48`} /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">{t('actor')}<input value={actor} onChange={(e) => setActor(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="id" className={`${inputClass} w-28`} /></label>
      </div>
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-surface-2"><tr><th className={th}>{t('time')}</th><th className={th}>{t('actorCol')}</th><th className={th}>{t('actionCol')}</th><th className={th}>{t('target')}</th><th className={th}>{t('detail')}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap`}>{when(r.occurred_at)}</td>
                <td className={td}>{r.actor_name ?? '—'}{r.actor_role ? <span className="ml-1 text-xs text-muted">({r.actor_role})</span> : null}</td>
                <td className={td}>{label(r.action) ?? r.action}{label(r.action) ? <span className="block font-mono text-xs text-muted">{r.action}</span> : null}</td>
                <td className={`${td} text-muted`}>{r.target_type ? `${r.target_type}${r.target_id ? ` #${r.target_id.slice(0, 12)}` : ''}` : '—'}</td>
                <td className={`${td} max-w-md font-mono text-xs break-words text-muted`}>{Object.entries(r.meta).map(([k, v]) => `${k}=${String(v)}`).join(' ')}{r.ip_hash ? ` ip#${r.ip_hash}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && rows.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
      {hasNextPage && <div><button type="button" className={secondaryBtn} onClick={() => void fetchNextPage()}>{t('more')}</button></div>}
    </AdminPage>
  );
}
