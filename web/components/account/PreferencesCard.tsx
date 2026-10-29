'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useState, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/client/api';
import { setLocaleCookie } from '@/lib/client/locale';
import { currentScale, setScaleCookie, type ServerSettings } from '@/lib/client/settings';
import { cardClass, errorClass } from './styles';

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" id={`seg-${label}`}>{label}</span>
      <div role="radiogroup" aria-labelledby={`seg-${label}`} className="flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-9 flex-1 rounded-lg px-3 text-sm ${value === o.value ? 'bg-surface font-semibold text-text shadow-sm' : 'text-muted hover:text-text'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PreferencesCard({ initial, local = false }: { initial: ServerSettings; local?: boolean }) {
  const t = useTranslations('settings.prefs');
  const router = useRouter();
  // Guests have no account row: their choices stay in this browser (cookie / localStorage) — FR-AUTH-023
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const [s, setS] = useState(initial);
  const [error, setError] = useState(false);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const view: ServerSettings = local
    ? { ...s, locale: locale as 'th' | 'en', theme: mounted ? ((theme ?? 'system') as ServerSettings['theme']) : 'system', text_scale: mounted ? currentScale() : 100 }
    : s;

  async function update(patch: Partial<ServerSettings>) {
    const prev = s;
    setS({ ...s, ...patch });
    setError(false);
    try {
      if (!local) await apiFetch('/api/v1/me/settings', { method: 'PATCH', body: JSON.stringify(patch) });
      if (patch.locale) { setLocaleCookie(patch.locale); router.refresh(); }
      if (patch.theme) setTheme(patch.theme);
      if (patch.text_scale) setScaleCookie(patch.text_scale);
    } catch {
      setS(prev);
      setError(true);
    }
  }

  return (
    <section className={cardClass} aria-labelledby="prefs-h">
      <h2 id="prefs-h" className="text-lg font-bold">{t('title')}</h2>
      <Segmented label={t('language')} value={view.locale} onChange={(v) => update({ locale: v })}
        options={[{ value: 'th', label: 'ไทย' }, { value: 'en', label: 'English' }]} />
      <Segmented label={t('theme')} value={view.theme} onChange={(v) => update({ theme: v })}
        options={[{ value: 'light', label: t('themeLight') }, { value: 'dark', label: t('themeDark') }, { value: 'system', label: t('themeSystem') }]} />
      <Segmented label={t('textSize')} value={view.text_scale} onChange={(v) => update({ text_scale: v })}
        options={[{ value: 100, label: t('size100') }, { value: 112, label: t('size112') }, { value: 125, label: t('size125') }, { value: 150, label: t('size150') }]} />
      {error && <p role="alert" className={errorClass}>{t('error')}</p>}
    </section>
  );
}
