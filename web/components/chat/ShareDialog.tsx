'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, Link2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { PasswordInput } from '@/components/account/PasswordInput';
import { errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { useDismiss } from '@/lib/client/use-dismiss';

type Shares = { shares: { id: number; created_at: string; expires_at: string | null; has_password: boolean; view_count: number }[]; pii: { id_card: number; phone: number }; default_days: number; max_days: number };

// Public read-only links (FR-CHAT-026): warns before publishing, shows the link once, lists and revokes existing ones.
export function ShareDialog({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const t = useTranslations('chat.share');
  const locale = useLocale();
  const qc = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  useDismiss(onClose, { containerRef: box });
  const { data } = useQuery({ queryKey: ['shares', chatId], queryFn: () => apiFetch<Shares>(`/api/v1/chats/${chatId}/shares`) });
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : '—');

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    try {
      const r = await apiFetch<{ url: string }>(`/api/v1/chats/${chatId}/shares`, { method: 'POST', body: JSON.stringify({ days: Number(f.get('days')), password: usePassword ? String(f.get('password')) : undefined }) });
      setUrl(r.url);
      await qc.invalidateQueries({ queryKey: ['shares', chatId] });
      await qc.invalidateQueries({ queryKey: ['chats'] });
    } catch (err) {
      setError((err as Error).message === 'conflict' ? t('tooMany') : (err as Error).message === 'invalid_input' ? t('nothing') : t('error'));
    }
  }
  async function revoke(id: number) {
    await apiFetch(`/api/v1/chats/${chatId}/shares/${id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['shares', chatId] });
    await qc.invalidateQueries({ queryKey: ['chats'] });
  }
  const pii = data ? data.pii.id_card + data.pii.phone : 0;

  return (
    <div role="dialog" aria-modal="true" aria-label={t('title')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={box} className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-5 shadow-lg">
        <div className="flex items-center gap-2"><Link2 className="size-5" aria-hidden="true" /><h2 className="flex-1 text-lg font-bold">{t('title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="flex size-9 items-center justify-center rounded-lg hover:bg-surface-2"><X className="size-5" aria-hidden="true" /></button></div>
        <p className="rounded-lg bg-warning-050 px-3 py-2 text-sm text-warning">{t('warning')}</p>
        {pii > 0 && (
          <p role="alert" className="flex gap-2 rounded-lg bg-danger-050 px-3 py-2 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t('pii', { idCard: data!.pii.id_card, phone: data!.pii.phone })}</p>
        )}
        {url ? (
          <div className="flex flex-col gap-2">
            <p role="status" className={noticeClass}>{t('created')}</p>
            <div className="flex gap-2">
              <input readOnly value={url} aria-label={t('link')} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className={`${secondaryBtn} shrink-0 whitespace-nowrap`} onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}><Copy className="size-4" aria-hidden="true" />{copied ? t('copied') : t('copy')}</button>
            </div>
            <p className="text-xs text-muted">{t('shownOnce')}</p>
          </div>
        ) : (
          <form onSubmit={create} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">{t('expires')}
              <select name="days" defaultValue={data?.default_days ?? 30} className="h-11 rounded-[10px] border border-border-strong bg-surface px-2 font-normal">
                {[7, 30, 90, 180, 365].map((d) => <option key={d} value={d}>{t('days', { n: d })}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} className="size-4 accent-primary" />{t('usePassword')}</label>
            {usePassword && <label className="flex flex-col gap-1 text-sm font-medium">{t('password')}<PasswordInput name="password" autoComplete="new-password" minLength={6} /></label>}
            {error && <p role="alert" className={errorClass}>{error}</p>}
            <div><button type="submit" className={primaryBtn}>{t('create')}</button></div>
          </form>
        )}
        {data && data.shares.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="font-semibold">{t('active')}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {data.shares.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <span>{t('item', { date: day(s.expires_at), views: s.view_count })}{s.has_password ? ` · ${t('locked')}` : ''}</span>
                  <button type="button" className="text-danger hover:underline" onClick={() => void revoke(s.id)}>{t('revoke')}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
