'use client';
import { MailWarning, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/client/api';

// Account-level notices shown above the page: unverified e-mail, and account deletion in its grace period.
export function AccountBanners({ email, unverified, deletionAt }: { email: string; unverified: boolean; deletionAt: string | null }) {
  const t = useTranslations('banners');
  const locale = useLocale();
  const router = useRouter();
  const [resent, setResent] = useState(false);
  const bar = 'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm bg-warning-050 text-warning';
  const link = 'font-semibold underline disabled:opacity-60';
  return (
    <>
      {deletionAt && (
        <div role="status" className={bar}>
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          <span>{t('deletion', { date: new Date(deletionAt).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }) })}</span>
          <button type="button" className={link} onClick={async () => { await apiFetch('/api/v1/me/deletion', { method: 'DELETE' }); router.refresh(); }}>{t('cancelDeletion')}</button>
        </div>
      )}
      {unverified && (
        <div role="status" className={bar}>
          <MailWarning className="size-4 shrink-0" aria-hidden="true" />
          <span>{t('unverified', { email })}</span>
          <button type="button" disabled={resent} className={link} onClick={async () => { await authClient.sendVerificationEmail({ email, callbackURL: '/chat?verified=1' }); setResent(true); }}>
            {resent ? t('resent') : t('resend')}
          </button>
        </div>
      )}
    </>
  );
}
