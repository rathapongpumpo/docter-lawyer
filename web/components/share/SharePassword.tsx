'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { PasswordInput } from '@/components/account/PasswordInput';
import { errorClass, primaryBtn } from '@/components/account/styles';
import { CSRF_HEADER, readCsrfCookie } from '@/lib/csrf';

export function SharePassword({ token }: { token: string }) {
  const t = useTranslations('share');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get('password'));
    const res = await fetch(`/api/v1/share/${token}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', [CSRF_HEADER]: readCsrfCookie() }, body: JSON.stringify({ password }) });
    if (res.ok) return router.refresh();
    setError(res.status === 429 ? t('lockedText') : res.status === 401 ? t('wrongPassword') : t('error'));
    if (res.status === 429) router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <h1 className="font-serif text-2xl font-bold">{t('passwordTitle')}</h1>
      <p className="text-muted">{t('passwordText')}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">{t('password')}<PasswordInput name="password" autoComplete="off" minLength={1} /></label>
      {error && <p role="alert" className={errorClass}>{error}</p>}
      <div><button type="submit" className={primaryBtn}>{t('open')}</button></div>
    </form>
  );
}
