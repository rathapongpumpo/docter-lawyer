import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { KbFrame } from '@/components/kb/KbDocView';
import { getLawPage } from '@/lib/kb-library';
import { sectionPath } from '@/lib/kb-refs';

type Props = { params: Promise<{ code: string }> };
const CODE = /^[a-z0-9_]{1,40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const data = CODE.test(code) ? await getLawPage(code) : null;
  return { title: data?.law.title ?? (await getTranslations('kb'))('statutes') };
}

export default async function LawPage({ params }: Props) {
  const { code } = await params;
  const data = CODE.test(code) ? await getLawPage(code) : null;
  if (!data) notFound();
  const [t, format] = await Promise.all([getTranslations('kb'), getFormatter()]);
  const { law, version, sections } = data;
  return (
    <KbFrame kind="law" title={law.title} status={version.status} askQuestion={law.title}
      crumbs={[{ label: t('statutes'), href: '/law' }, { label: law.shortName }]}
      subtitle={<span className="text-sm">{version.label}{version.effectiveFrom && ` · ${t('effectiveFrom')} ${format.dateTime(new Date(`${version.effectiveFrom}T00:00:00+07:00`), { dateStyle: 'long' })}`}</span>}>
      {law.officialUrl && (
        <a href={law.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-primary-700 underline">
          {t('officialSource')}<ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg font-bold">{t('sectionCount', { count: sections.length })}</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {sections.map((s) => (
            <li key={s.no}>
              <Link href={sectionPath(law.code, s.path)} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="w-14 shrink-0 font-serif font-bold text-primary-700">{s.no}</span>
                <span className="line-clamp-2 text-sm text-muted">{s.preview}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </KbFrame>
  );
}
