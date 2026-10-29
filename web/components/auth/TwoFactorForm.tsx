'use client';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, inputClass, primaryBtn } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';
import { hardNavigate } from '@/lib/client/nav';
import { applyServerSettings } from '@/lib/client/settings';

export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const code = String(form.get('code')).replace(/\s/g, '');
    const trustDevice = form.get('trust') === 'on';
    const { error: err } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setPending(false);
    if (err) return setError(t('twoFactorInvalid'));
    await applyServerSettings();
    hardNavigate(next); // full load: picks up the saved locale, theme and text size
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h2 className="font-serif text-2xl font-bold">{t('twoFactorTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{backup ? t('twoFactorBackupText') : t('twoFactorText')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {backup ? t('backupCode') : t('totpCode')}
          <input
            key={String(backup)}
            name="code"
            required
            autoFocus
            inputMode={backup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={backup ? 24 : 6}
            pattern={backup ? undefined : '[0-9]{6}'}
            className={`${inputClass} text-center font-mono text-lg tracking-widest`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trust" className="size-[18px] accent-primary" />
          {t('trustDevice')}
        </label>
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <button type="submit" disabled={pending} className={primaryBtn}>{t('twoFactorSubmit')}</button>
      </form>
      <button type="button" onClick={() => { setBackup((v) => !v); setError(null); }} className="text-left text-sm text-primary-700 hover:underline">
        {backup ? t('useApp') : t('useBackup')}
      </button>
    </div>
  );
}
