'use client';
import { useTranslations } from 'next-intl';

const TONE: Record<string, string> = {
  in_review: 'bg-primary-050 text-primary-700',
  draft: 'bg-warning-050 text-warning',
  published: 'bg-success-050 text-success',
  archived: 'bg-surface-2 text-muted',
};

/** Client-side twin of StatusBadge (which is a server component). */
export function StatusPill({ status }: { status: string }) {
  const t = useTranslations('admin');
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[status] ?? TONE.archived}`}>{t('status', { status })}</span>;
}
