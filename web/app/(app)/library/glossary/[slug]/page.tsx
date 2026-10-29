import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KbFrame, KbMarkdown } from '@/components/kb/KbDocView';
import { getGlossaryTerm } from '@/lib/kb-library';
import { sectionPath } from '@/lib/kb-refs';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const term = /^[a-z0-9-]{1,120}$/.test((await params).slug) ? await getGlossaryTerm((await params).slug) : null;
  return { title: term?.term ?? (await getTranslations('kb'))('glossaryTitle') };
}

export default async function GlossaryTermPage({ params }: Props) {
  const { slug } = await params;
  const term = /^[a-z0-9-]{1,120}$/.test(slug) ? await getGlossaryTerm(slug) : null;
  if (!term) notFound();
  const t = await getTranslations('kb');
  return (
    <KbFrame kind="glossary" title={term.term} subtitle={term.termEn ?? undefined} status={term.status} askQuestion={term.term}
      crumbs={[{ label: t('libraryTitle'), href: '/library' }, { label: t('glossaryTitle'), href: '/library/glossary' }, { label: term.term }]}
      save={{ type: 'glossary', id: term.slug, title: term.term }}>
      <p className="text-[1.0625rem] leading-relaxed">{term.def}</p>
      {term.longDefMd && <KbMarkdown md={term.longDefMd} glossarySkip={[term.slug]} />}
      {term.aliases.length > 0 && <p className="text-sm text-muted">{t('alsoCalled')} {term.aliases.join(', ')}</p>}
      {term.sections.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-serif text-lg font-bold">{t('relatedSections')}</h2>
          <ul className="flex flex-wrap gap-2">
            {term.sections.map((s) => (
              <li key={`${s.code}/${s.no}`}>
                <Link href={sectionPath(s.code, s.no)} className="inline-flex h-9 items-center rounded-lg border border-border px-3 font-serif hover:border-statute hover:bg-statute-050">
                  {t('section', { law: s.shortName, section: s.no })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </KbFrame>
  );
}
