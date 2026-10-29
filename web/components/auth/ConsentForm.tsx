'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';
import { hardNavigate } from '@/lib/client/nav';
import { apiFetch } from '@/lib/client/api';

export function ConsentForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (new FormData(e.currentTarget).get('accept') !== 'on') return setError(t('consentRequired'));
    setPending(true);
    try {
      for (const purpose of ['service_terms', 'privacy_notice']) {
        await apiFetch('/api/v1/me/consents', { method: 'POST', body: JSON.stringify({ purpose, granted: true }) });
      }
      hardNavigate(next);
    } catch {
      setPending(false);
      setError(t('errorGeneric'));
    }
  }

  async function decline() {
    await authClient.signOut();
    hardNavigate('/login');
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h2 className="font-serif text-2xl font-bold">{t('consentTitle')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('consentText')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" className="mt-0.5 size-[18px] shrink-0 accent-primary" />
          <span>
            {t.rich('acceptTerms', {
              terms: (c) => <Link href="/legal/terms" target="_blank" className="text-primary-700 underline">{c}</Link>,
              privacy: (c) => <Link href="/legal/privacy" target="_blank" className="text-primary-700 underline">{c}</Link>,
            })}
          </span>
        </label>
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <button type="submit" disabled={pending} className={primaryBtn}>{t('consentAccept')}</button>
        <button type="button" onClick={decline} className={secondaryBtn}>{t('consentDecline')}</button>
      </form>
    </div>
  );
}
