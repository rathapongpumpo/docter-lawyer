import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContentList } from '@/components/admin/ContentList';
import { requireSection } from '@/lib/admin';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.nav'))('content') };
}

export default async function Page() {
  await requireSection('content');
  return <ContentList />;
}
