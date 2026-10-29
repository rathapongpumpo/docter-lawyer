'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, selectClass, tableWrap, td, th } from './ui';

type Ev = { id: number; occurred_at: string; stage: string; verdict: string; category: string | null; reason: string | null; latency_ms: number | null; false_positive: boolean };
type Day = { day: string; total: number; blocked: number; flagged: number };

// FR-ADM-015: guardrail decisions and the daily block rate. No user text is stored here — a reviewer flags false positives.
export function AdminGuardrails() {
  const t = useTranslations('admin.guardrails');
  const locale = useLocale();
  const qc = useQueryClient();
  const [verdict, setVerdict] = useState('');
  const { data, isPending } = useQuery({ queryKey: ['admin-guardrails', verdict], queryFn: () => apiFetch<{ events: Ev[]; daily: Day[] }>(`/api/v1/admin/guardrails${verdict ? `?verdict=${verdict}` : ''}`) });
  const when = (iso: string) => new Date(iso).toLocaleString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      <div className="flex flex-wrap gap-2 text-sm">
        {data?.daily.slice(0, 7).map((d) => (
          <div key={d.day} className="rounded-lg border border-border bg-surface px-3 py-1.5"><span className="text-muted">{d.day}</span> · {t('blockRate', { blocked: d.blocked, total: d.total })} ({d.total ? Math.round((d.blocked / d.total) * 100) : 0}%)</div>
        ))}
      </div>
      <select value={verdict} onChange={(e) => setVerdict(e.target.value)} aria-label={t('verdict')} className={`${selectClass} w-fit`}><option value="">{t('all')}</option>{['allowed', 'flagged', 'blocked', 'unavailable', 'quota'].map((v) => <option key={v} value={v}>{t(`verdicts.${v}` as never)}</option>)}</select>
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-surface-2"><tr><th className={th}>{t('time')}</th><th className={th}>{t('stage')}</th><th className={th}>{t('verdict')}</th><th className={th}>{t('category')}</th><th className={th}>{t('reason')}</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-border">
            {isPending && <tr><td className={td} colSpan={6}>…</td></tr>}
            {data?.events.map((e) => (
              <tr key={e.id}>
                <td className={`${td} whitespace-nowrap`}>{when(e.occurred_at)}</td><td className={td}>{e.stage}</td><td className={td}>{t(`verdicts.${e.verdict}` as never)}</td>
                <td className={`${td} font-mono text-xs`}>{e.category ?? '—'}</td><td className={`${td} max-w-xs text-muted`}>{e.reason ?? '—'}</td>
                <td className={td}>
                  {e.verdict === 'blocked' && <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} aria-pressed={e.false_positive} onClick={async () => { await apiFetch(`/api/v1/admin/guardrails/${e.id}`, { method: 'PATCH', body: JSON.stringify({ false_positive: !e.false_positive }) }); await qc.invalidateQueries({ queryKey: ['admin-guardrails'] }); }}>{e.false_positive ? t('unmark') : t('mark')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && data?.events.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
    </AdminPage>
  );
}
