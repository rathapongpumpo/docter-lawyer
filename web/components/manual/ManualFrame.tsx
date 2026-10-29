import { Hammer } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

/** Scrolling page body shared by the manual pages (same frame as the knowledge-base pages). */
export function ManualFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
      <div className={`mx-auto flex w-full ${wide ? 'max-w-6xl' : 'max-w-4xl'} flex-col gap-8 px-4 py-8 sm:px-6 print:max-w-none print:gap-5 print:py-0`}>{children}</div>
    </div>
  );
}

/** Notice for a test system with draft content — text comes from i18n. */
export async function ManualDraftNotice() {
  const [t, locale] = await Promise.all([getTranslations('manual'), getLocale()]);
  return (
    <div className="flex flex-col gap-2">
      <p role="note" className="rounded-xl border border-warning/40 bg-warning-050 px-4 py-3 text-[0.9375rem] leading-relaxed text-text">
        <span className="mr-2 rounded-md bg-surface px-1.5 py-0.5 text-xs font-semibold text-warning">{t('draftTag')}</span>
        {t('testNotice')}
      </p>
      {locale !== 'th' && <p className="text-sm text-muted">{t('thaiOnly')}</p>}
    </div>
  );
}

/** Shown while web/content/manual/manual.th.json does not exist yet. */
export async function ManualPending() {
  const t = await getTranslations('manual');
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-6">
      <Hammer className="mt-1 size-6 shrink-0 text-primary-700" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-bold">{t('pendingTitle')}</h2>
        <p className="text-muted">{t('pendingText')}</p>
      </div>
    </div>
  );
}
