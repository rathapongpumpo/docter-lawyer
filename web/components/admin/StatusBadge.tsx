import { getTranslations } from 'next-intl/server';
import type { Status } from '@/lib/review';

const TONE: Record<Status, string> = {
  in_review: 'bg-primary-050 text-primary-700',
  draft: 'bg-warning-050 text-warning',
  published: 'bg-success-050 text-success',
  archived: 'bg-surface-2 text-muted',
};

export async function StatusBadge({ status }: { status: Status }) {
  const t = await getTranslations('admin');
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[status]}`}>{t('status', { status })}</span>;
}
