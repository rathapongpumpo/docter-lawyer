'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, inputClass, noticeClass, primaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage } from './ui';

type K = { guests_chat: boolean; all_chat: boolean; uploads: boolean; note: string; changed_at: string | null };

// Kill switch (incident runbook): stop guest chat, all chat or contract uploads without a deploy.
export function AdminSystem() {
  const t = useTranslations('admin.system');
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data } = useQuery({ queryKey: ['admin-system'], queryFn: () => apiFetch<{ kill_switch: K }>('/api/v1/admin/system') });
  const k = data?.kill_switch;
  const active = !!k && (k.guests_chat || k.all_chat || k.uploads);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch('/api/v1/admin/system', { method: 'PUT', body: JSON.stringify({ guests_chat: f.get('guests_chat') === 'on', all_chat: f.get('all_chat') === 'on', uploads: f.get('uploads') === 'on', note: String(f.get('note') ?? '') }) });
      setMsg({ ok: true, text: t('saved') });
      await qc.invalidateQueries({ queryKey: ['admin-system'] });
    } catch { setMsg({ ok: false, text: t('error') }); }
  }
  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      {active && <p role="status" className="max-w-2xl rounded-xl border border-warning/40 bg-warning-050 p-3 text-sm font-semibold">{t('active')}</p>}
      {k && (
        <form key={k.changed_at ?? 'none'} onSubmit={save} className="flex max-w-2xl flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          {(['guests_chat', 'all_chat', 'uploads'] as const).map((name) => (
            <label key={name} className="flex cursor-pointer gap-3 text-sm">
              <input type="checkbox" name={name} defaultChecked={k[name]} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
              <span><span className="font-semibold">{t(`${name}.label`)}</span><span className="block text-muted">{t(`${name}.hint`)}</span></span>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm font-medium">{t('note')}<input name="note" maxLength={200} defaultValue={k.note} className={inputClass} /></label>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
          <div><button type="submit" className={primaryBtn}>{t('save')}</button></div>
        </form>
      )}
    </AdminPage>
  );
}
