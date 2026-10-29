'use client';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client/api';
import { hardNavigate } from '@/lib/client/nav';
import { PasswordInput } from './PasswordInput';
import { cardClass, dangerBtn, errorClass, secondaryBtn } from './styles';

type Consent = { purpose: string; version: string; grantedAt: string };

type Dsr = { id: number; type: string; status: string; dueAt: string };

export function PrivacyCard({ consents, currentVersions, pendingDeletionAt, requests }: {
  consents: Consent[]; currentVersions: Record<string, string>; pendingDeletionAt: string | null; requests: Dsr[];
}) {
  const t = useTranslations('settings.privacy');
  const locale = useLocale();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const [pending, setPending] = useState<string | null>(pendingDeletionAt);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestDeletion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get('password'));
    try {
      const r = await apiFetch<{ scheduled_at: string }>('/api/v1/me/deletion', { method: 'POST', body: JSON.stringify({ password }) });
      setPending(r.scheduled_at);
      hardNavigate('/login?reason=deletion'); // sessions were revoked server-side
    } catch (err) {
      setError((err as Error).message === 'forbidden' ? t('wrongPassword') : t('error'));
    }
  }
  async function cancelDeletion() {
    try {
      await apiFetch('/api/v1/me/deletion', { method: 'DELETE' });
      setPending(null);
    } catch {
      setError(t('error'));
    }
  }

  return (
    <section className={cardClass} aria-labelledby="priv-h">
      <h2 id="priv-h" className="text-lg font-bold">{t('title')}</h2>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('consents')}</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {consents.filter((c) => c.purpose in currentVersions).map((c) => (
            <li key={c.purpose} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <Link href={c.purpose === 'service_terms' ? '/legal/terms' : '/legal/privacy'} className="text-primary-700 hover:underline">{t(`purpose.${c.purpose}` as never)}</Link>
              <span className="text-muted">{c.version} · {fmt(c.grantedAt)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('withdrawNote')}</p>
      </div>

      {requests.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="font-semibold">{t('requests')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <span>{t(`dsrType.${r.type}` as never)}</span>
                <span className="text-muted">{t(`dsrStatus.${r.status}` as never)}{r.status === 'in_progress' || r.status === 'received' ? ` · ${t('dueBy')} ${fmt(r.dueAt)}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="font-semibold">{t('export')}</h3>
        <p className="text-sm text-muted">{t('exportText')}</p>
        <div>
          <a href="/api/v1/me/export" download className={secondaryBtn}>
            <Download className="size-4" aria-hidden="true" />
            {t('exportButton')}
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-semibold text-danger">{t('delete')}</h3>
        {pending ? (
          <>
            <p role="status" className="rounded-lg bg-warning-050 px-3 py-2 text-sm text-warning">{t('deletionScheduled', { date: fmt(pending) })}</p>
            <div><button type="button" onClick={cancelDeletion} className={secondaryBtn}>{t('cancelDeletion')}</button></div>
          </>
        ) : confirming ? (
          <form onSubmit={requestDeletion} className="flex flex-col gap-3">
            <p className="text-sm">{t('deleteConfirm')}</p>
            <label className="flex flex-col gap-1.5 text-sm font-medium">{t('confirmWithPassword')}<PasswordInput name="password" autoComplete="current-password" minLength={1} /></label>
            {error && <p role="alert" className={errorClass}>{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className={dangerBtn}>{t('deleteButton')}</button>
              <button type="button" className={secondaryBtn} onClick={() => { setConfirming(false); setError(null); }}>{t('cancel')}</button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm text-muted">{t('deleteText')}</p>
            <div><button type="button" onClick={() => setConfirming(true)} className={dangerBtn}>{t('deleteButton')}</button></div>
          </>
        )}
        {error && !confirming && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </section>
  );
}
