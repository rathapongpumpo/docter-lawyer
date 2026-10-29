'use client';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { cardClass, errorClass, inputClass, noticeClass, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';

type Org = { id: string; name: string; slug: string; status: string; members: number; plan: string; seat_limit: number; chat_daily_per_member: number };

export function AdminOrgs({ orgs }: { orgs: Org[] }) {
  const t = useTranslations('admin.orgs');
  const [msg, setMsg] = useState<{ id: string; ok: boolean } | null>(null);
  async function save(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(`/api/v1/admin/orgs/${id}`, { method: 'PATCH', body: JSON.stringify({
        plan: String(f.get('plan')), seat_limit: Number(f.get('seat_limit')), chat_daily_per_member: Number(f.get('chat')) }) });
      setMsg({ id, ok: true });
    } catch {
      setMsg({ id, ok: false });
    }
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('hint')}</p>
        {orgs.length === 0 && <p className="text-muted">{t('empty')}</p>}
        {orgs.map((o) => (
          <form key={o.id} onSubmit={(e) => void save(e, o.id)} className={cardClass}>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-bold">{o.name}</h2>
              <span className="font-mono text-sm text-muted">{o.slug}</span>
              <span className="text-sm text-muted">{t('members', { n: o.members })}</span>
              {o.status !== 'active' && <span className="rounded-full bg-warning-050 px-2 py-0.5 text-xs text-warning">{o.status}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-medium">{t('plan')}<input name="plan" defaultValue={o.plan} maxLength={40} className={inputClass} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('seats')}<input name="seat_limit" type="number" min={1} max={1000} defaultValue={o.seat_limit} className={inputClass} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('chatDaily')}<input name="chat" type="number" min={1} max={5000} defaultValue={o.chat_daily_per_member} className={inputClass} /></label>
            </div>
            {msg?.id === o.id && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.ok ? t('saved') : t('error')}</p>}
            <div><button type="submit" className={secondaryBtn}>{t('save')}</button></div>
          </form>
        ))}
      </div>
    </div>
  );
}
