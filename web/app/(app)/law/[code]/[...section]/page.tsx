import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { KbFrame } from '@/components/kb/KbDocView';
import { getLawSection } from '@/lib/kb';
import { StatuteText } from '@/components/law/StatuteText';
import { sectionPath } from '@/lib/kb-refs';

type Props = { params: Promise<{ code: string; section: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, section } = await params;
  const data = await getLawSection(decodeURIComponent(code), section.map(decodeURIComponent).join('/'));
  const t = await getTranslations('kb');
  return { title: data ? t('section', { law: data.law.shortName, section: data.section.sectionNo }) : t('statutes') };
}

// /law/ccc/381 · /law/ccc/193/34 — section numbers may contain "/" so the route is a catch-all.
export default async function LawSectionPage({ params }: Props) {
  const { code, section } = await params;
  const data = await getLawSection(decodeURIComponent(code), section.map(decodeURIComponent).join('/'));
  if (!data) notFound();
  const [t, format] = await Promise.all([getTranslations('kb'), getFormatter()]);
  const { law, section: s, version } = data;
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00+07:00`), { dateStyle: 'long' });
  return (
    <KbFrame
      kind="law"
      title={t('section', { law: law.title, section: s.sectionNo })}
      status={version.status}
      askQuestion={t('askSection', { law: law.shortName, section: s.sectionNo })}
      crumbs={[{ label: t('statutes'), href: '/law' }, { label: law.shortName, href: `/law/${law.code}` }, { label: t('sectionLink', { section: s.sectionNo }) }]}
      save={{ type: 'law_section', id: `${law.code}/${s.sectionNo}`, title: t('section', { law: law.shortName, section: s.sectionNo }) }}
    >
      <StatuteText body={s.body} anchors paragraphLabel={(n) => t('paragraph', { n: String(n) })} />

      <dl className="grid gap-x-4 gap-y-2 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">{t('version')}</dt>
        <dd>{version.label}</dd>
        <dt className="font-semibold">{t('effectiveFrom')}</dt>
        <dd>{s.effectiveFrom ? date(s.effectiveFrom) : t('effectiveUnknown')}</dd>
        <dt className="font-semibold">{t('source')}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          {s.sourceId && <span>{s.sourceId}</span>}
          {s.officialUrl && (
            <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-700 underline">
              {t('officialSource')}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </dd>
        {s.notes.length > 0 && (
          <>
            <dt className="font-semibold">{t('notes')}</dt>
            <dd className="text-muted">{s.notes.join(' · ')}</dd>
          </>
        )}
      </dl>

      {data.citedBy.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{t('citedBy')}</h2>
          <ul className="flex flex-col gap-1.5">
            {data.citedBy.map((a) => (
              <li key={a.slug}>
                <Link href={`/library/articles/${a.slug}`} className="text-primary-700 underline underline-offset-2">
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="flex justify-between gap-2 text-sm">
        {data.prev ? (
          <Link href={sectionPath(law.code, data.prev)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 hover:bg-surface-2">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('prev', { section: data.prev })}
          </Link>
        ) : (
          <span />
        )}
        {data.next && (
          <Link href={sectionPath(law.code, data.next)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 hover:bg-surface-2">
            {t('next', { section: data.next })}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </KbFrame>
  );
}
