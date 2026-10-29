import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KbIndexFrame, KbList } from '@/components/kb/KbIndex';
import { listTemplates } from '@/lib/kb';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('kb'))('templatesTitle') };
}

export default async function TemplatesPage() {
  const [t, items] = await Promise.all([getTranslations('kb'), listTemplates()]);
  return (
    <KbIndexFrame title={t('templatesTitle')} intro={t('templatesIntro')}>
      <KbList kind="template" items={items} />
    </KbIndexFrame>
  );
}
