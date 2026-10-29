'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { PasswordInput } from '@/components/account/PasswordInput';
import { errorClass, inputClass, noticeClass } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';
import { hardNavigate } from '@/lib/client/nav';
import { apiFetch } from '@/lib/client/api';
import { applyServerSettings } from '@/lib/client/settings';

type Mode = 'login' | 'register';

function safeTarget(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
}

export function AuthForm({ mode, guestLimit, mailLive = false }: { mode: Mode; guestLimit: number; mailLive?: boolean }) {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const target = safeTarget(params.get('next'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));

    if (mode === 'login') {
      const result = await authClient.signIn.email({ email, password, rememberMe: form.get('remember') === 'on' });
      setPending(false);
      if (result.error) {
        const code = result.error.code;
        setError(
          code === 'ACCOUNT_LOCKED' ? t('errorLocked')
          : code === 'EMAIL_NOT_VERIFIED' ? t('errorUnverified')
          : result.error.status === 429 ? t('errorTooMany')
          : result.error.status === 401 ? t('errorInvalid')
          : t('errorGeneric'),
        );
        return;
      }
      if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        hardNavigate(`/two-factor?next=${encodeURIComponent(target)}`);
        return;
      }
      await applyServerSettings();
      hardNavigate(target);
      return;
    }

    if (form.get('accept') !== 'on') {
      setPending(false);
      return setError(t('consentRequired'));
    }
    const result = await authClient.signUp.email({ email, password, name: String(form.get('name')), callbackURL: target });
    setPending(false);
    // An address that already has an account gets the same neutral screen as a new one (no account enumeration, FR-AUTH-001 AC2)
    if (result.error?.code?.startsWith('USER_ALREADY_EXISTS')) return setCheckEmail(email);
    if (result.error) return setError(result.error.status === 429 ? t('errorTooMany') : t('errorGeneric'));
    // Signed in straight away → record the consent given on this form; otherwise it is asked again at first sign-in.
    const signedIn = Boolean((result.data as { token?: string | null } | null)?.token);
    if (signedIn) {
      await Promise.all([
        apiFetch('/api/v1/me/consents', { method: 'POST', body: JSON.stringify({ purpose: 'service_terms', granted: true }) }),
        apiFetch('/api/v1/me/consents', { method: 'POST', body: JSON.stringify({ purpose: 'privacy_notice', granted: true }) }),
      ]).catch(() => undefined);
      hardNavigate(target);
    } else {
      setCheckEmail(email);
    }
  }

  async function continueAsGuest() {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.anonymous();
    setPending(false);
    if (result.error) return setError(t('errorGeneric'));
    hardNavigate('/chat');
  }

  if (checkEmail) return <VerifyPending email={checkEmail} target={target} />;

  return (
    <div className="flex w-full flex-col gap-5">
      <nav className="flex rounded-[10px] bg-surface-2 p-1" aria-label={t('loginTab')}>
        {(['login', 'register'] as const).map((m) => (
          <Link
            key={m}
            href={`${m === 'login' ? '/login' : '/register'}${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
            aria-current={mode === m ? 'page' : undefined}
            className={`flex h-[38px] flex-1 items-center justify-center rounded-lg text-sm ${
              mode === m ? 'bg-surface font-semibold text-text shadow-sm' : 'text-muted'
            }`}
          >
            {m === 'login' ? t('loginTab') : t('registerTab')}
          </Link>
        ))}
      </nav>

      {params.get('reason') === 'idle' && <p role="status" className={noticeClass}>{t('idleLoggedOut')}</p>}
      {params.get('reason') === 'deletion' && <p role="status" className={noticeClass}>{t('deletionRequested')}</p>}
      {params.get('deleted') === '1' && <p role="status" className={noticeClass}>{t('accountDeleted')}</p>}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === 'register' && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('name')}
            <input name="name" required maxLength={80} autoComplete="name" className={inputClass} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('email')}
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('password')}
          <PasswordInput name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 10} />
          {mode === 'register' && <span className="text-xs font-normal text-muted">{t('passwordHint')}</span>}
        </label>
        {mode === 'login' && (
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" name="remember" defaultChecked className="size-[18px] accent-primary" />
              {t('remember')}
            </label>
            {mailLive && <Link href="/forgot-password" className="text-sm text-primary-700 hover:underline">{t('forgotLink')}</Link>}
          </div>
        )}
        {mode === 'register' && (
          <label className="flex items-start gap-2 text-sm text-text">
            <input type="checkbox" name="accept" className="mt-0.5 size-[18px] shrink-0 accent-primary" />
            <span>
              {t.rich('acceptTerms', {
                terms: (c) => <Link href="/legal/terms" target="_blank" className="text-primary-700 underline">{c}</Link>,
                privacy: (c) => <Link href="/legal/privacy" target="_blank" className="text-primary-700 underline">{c}</Link>,
              })}
            </span>
          </label>
        )}
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-[10px] bg-primary text-base font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {mode === 'login' ? t('submitLogin') : t('submitRegister')}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t('or')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <button
        type="button"
        onClick={continueAsGuest}
        disabled={pending}
        className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-surface text-[0.9375rem] font-medium text-text hover:bg-surface-2 disabled:opacity-60"
      >
        {t('guest')}
        <span className="text-xs text-muted">({t('guestHint', { limit: guestLimit })})</span>
      </button>
      <p className="text-xs leading-relaxed text-muted">
        {t.rich('terms', {
          terms: (c) => <Link href="/legal/terms" className="underline">{c}</Link>,
          privacy: (c) => <Link href="/legal/privacy" className="underline">{c}</Link>,
        })}
      </p>
    </div>
  );
}

function VerifyPending({ email, target }: { email: string; target: string }) {
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);
  async function resend() {
    await authClient.sendVerificationEmail({ email, callbackURL: target });
    setSent(true);
  }
  return (
    <div className="flex w-full flex-col gap-5">
      <h2 className="font-serif text-2xl font-bold">{t('verifyTitle')}</h2>
      <p className="text-sm leading-relaxed">{t('verifyText', { email })}</p>
      {sent && <p role="status" className={noticeClass}>{t('resent')}</p>}
      <button type="button" onClick={resend} disabled={sent} className="h-11 rounded-[10px] border border-border-strong text-[0.9375rem] font-medium hover:bg-surface-2 disabled:opacity-60">
        {t('resend')}
      </button>
      <Link href="/login" className="text-sm text-primary-700 hover:underline">{t('backToLogin')}</Link>
    </div>
  );
}
