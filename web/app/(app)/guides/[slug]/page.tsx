import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import { expandKbMarkdown, KbFrame } from '@/components/kb/KbDocView';
import { GuideBody, type GuideBodySegment } from '@/components/kb/GuideBody';
import { roleOf } from '@/lib/api/handler';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { parseGuide } from '@/lib/guide-doc';
import { getGuide } from '@/lib/kb';
import { getGlossaryTips } from '@/lib/kb-library';

type Props = { params: Promise<{ slug: string }> };
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = SLUG.test(slug) ? await getGuide(slug) : null;
  return { title: doc?.title ?? (await getTranslations('kb'))('guidesTitle'), description: doc?.summary ?? undefined };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const doc = SLUG.test(slug) ? await getGuide(slug) : null;
  if (!doc) notFound();
  const [t, expand, glossary, session] = await Promise.all([
    getTranslations('kb'), expandKbMarkdown(), getGlossaryTips(), auth.api.getSession({ headers: await headers() }),
  ]);
  const member = !!session && roleOf(session) !== 'guest';
  let initial: { checked: string[]; completed: boolean } | null = null;
  if (member) {
    const [row] = (await db.execute<{ checked_items: string[]; completed_at: string | null }>(sql`
      SELECT checked_items, completed_at::text FROM app.guide_progress WHERE user_id = ${Number(session!.user.id)} AND guide_slug = ${slug}`)).rows;
    initial = { checked: row?.checked_items ?? [], completed: !!row?.completed_at };
  }
  const segments: GuideBodySegment[] = parseGuide(doc.bodyMd).map((s) =>
    s.type === 'md'
      ? { type: 'md', md: expand(s.md) }
      : s.type === 'docs'
        ? { type: 'docs', items: s.items.map((i) => ({ key: i.key, md: expand(i.md) })) }
        : {
            type: 'steps',
            items: s.items.map((i, n) => ({
              key: i.key,
              md: expand(i.md),
              ask: t('askStep', { title: doc.title, n: n + 1 }),
            })),
          },
  );
  return (
    <KbFrame kind="guide" title={doc.title} subtitle={doc.summary} status={doc.status} askQuestion={doc.title} updatedAt={doc.updatedAt}
      crumbs={[{ label: t('guidesTitle'), href: '/guides' }, { label: doc.title }]}
      save={{ type: 'guide', id: doc.slug, title: doc.title }}>
      <GuideBody slug={slug} segments={segments} initial={initial} glossary={glossary} />
    </KbFrame>
  );
}
