import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KbIndexFrame, KbList } from '@/components/kb/KbIndex';
import { listGuides } from '@/lib/kb';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('kb'))('guidesTitle') };
}

export default async function GuidesPage() {
  const [t, items] = await Promise.all([getTranslations('kb'), listGuides()]);
  return (
    <KbIndexFrame title={t('guidesTitle')} intro={t('guidesIntro')}>
      <KbList kind="guide" items={items} />
    </KbIndexFrame>
  );
}
