'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, selectClass } from './ui';

type A = { id: string; th: string; en: string; level: 'info' | 'warning'; starts_at: string | null; ends_at: string | null };
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

// FR-ADM-022: one banner for everyone, in Thai and English, with an optional time window.
export function AdminAnnouncement() {
  const t = useTranslations('admin.announcement');
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data } = useQuery({ queryKey: ['admin-announcement'], queryFn: () => apiFetch<{ announcement: A | null }>('/api/v1/admin/announcement') });
  const a = data?.announcement;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const iso = (k: string) => (f.get(k) ? new Date(String(f.get(k))).toISOString() : null);
    try {
      await apiFetch('/api/v1/admin/announcement', { method: 'PUT', body: JSON.stringify({ th: String(f.get('th')), en: String(f.get('en')), level: String(f.get('level')), starts_at: iso('starts'), ends_at: iso('ends') }) });
      setMsg({ ok: true, text: t('saved') });
      await qc.invalidateQueries({ queryKey: ['admin-announcement'] });
    } catch { setMsg({ ok: false, text: t('error') }); }
  }
  async function clear() { await apiFetch('/api/v1/admin/announcement', { method: 'DELETE' }); setMsg({ ok: true, text: t('cleared') }); await qc.invalidateQueries({ queryKey: ['admin-announcement'] }); }
  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      <form key={a?.id ?? 'none'} onSubmit={save} className="flex max-w-2xl flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">{t('th')}<textarea name="th" rows={2} maxLength={300} defaultValue={a?.th ?? ''} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">{t('en')}<textarea name="en" rows={2} maxLength={300} defaultValue={a?.en ?? ''} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">{t('level')}<select name="level" defaultValue={a?.level ?? 'info'} className={selectClass}><option value="info">{t('info')}</option><option value="warning">{t('warning')}</option></select></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('starts')}<input type="datetime-local" name="starts" defaultValue={local(a?.starts_at ?? null)} className={inputClass} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('ends')}<input type="datetime-local" name="ends" defaultValue={local(a?.ends_at ?? null)} className={inputClass} /></label>
        </div>
        <p className="text-xs text-muted">{t('hint')}</p>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
        <div className="flex gap-2"><button type="submit" className={primaryBtn}>{t('publish')}</button>{a && <button type="button" className={secondaryBtn} onClick={() => void clear()}>{t('clear')}</button>}</div>
      </form>
    </AdminPage>
  );
}
