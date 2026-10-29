'use client';
import { Clock, RefreshCw } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { hardNavigate } from '@/lib/client/nav';
import { apiFetch } from '@/lib/client/api';

const WARN_SECONDS = 300;
const POLL_MS = 5 * 60 * 1000;

// Session countdown (AI-EDW pattern): resets on user activity; warns five minutes before the idle timeout (FR-AUTH-016),
// then signs out. A slow poll also notices an expired session and a newer deployed build.
export function Footer({ version, build, idleTimeoutMin }: { version: string; build: string; idleTimeoutMin: number }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [remaining, setRemaining] = useState(idleTimeoutMin * 60);
  const [newBuild, setNewBuild] = useState(false);
  const leaving = useRef(false);

  const leave = useCallback(
    async (reason: 'idle' | 'expired') => {
      if (leaving.current) return;
      leaving.current = true;
      try { await authClient.signOut(); } catch { /* session may already be gone */ }
      hardNavigate(`/login?reason=${reason}&next=${encodeURIComponent(pathname)}`);
    },
    [pathname],
  );

  useEffect(() => {
    const reset = () => setRemaining((s) => (s > 0 ? idleTimeoutMin * 60 : s));
    const tick = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    const events = ['keydown', 'pointerdown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [idleTimeoutMin]);

  useEffect(() => {
    if (remaining === 0) void leave('idle');
  }, [remaining, leave]);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const s = await apiFetch<{ build: string }>('/api/v1/session');
        if (s.build !== build) setNewBuild(true);
      } catch (err) {
        if ((err as Error).message === 'unauthenticated') void leave('expired');
      }
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [build, leave]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const warning = remaining > 0 && remaining <= WARN_SECONDS;
  return (
    <>
      {newBuild && (
        <div role="status" className="fixed right-4 bottom-12 z-40 flex items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 text-sm shadow-lg">
          <RefreshCw className="size-4 text-primary-700" aria-hidden="true" />
          {t('footer.newVersion')}
          <button type="button" onClick={() => window.location.reload()} className="font-semibold text-primary-700 underline">{t('footer.reload')}</button>
        </div>
      )}
      {warning && (
        <div role="alert" className="fixed right-4 bottom-12 z-50 flex max-w-sm flex-col gap-3 rounded-2xl border border-border-strong bg-surface p-4 shadow-lg">
          <p className="font-semibold">{t('footer.idleWarning', { time: `${mm}:${ss}` })}</p>
          <button
            type="button"
            onClick={() => setRemaining(idleTimeoutMin * 60)}
            className="h-11 rounded-[10px] bg-primary font-semibold text-white hover:bg-primary-600"
          >
            {t('footer.stay')}
          </button>
        </div>
      )}
      <footer className="flex h-8 shrink-0 items-center justify-between gap-4 px-4 text-xs text-muted">
        <span>v{version}</span>
        <span className="hidden truncate sm:inline">{t('app.disclaimer')}</span>
        <span className="flex items-center gap-1" title={t('footer.session')}>
          <Clock className="size-3.5" aria-hidden="true" />
          <span aria-label={t('footer.session')}>
            {mm}:{ss}
          </span>
        </span>
      </footer>
    </>
  );
}
