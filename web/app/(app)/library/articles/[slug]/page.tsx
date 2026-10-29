import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KbFrame, KbMarkdown } from '@/components/kb/KbDocView';
import { getArticle } from '@/lib/kb';

type Props = { params: Promise<{ slug: string }> };
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = SLUG.test(slug) ? await getArticle(slug) : null;
  return { title: doc?.title ?? (await getTranslations('kb'))('articles'), description: doc?.summary ?? undefined };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const doc = SLUG.test(slug) ? await getArticle(slug) : null;
  if (!doc) notFound();
  const t = await getTranslations('kb');
  return (
    <KbFrame kind="article" title={doc.title} subtitle={doc.summary} status={doc.status} askQuestion={doc.title} updatedAt={doc.updatedAt}
      crumbs={[{ label: t('libraryTitle'), href: '/library' }, { label: doc.title }]}
      save={{ type: 'article', id: doc.slug, title: doc.title }}>
      <KbMarkdown md={doc.bodyMd} />
    </KbFrame>
  );
}
