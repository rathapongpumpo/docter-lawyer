'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { PasswordInput } from '@/components/account/PasswordInput';
import { errorClass, noticeClass, primaryBtn } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm({ mailLive }: { mailLive: boolean }) {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const token = params.get('token');
  const invalidLink = !token || params.get('error') === 'INVALID_TOKEN';
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirm'))) return setError(t('passwordMismatch'));
    setError(null);
    setState('pending');
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
    if (err) {
      setState('idle');
      return setError(err.code === 'INVALID_TOKEN' ? t('resetInvalid') : t('errorGeneric'));
    }
    setState('done');
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <h2 className="font-serif text-2xl font-bold">{t('resetTitle')}</h2>
      {invalidLink ? (
        <>
          <p role="alert" className={errorClass}>{t('resetInvalid')}</p>
          {mailLive && <Link href="/forgot-password" className={primaryBtn}>{t('forgotTitle')}</Link>}
        </>
      ) : state === 'done' ? (
        <>
          <p role="status" className={noticeClass}>{t('resetDone')}</p>
          <Link href="/login" className={primaryBtn}>{t('submitLogin')}</Link>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('newPassword')}
            <PasswordInput name="password" autoComplete="new-password" />
            <span className="text-xs font-normal text-muted">{t('passwordHint')}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('confirmPassword')}
            <PasswordInput name="confirm" autoComplete="new-password" />
          </label>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <button type="submit" disabled={state === 'pending'} className={primaryBtn}>{t('resetSubmit')}</button>
        </form>
      )}
    </div>
  );
}
