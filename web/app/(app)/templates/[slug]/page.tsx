import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { expandKbMarkdown, KbFrame, KbMarkdown } from '@/components/kb/KbDocView';
import { TemplateWizard } from '@/components/kb/TemplateWizard';
import { getTemplate } from '@/lib/kb';
import { parseTemplate, templateIntro } from '@/lib/template-doc';

type Props = { params: Promise<{ slug: string }> };
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = SLUG.test(slug) ? await getTemplate(slug) : null;
  return { title: doc?.title ?? (await getTranslations('kb'))('templatesTitle') };
}

export default async function TemplatePage({ params }: Props) {
  const { slug } = await params;
  const doc = SLUG.test(slug) ? await getTemplate(slug) : null;
  if (!doc) notFound();
  const [t, expand] = await Promise.all([getTranslations('kb'), expandKbMarkdown()]);
  const form = parseTemplate(doc.bodyMd);
  const helpMd = Object.fromEntries((form?.fields ?? []).filter((f) => f.help).map((f) => [f.key, expand(f.help!)]));
  return (
    <KbFrame kind="template" title={doc.title} status={doc.status} askQuestion={doc.title} updatedAt={doc.updatedAt}
      crumbs={[{ label: t('templatesTitle'), href: '/templates' }, { label: doc.title }]}
      save={{ type: 'template', id: doc.slug, title: doc.title }}>
      {form && <TemplateWizard slug={slug} form={form} helpMd={helpMd} />}
      <KbMarkdown md={form ? templateIntro(doc.bodyMd) : doc.bodyMd} />
    </KbFrame>
  );
}
