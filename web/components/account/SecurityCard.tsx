'use client';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { PasswordInput } from './PasswordInput';
import { cardClass, dangerBtn, errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from './styles';

type SessionRow = { token: string; userAgent?: string | null; createdAt: Date | string; isCurrent: boolean };

export function SecurityCard({ twoFactorEnabled, isStaff }: { twoFactorEnabled: boolean; isStaff: boolean }) {
  return (
    <section className={cardClass} aria-labelledby="sec-h">
      <SecurityHeader />
      <ChangePassword />
      <TwoFactor enabled={twoFactorEnabled} isStaff={isStaff} />
      <Sessions />
    </section>
  );
}

function SecurityHeader() {
  const t = useTranslations('settings.security');
  return <h2 id="sec-h" className="text-lg font-bold">{t('title')}</h2>;
}

function ChangePassword() {
  const t = useTranslations('settings.security');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const { error } = await authClient.changePassword({
      currentPassword: String(f.get('current')),
      newPassword: String(f.get('next')),
      revokeOtherSessions: true,
    });
    if (error) return setMsg({ ok: false, text: error.code === 'INVALID_PASSWORD' ? t('wrongPassword') : t('error') });
    form.reset();
    setMsg({ ok: true, text: t('passwordChanged') });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="font-semibold">{t('changePassword')}</h3>
      <label className="flex flex-col gap-1.5 text-sm font-medium">{t('currentPassword')}<PasswordInput name="current" autoComplete="current-password" minLength={1} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">{t('newPassword')}<PasswordInput name="next" autoComplete="new-password" /></label>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
      <div><button type="submit" className={secondaryBtn}>{t('changePassword')}</button></div>
    </form>
  );
}

function TwoFactor({ enabled, isStaff }: { enabled: boolean; isStaff: boolean }) {
  const t = useTranslations('settings.security');
  const [on, setOn] = useState(enabled);
  const [step, setStep] = useState<'idle' | 'password' | 'scan' | 'codes' | 'disable'>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get('password'));
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    if (err || !data || !('totpURI' in data)) return setError(err?.code === 'INVALID_PASSWORD' ? t('wrongPassword') : t('error'));
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 192 }));
    setCodes(data.backupCodes);
    setStep('scan');
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    if (err) return setError(t('codeInvalid'));
    setOn(true);
    setStep('codes');
  }
  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get('password'));
    const { error: err } = await authClient.twoFactor.disable({ password });
    if (err) return setError(err.code === 'INVALID_PASSWORD' ? t('wrongPassword') : t('error'));
    setOn(false);
    setStep('idle');
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5" aria-hidden="true" />
        {t('twoFactor')}
        <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${on ? 'bg-success-050 text-success' : 'bg-surface-2 text-muted'}`}>{on ? t('on') : t('off')}</span>
      </h3>
      <p className="text-sm text-muted">{isStaff ? t('twoFactorStaff') : t('twoFactorHint')}</p>

      {step === 'idle' && !on && <div><button type="button" className={primaryBtn} onClick={() => setStep('password')}>{t('enable')}</button></div>}
      {step === 'idle' && on && <div><button type="button" className={secondaryBtn} onClick={() => setStep('disable')}>{t('disable')}</button></div>}

      {(step === 'password' || step === 'disable') && (
        <form onSubmit={step === 'password' ? start : disable} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">{t('confirmWithPassword')}<PasswordInput name="password" autoComplete="current-password" minLength={1} /></label>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className={step === 'disable' ? dangerBtn : primaryBtn}>{step === 'disable' ? t('disable') : t('continue')}</button>
            <button type="button" className={secondaryBtn} onClick={() => { setStep('idle'); setError(null); }}>{t('cancel')}</button>
          </div>
        </form>
      )}

      {step === 'scan' && (
        <form onSubmit={confirm} className="flex flex-col gap-3">
          <p className="text-sm">{t('scanText')}</p>
          {qr && <Image src={qr} alt={t('qrAlt')} width={192} height={192} unoptimized className="rounded-lg border border-border bg-white p-1" />}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('enterCode')}
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" className={`${inputClass} max-w-48 text-center font-mono text-lg tracking-widest`} />
          </label>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <div><button type="submit" className={primaryBtn}>{t('verify')}</button></div>
        </form>
      )}

      {step === 'codes' && (
        <div className="flex flex-col gap-3">
          <p role="status" className={noticeClass}>{t('enabledDone')}</p>
          <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4" aria-hidden="true" />{t('backupTitle')}</p>
          <p className="text-sm text-muted">{t('backupText')}</p>
          <ul className="grid max-w-sm grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((c) => <li key={c} className="rounded-lg bg-surface-2 px-3 py-1.5">{c}</li>)}
          </ul>
          <div><button type="button" className={secondaryBtn} onClick={() => setStep('idle')}>{t('savedCodes')}</button></div>
        </div>
      )}
    </div>
  );
}

function Sessions() {
  const t = useTranslations('settings.security');
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: async (): Promise<SessionRow[]> => {
      const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
      const currentToken = current.data?.session.token;
      return (list.data ?? []).map((s) => ({ token: s.token, userAgent: s.userAgent, createdAt: s.createdAt, isCurrent: s.token === currentToken }));
    },
  });
  const reload = () => qc.invalidateQueries({ queryKey: ['auth-sessions'] });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="font-semibold">{t('sessions')}</h3>
      {!rows ? <p className="text-sm text-muted">…</p> : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.token} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{(r.userAgent ?? '—').slice(0, 80)}{r.isCurrent && <b className="ml-2 text-primary-700">{t('thisDevice')}</b>}</span>
              {!r.isCurrent && (
                <button type="button" className="text-danger hover:underline" onClick={async () => { await authClient.revokeSession({ token: r.token }); await reload(); }}>{t('revoke')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 1 && (
        <div><button type="button" className={secondaryBtn} onClick={async () => { await authClient.revokeOtherSessions(); await reload(); }}>{t('revokeOthers')}</button></div>
      )}
    </div>
  );
}
