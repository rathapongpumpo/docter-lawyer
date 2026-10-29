'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, selectClass, tableWrap, td, th } from './ui';

type Item = { id: number; reasons: string[]; comment: string | null; allow_review: boolean; review_state: string; root_cause: string | null; created_at: string; verification_status: string | null; org_chat: boolean };
const REASONS = ['incorrect', 'incomplete', 'hard_to_understand', 'off_topic', 'outdated', 'missing_citation', 'unsafe', 'other'];

// FR-ADM-011: answers a member marked 👎. The list shows reasons and the masked comment only.
export function AdminFeedback() {
  const t = useTranslations('admin.feedback');
  const tr = useTranslations('chat.feedback.reason');
  const locale = useLocale();
  const [state, setState] = useState('open');
  const [reason, setReason] = useState('');
  const { data, isPending } = useQuery({ queryKey: ['admin-feedback', state, reason], queryFn: () => apiFetch<{ items: Item[] }>(`/api/v1/admin/feedback?${new URLSearchParams(Object.entries({ state, reason }).filter(([, v]) => v))}`) });
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      <div className="flex flex-wrap gap-2">
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label={t('state')} className={selectClass}><option value="">{t('allStates')}</option>{['open', 'triaged', 'resolved', 'wont_fix'].map((s) => <option key={s} value={s}>{t(`states.${s}` as never)}</option>)}</select>
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('reason')} className={selectClass}><option value="">{t('allReasons')}</option>{REASONS.map((r) => <option key={r} value={r}>{tr(r as never)}</option>)}</select>
      </div>
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2"><tr><th className={th}>{t('date')}</th><th className={th}>{t('reasons')}</th><th className={th}>{t('comment')}</th><th className={th}>{t('verification')}</th><th className={th}>{t('state')}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {isPending && <tr><td className={td} colSpan={5}>…</td></tr>}
            {data?.items.map((i) => (
              <tr key={i.id} className="hover:bg-surface-2">
                <td className={`${td} whitespace-nowrap`}><Link href={`/admin/feedback/${i.id}`} className="font-medium text-primary-700 hover:underline">{day(i.created_at)} #{i.id}</Link></td>
                <td className={td}>{i.reasons.map((r) => tr(r as never)).join(', ') || '—'}</td>
                <td className={`${td} max-w-xs text-muted`}>{i.comment ?? '—'}<span className="mt-0.5 block text-xs">{i.org_chat ? t('orgChat') : i.allow_review ? t('allowed') : t('notAllowed')}</span></td>
                <td className={`${td} text-muted`}>{i.verification_status ?? '—'}</td>
                <td className={td}>{t(`states.${i.review_state}` as never)}{i.root_cause ? <span className="block text-xs text-muted">{t(`causes.${i.root_cause}` as never)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && data?.items.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
    </AdminPage>
  );
}
