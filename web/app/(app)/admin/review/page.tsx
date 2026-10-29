import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { listQueue, type Status } from '@/lib/review';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin'))('queueTitle') };
}

export default async function ReviewQueuePage() {
  const [t, format, items] = await Promise.all([getTranslations('admin'), getFormatter(), listQueue()]);
  const count = (s: Status) => items.filter((i) => i.status === s).length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-[1.75rem] leading-tight font-bold text-navy dark:text-text">{t('queueTitle')}</h1>
          <p className="max-w-[70ch] text-muted">{t('queueIntro')}</p>
          <dl className="mt-1 flex flex-wrap gap-2">
            {(['in_review', 'draft', 'published'] as const).map((s) => (
              <div key={s} className="flex items-baseline gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
                <dt className="text-sm text-muted">{t('status', { status: s })}</dt>
                <dd className="text-lg font-bold">{count(s)}</dd>
              </div>
            ))}
          </dl>
        </header>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('colType')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('colTitle')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('colStatus')}</th>
                <th className="hidden px-4 py-2.5 font-semibold md:table-cell">{t('colUpdated')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <tr key={`${i.type}:${i.id}`} className="hover:bg-surface-2">
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{t('type', { type: i.type })}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/review/${i.type}/${i.id}`} className="font-medium text-primary-700 hover:underline">
                      {i.title}
                    </Link>
                    {i.pending && <p className="mt-0.5 line-clamp-1 max-w-[60ch] text-xs text-muted">{i.pending}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-muted md:table-cell">
                    {format.dateTime(new Date(i.updatedAt), { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
