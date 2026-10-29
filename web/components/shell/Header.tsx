'use client';
import { LogOut, PanelLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { LanguageSwitch, ThemeSwitch } from './PreferenceControls';
import { useShell } from './shell-context';

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const t = useTranslations('header');
  const { user } = useShell();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = user.isGuest ? t('guest') : user.name;
  const initials = displayName.slice(0, 2);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  async function logout() {
    try { sessionStorage.removeItem('lc_chat_draft'); } catch { /* storage may be blocked */ }
    await authClient.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 px-3 sm:px-5">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={t('toggleSidebar')}
        className="flex size-10 items-center justify-center rounded-lg text-text hover:bg-surface-2"
      >
        <PanelLeft className="size-5" aria-hidden="true" />
      </button>
      <div className="flex-1" />
      <ThemeSwitch />
      <LanguageSwitch />
      <div ref={menuRef} className="relative ml-1">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t('userMenu')}
          className="flex h-11 items-center gap-2 rounded-full border border-border bg-surface py-0 pr-1 pl-1 text-sm shadow-[0_4px_14px_-6px_rgba(14,42,76,0.35)] sm:pr-4"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="hidden max-w-40 truncate md:inline">{displayName}</span>
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-[10px] border border-border bg-surface p-1.5 shadow-lg">
            <p className="truncate px-2.5 py-2 text-[0.8125rem] font-semibold">{displayName}</p>
            <div className="my-1 border-t border-border" />
            {(
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] hover:bg-surface-2"
              >
                <Settings className="size-4" aria-hidden="true" />
                {t('settings')}
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] hover:bg-surface-2"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {t('logout')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
