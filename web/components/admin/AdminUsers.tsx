'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { useDismiss } from '@/lib/client/use-dismiss';
import { AdminPage, selectClass, tableWrap, td, th } from './ui';

type User = { id: number; email: string; name: string; role: string; status: string; banned: boolean; ban_reason: string | null; two_factor_enabled: boolean; email_verified: boolean; last_login_at: string | null; created_at: string; locked: boolean };
type Act = 'set_role' | 'suspend' | 'unsuspend' | 'force_logout' | 'reset_quota' | 'unlock';
const ROLES = ['member', 'editor', 'reviewer', 'admin'] as const;

// FR-ADM-017: find accounts, change role, suspend / restore, sign out everywhere, reset today's quota. Every action needs a written reason.
export function AdminUsers({ meId }: { meId: number }) {
  const t = useTranslations('admin.users');
  const locale = useLocale();
  const qc = useQueryClient();
  const dialogBox = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<{ user: User; action: Act; role?: string } | null>(null);
  useDismiss(() => setPending(null), { active: !!pending, containerRef: dialogBox });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ['admin-users', q, role, status],
    queryFn: () => apiFetch<{ users: User[] }>(`/api/v1/admin/users?${new URLSearchParams(Object.entries({ q, role, status }).filter(([, v]) => v)).toString()}`),
  });
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' }) : '—');

  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending) return;
    const reason = String(new FormData(e.currentTarget).get('reason')).trim();
    try {
      await apiFetch(`/api/v1/admin/users/${pending.user.id}`, { method: 'PATCH', body: JSON.stringify({ action: pending.action, role: pending.role, reason }) });
      setMsg({ ok: true, text: t('done') });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      const code = (err as Error).message;
      setMsg({ ok: false, text: code === 'conflict' ? t('conflict') : t('error') });
    }
    setPending(null);
  }

  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} className={`${inputClass} max-w-xs`} />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('role')} className={selectClass}><option value="">{t('allRoles')}</option>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('status')} className={selectClass}><option value="">{t('allStatus')}</option>{['active', 'suspended', 'pending_verification', 'pending_deletion'].map((s) => <option key={s} value={s}>{t(`statuses.${s}` as never)}</option>)}</select>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2"><tr><th className={th}>{t('user')}</th><th className={th}>{t('role')}</th><th className={th}>{t('status')}</th><th className={th}>{t('lastLogin')}</th><th className={th}>{t('actions')}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {isPending && <tr><td className={td} colSpan={5}>…</td></tr>}
            {data?.users.map((u) => (
              <tr key={u.id}>
                <td className={td}><span className="block font-medium">{u.name}</span><span className="block text-muted">{u.email}</span>{u.role !== 'member' && !u.two_factor_enabled && <span className="text-xs text-warning">{t('no2fa')}</span>}</td>
                <td className={td}>
                  <select value={u.role} disabled={u.id === meId} aria-label={t('roleOf', { name: u.name })} onChange={(e) => setPending({ user: u, action: 'set_role', role: e.target.value })} className={selectClass}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
                </td>
                <td className={td}>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${u.status === 'active' ? 'bg-success-050 text-success' : 'bg-warning-050 text-warning'}`}>{t(`statuses.${u.status}` as never)}</span>
                  {u.locked && <span className="ml-1 text-xs text-danger">{t('locked')}</span>}
                  {u.ban_reason && <span className="mt-1 block max-w-48 truncate text-xs text-muted" title={u.ban_reason}>{u.ban_reason}</span>}
                </td>
                <td className={`${td} whitespace-nowrap text-muted`}>{date(u.last_login_at)}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1.5">
                    {u.banned ? <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} onClick={() => setPending({ user: u, action: 'unsuspend' })}>{t('unsuspend')}</button>
                      : u.id !== meId && <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs text-danger`} onClick={() => setPending({ user: u, action: 'suspend' })}>{t('suspend')}</button>}
                    <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} onClick={() => setPending({ user: u, action: 'force_logout' })}>{t('forceLogout')}</button>
                    <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} onClick={() => setPending({ user: u, action: 'reset_quota' })}>{t('resetQuota')}</button>
                    {u.locked && <button type="button" className={`${secondaryBtn} !h-8 !px-3 text-xs`} onClick={() => setPending({ user: u, action: 'unlock' })}>{t('unlock')}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending && (
        <form onSubmit={run} role="dialog" aria-modal="true" aria-label={t('reasonTitle')} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div ref={dialogBox} className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-surface p-5 shadow-lg">
            <h2 className="text-lg font-bold">{(t as unknown as (k: string, v: Record<string, string>) => string)(`confirm.${pending.action}`, { name: pending.user.name, role: pending.role ? t(`roles.${pending.role}` as never) : '' })}</h2>
            {pending.action === 'set_role' && pending.role !== 'member' && <p className="text-sm text-warning">{t('staffNote')}</p>}
            <label className="flex flex-col gap-1 text-sm font-medium">{t('reason')}<textarea name="reason" required minLength={5} maxLength={200} rows={3} className="rounded-lg border border-border-strong bg-surface p-2 text-sm font-normal" /></label>
            <p className="text-xs text-muted">{t('reasonHint')}</p>
            <div className="flex justify-end gap-2"><button type="button" className={secondaryBtn} onClick={() => setPending(null)}>{t('cancel')}</button><button type="submit" className={primaryBtn}>{t('confirmButton')}</button></div>
          </div>
        </form>
      )}
    </AdminPage>
  );
}
