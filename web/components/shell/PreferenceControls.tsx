'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/client/api';
import { setLocaleCookie } from '@/lib/client/locale';
import { useShell } from './shell-context';

const noop = () => () => {};

/** Members' header switches also save to the account (so the choice follows them to another device); guests stay local. */
function useSaveSetting() {
  const { user } = useShell();
  return (patch: { theme?: string; locale?: string }) => {
    if (!user.isGuest) void apiFetch('/api/v1/me/settings', { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => undefined);
  };
}
// next-themes only knows the stored theme after hydration; render the neutral state until then
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const segment = 'flex h-8 items-center justify-center rounded-md px-2 text-[0.8125rem] transition-colors';
const on = 'bg-surface text-text shadow-sm dark:bg-border-strong';
const off = 'text-muted hover:text-text';

/** Light / dark / system — always visible (header + auth pages), stored as `lc_theme`. */
export function ThemeSwitch() {
  const t = useTranslations('header');
  const { theme, setTheme } = useTheme();
  const save = useSaveSetting();
  const mounted = useMounted();
  const options = [
    { value: 'light', Icon: Sun, label: t('themeLight') },
    { value: 'dark', Icon: Moon, label: t('themeDark') },
    { value: 'system', Icon: Monitor, label: t('themeSystem') },
  ] as const;
  return (
    <div role="radiogroup" aria-label={t('theme')} className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
      {options.map(({ value, Icon, label }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => { setTheme(value); save({ theme: value }); }}
            className={`${segment} w-8 ${active ? on : off}`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** ไทย / English — stored in the `lc_locale` cookie; the server re-renders in the new language. */
export function LanguageSwitch() {
  const t = useTranslations('header');
  const locale = useLocale();
  const router = useRouter();
  const save = useSaveSetting();
  return (
    <div role="radiogroup" aria-label={t('language')} className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
      {(['th', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          lang={l}
          onClick={() => {
            if (l === locale) return;
            setLocaleCookie(l);
            save({ locale: l });
            router.refresh();
          }}
          className={`${segment} min-w-9 font-semibold ${locale === l ? on : off}`}
        >
          {l === 'th' ? 'ไทย' : 'EN'}
        </button>
      ))}
    </div>
  );
}
