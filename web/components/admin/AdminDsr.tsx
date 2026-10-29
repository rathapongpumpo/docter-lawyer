'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, selectClass, tableWrap, td, th } from './ui';

type Req = { id: number; type: string; status: string; channel: string; due_at: string; created_at: string; completed_at: string | null; notes: string | null; email: string | null; handled_by: string | null; due_soon: boolean; overdue: boolean };
const TYPES = ['access', 'export', 'rectify', 'erase', 'object', 'withdraw_consent'] as const;

// FR-ADM-023: data-subject requests with their 30-day clock. Due within 7 days = red flag; every change is audited.
export function AdminDsr() {
  const t = useTranslations('admin.dsr');
  const locale = useLocale();
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isPending } = useQuery({ queryKey: ['admin-dsr', type, status], queryFn: () => apiFetch<{ requests: Req[] }>(`/api/v1/admin/dsr?${new URLSearchParams(Object.entries({ type, status }).filter(([, v]) => v))}`) });
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-dsr'] });

  async function move(r: Req, next: 'in_progress' | 'completed' | 'rejected') {
    let notes: string | undefined;
    if (next === 'rejected') {
      notes = window.prompt(t('rejectPrompt'))?.trim();
      if (!notes) return;
    }
    try { await apiFetch(`/api/v1/admin/dsr/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: next, notes }) }); setMsg({ ok: true, text: t('done') }); await refresh(); } catch { setMsg({ ok: false, text: t('error') }); }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch('/api/v1/admin/dsr', { method: 'POST', body: JSON.stringify({ type: String(f.get('type')), email: String(f.get('email')).trim() || undefined, notes: String(f.get('notes')).trim() || undefined }) });
      setAdding(false);
      setMsg({ ok: true, text: t('added') });
      await refresh();
    } catch { setMsg({ ok: false, text: t('error') }); }
  }
  return (
    <AdminPage title={t('title')} intro={t('intro')} actions={<button type="button" className={secondaryBtn} onClick={() => setAdding((v) => !v)}>{t('add')}</button>}>
      {adding && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3">
          <label className="flex flex-col gap-1 text-sm font-medium">{t('type')}<select name="type" className={selectClass}>{TYPES.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('email')}<input name="email" type="email" className={`${inputClass} w-64`} /></label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">{t('notes')}<input name="notes" maxLength={500} className={inputClass} /></label>
          <button type="submit" className={primaryBtn}>{t('save')}</button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('type')} className={selectClass}><option value="">{t('allTypes')}</option>{TYPES.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('status')} className={selectClass}><option value="">{t('allStatus')}</option>{['received', 'in_progress', 'completed', 'rejected'].map((x) => <option key={x} value={x}>{t(`statuses.${x}` as never)}</option>)}</select>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-surface-2"><tr><th className={th}>{t('type')}</th><th className={th}>{t('requester')}</th><th className={th}>{t('due')}</th><th className={th}>{t('status')}</th><th className={th}>{t('actions')}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {isPending && <tr><td className={td} colSpan={5}>…</td></tr>}
            {data?.requests.map((r) => (
              <tr key={r.id} className={r.due_soon ? 'bg-danger-050' : ''}>
                <td className={td}>{t(`types.${r.type}` as never)}<span className="block text-xs text-muted">{t(`channels.${r.channel}` as never)}</span></td>
                <td className={`${td} text-muted`}>{r.email ?? t('unknownUser')}{r.notes && <span className="block max-w-56 text-xs">{r.notes}</span>}</td>
                <td className={`${td} whitespace-nowrap`}>{day(r.due_at)}{r.overdue ? <b className="ml-1 text-danger">{t('overdue')}</b> : r.due_soon ? <b className="ml-1 text-danger">{t('dueSoon')}</b> : null}</td>
                <td className={td}>{t(`statuses.${r.status}` as never)}{r.handled_by && <span className="block text-xs text-muted">{r.handled_by}</span>}</td>
                <td className={td}>
                  {(r.status === 'received' || r.status === 'in_progress') && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.status === 'received' && <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} onClick={() => void move(r, 'in_progress')}>{t('start')}</button>}
                      <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} onClick={() => void move(r, 'completed')}>{t('complete')}</button>
                      <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs text-danger`} onClick={() => void move(r, 'rejected')}>{t('reject')}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && data?.requests.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
    </AdminPage>
  );
}
