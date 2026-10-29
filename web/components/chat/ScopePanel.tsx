'use client';
import { useTranslations } from 'next-intl';

export type CategoryOption = { code: string; name: string; hasContent: boolean };

// Legal scope (FR-CHAT-011): "automatic" lets the assistant choose; otherwise the answer is drawn only from the ticked categories.
// Only categories that have content in the knowledge library are offered, so a choice never promises something it cannot find.
export function ScopePanel({ categories, value, onChange }: { categories: CategoryOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations('chat.scope');
  const shown = categories.filter((c) => c.hasContent);
  const auto = value.length === 0;
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  return (
    <fieldset className="mb-2 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
      <legend className="sr-only">{t('title')}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex items-center gap-2 font-medium">
          <input type="radio" name="scope-mode" checked={auto} onChange={() => onChange([])} className="size-4 accent-primary" />
          {t('auto')}
        </label>
        <button type="button" onClick={() => onChange(shown.map((c) => c.code))} className="text-primary-700 hover:underline">{t('all')}</button>
        <span className="text-xs text-muted">{t('hint')}</span>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <label key={c.code} className="flex items-center gap-2">
            <input type="checkbox" checked={value.includes(c.code)} onChange={() => toggle(c.code)} className="size-4 accent-primary" />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
