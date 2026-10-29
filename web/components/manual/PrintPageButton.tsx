'use client';
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function PrintPageButton() {
  const t = useTranslations('manual');
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2 print:hidden">
      <Printer className="size-4" aria-hidden="true" />
      {t('print')}
    </button>
  );
}
