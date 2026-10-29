import { ExternalLink } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ReviewActions } from '@/components/admin/ReviewActions';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { KbMarkdown } from '@/components/kb/KbDocView';
import { StatuteText } from '@/components/law/StatuteText';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { sectionPath } from '@/lib/kb-refs';
import { CHECKLIST, CONTENT_TYPES, getReviewItem, type ContentType } from '@/lib/review';

const PUBLIC_URL: Partial<Record<ContentType, string>> = { article: '/library/articles/', guide: '/guides/', template: '/templates/' };

export default async function ReviewItemPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!(CONTENT_TYPES as readonly string[]).includes(type) || !/^\d+$/.test(id)) notFound();
  const item = await getReviewItem(type as ContentType, Number(id));
  if (!item) notFound();
  const [session, t, tk, format] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getTranslations('admin'),
    getTranslations('kb'),
    getFormatter(),
  ]);
  const role = roleOf(session) as 'editor' | 'reviewer' | 'admin';
  const date = (d: string) => format.dateTime(new Date(d.length === 10 ? `${d}T00:00:00+07:00` : d), { dateStyle: 'medium' });
  const publicUrl = item.slug && PUBLIC_URL[item.type] ? `${PUBLIC_URL[item.type]}${item.slug}` : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-2">
            <Link href="/admin/review" className="text-sm text-primary-700 hover:underline">
              {t('queueTitle')}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{t('type', { type: item.type })}</span>
              <StatusBadge status={item.status} />
            </div>
            <h1 className="font-serif text-2xl leading-snug font-bold text-navy dark:text-text">{item.title}</h1>
            {publicUrl && (
              <Link href={publicUrl} className="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline">
                {t('openPage')}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </header>

          <section className="rounded-xl border border-warning/40 bg-warning-050 p-4 text-sm">
            <h2 className="mb-1 font-semibold">{t('pending')}</h2>
            <p className="whitespace-pre-line">{item.pending || t('noPending')}</p>
          </section>

          {item.type === 'law_version' ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-bold">{t('sections', { count: item.sections.length })}</h2>
              {item.sections.map((s) => (
                <article key={s.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={sectionPath(item.lawCode ?? '', s.sectionNo)} className="font-serif font-bold hover:underline">
                      {tk('sectionLink', { section: s.sectionNo })}
                    </Link>
                    {s.sourceId && <span className="text-xs text-muted">{s.sourceId}</span>}
                    {s.effectiveFrom && <span className="text-xs text-muted">{t('sectionDate', { date: date(s.effectiveFrom) })}</span>}
                  </div>
                  <StatuteText compact body={s.body} paragraphLabel={(n) => tk('paragraph', { n: String(n) })} />
                  {s.notes.length > 0 && <p className="text-xs text-muted">{s.notes.join(' / ')}</p>}
                </article>
              ))}
            </section>
          ) : (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">{t('preview')}</h2>
              <div className="rounded-xl border border-border bg-surface p-5">
                <KbMarkdown md={item.bodyMd ?? ''} />
              </div>
            </section>
          )}
        </main>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-border bg-surface p-4">
            <ReviewActions
              type={item.type}
              id={item.id}
              status={item.status}
              role={role}
              checklist={CHECKLIST[item.type]}
              isSubmitter={!!item.lastSubmitterId && item.lastSubmitterId === Number(session?.user.id)}
              needsEffectiveDate={item.type === 'law_version'}
              effectiveFrom={item.effectiveFrom}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t('history')}</h2>
            {item.history.length === 0 ? (
              <p className="text-sm text-muted">{t('noHistory')}</p>
            ) : (
              <ol className="flex flex-col gap-2 border-l border-border pl-3">
                {item.history.map((h, i) => (
                  <li key={i} className="text-sm">
                    <p>
                      <span className="font-semibold">{t('action', { action: h.action })}</span>{' '}
                      <span className="text-muted">{h.actor}</span>
                    </p>
                    <p className="text-xs text-muted">{date(h.at)}</p>
                    {h.comment && <p className="mt-0.5 whitespace-pre-line">{h.comment}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
