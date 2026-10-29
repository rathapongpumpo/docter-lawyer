'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { inputClass, noticeClass, primaryBtn, errorClass } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [state, setState] = useState<'idle' | 'pending' | 'sent' | 'error'>('idle');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('pending');
    const email = String(new FormData(e.currentTarget).get('email'));
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    // Same answer whether or not the address exists (no account enumeration); only transport errors show.
    setState(error && error.status !== 400 ? 'error' : 'sent');
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h2 className="font-serif text-2xl font-bold">{t('forgotTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('forgotText')}</p>
      </div>
      {state === 'sent' ? (
        <p role="status" className={noticeClass}>{t('forgotSent')}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('email')}
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          {state === 'error' && <p role="alert" className={errorClass}>{t('errorGeneric')}</p>}
          <button type="submit" disabled={state === 'pending'} className={primaryBtn}>{t('forgotSubmit')}</button>
        </form>
      )}
      <Link href="/login" className="text-sm text-primary-700 hover:underline">{t('backToLogin')}</Link>
    </div>
  );
}
